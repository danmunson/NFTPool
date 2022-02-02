// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import {Credits} from "./Credits.sol";
import {NFTDispenser} from "./NFTDispenser.sol";
import {VRFClient} from "./VRFClient.sol";
import {WETHManager} from "./WETHManager.sol";
import {RandomNumberProcessor} from "../Utils/RandomNumberProcessor.sol";
import {SecurityBase} from "../Utils/SecurityBase.sol";

contract Pool is SecurityBase {
    Credits internal credits;
    NFTDispenser internal nftDispenser;
    VRFClient internal vrfClient;
    WETHManager internal wethManager;

    address public feeRecipient;
    uint256 public drawFee;
    mapping(uint256 => uint256) public creditFeeByQuantity;
    mapping(address => Reservation) internal reservations;

    uint256 public constant MAX_SLICES = 8;

    struct Reservation {
        address user;
        uint256 quantity;
        bytes32 requestId;
        uint256 randomSeed;
        uint256 drawsOccurred;
        uint256[MAX_SLICES] computedRarities;
    }

    constructor(
        // Pool
        address _eoaAdmin,
        address _feeRecipient,
        uint256 _drawFee,
        // Credits
        string memory _tokenUri,
        string memory _contractUri,
        // VRFClient
        address _vrfOracleAddress,
        address _linkTokenAddress,
        uint256 _vrfFee,
        bytes32 _vrfKeyHash,
        // WETHManager
        address _wethAddress
    ) {
        // ensure that MAX_SLICES definitions line up
        require(
            MAX_SLICES == RandomNumberProcessor.MAX_SLICES,
            "MAX_SLICE defs unequal"
        );

        // set admin
        eoaAdmin = _eoaAdmin;
        lock = false;

        // set fee info
        feeRecipient = _feeRecipient;
        drawFee = _drawFee;

        // initialize contracts
        credits = new Credits(
            _eoaAdmin,
            address(this), // _contractAadmin
            _tokenUri, // _uri
            _contractUri // _contractUri
        );
        nftDispenser = new NFTDispenser(
            _eoaAdmin,
            address(this) // _admin
        );
        vrfClient = new VRFClient(
            _eoaAdmin,
            address(this), // _admin
            _vrfOracleAddress, // _vrfAddress
            _linkTokenAddress, // _linkAddress
            _vrfFee, // _fee
            _vrfKeyHash // _keyHash
        );
        wethManager = new WETHManager(
            _wethAddress // _wethAddress
        );
    }

    /********* USER EXPERIENCE FUNCTIONS *********/

    /*
    Initiate the drawing process with a payment in WETH.

    Note:
        * assume:   (1) there are enough nfts to support the draw,
                    (2) if not, the claim process will handle it gracefully
    */
    function initiateDrawWithWeth(
        address _user,
        uint256 _quantity,
        bytes calldata _functionSignature,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) external noReentry {

        _validateDraw(_user, _quantity);

        // forward meta-transaction
        //      weth manager will ensure that fee recipient
        //      is the recipient specified in the meta transaction
        uint256 expectedAmount = _quantity * drawFee;
        wethManager.forwardMetaTransaction(
            expectedAmount,
            feeRecipient,
            _user,
            _functionSignature,
            _sigR,
            _sigS,
            _sigV
        );

        _initiateDraw(_user, _quantity);
    }

    /*
    Initiate a draw with credits

    Note: same assumptions as above apply
    */
    function initiateDrawWithCredits(
        address _user,
        uint256 _quantity,
        uint256[] memory _tokenIds,
        uint256[] memory _amounts
    ) external noReentry {

        _validateDraw(_user, _quantity);
        // will also check to see that user has appropriate balance
        credits.spendCredits(_user, _quantity, _tokenIds, _amounts);
        _initiateDraw(_user, _quantity);
    }

    /*
    Allow user to buy credits

    If user requests a quantity with a different rate associated,
    that's what they'll pay.
    */
    function buyCredits(
        address _user,
        uint256 _quantity,
        bytes calldata _functionSignature,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) external noReentry {

        _validateUser(_user);

        uint256 fee = drawFee;
        uint256 discountFee = creditFeeByQuantity[_quantity];
        if (discountFee > 0) {
            fee = discountFee;
        }

        uint256 expectedAmount = fee * _quantity;

        wethManager.forwardMetaTransaction(
            expectedAmount,
            feeRecipient,
            _user,
            _functionSignature,
            _sigR,
            _sigS,
            _sigV
        );

        // since the payment went through, we can mint credits
        credits.mintCredits(
            _user,
            credits.threshold(),
            _quantity
        );
    }

    /*
    Process a user's reservation once a random seed has been fulfilled.

    _maxToDraw provides a mechanism for breaking up fulfillment into multiple transactions
    in case gas limits become a problem.
    */
    function fulfillDraw(address _user, uint256 _maxToDraw) external {
        // perform preprocessing if necessary
        _preprocessFulfillDraw(_user);

        // don't allow a contract to claim NFTs
        // they could be malicious and consume all gas
        if (_isContract(_user)) {
            _refundUser(_user);
            return;
        }

        Reservation storage res = reservations[_user];
        
        for (uint i = 0; i < _maxToDraw; i++) {
            if (
                // ensure user has draws remaining
                res.drawsOccurred >= res.quantity ||
                // ensure that defaults are available
                nftDispenser.getIndexesByTier(0) == 0
            ) {
                break;
            }

            uint256 rarity = res.computedRarities[res.drawsOccurred];
            (uint256 tier, uint256 index) = _getNftSelectors(rarity, res.randomSeed);
            // send over the NFT!
            nftDispenser.dispenseNft(tier, index, _user);

            res.drawsOccurred += 1;
        }

        _postprocessFulfillDraw(_user);
    }

    /********* INTERNAL UTILITIES (STATE MODIFYING) *********/

    /*
    Request a random number and make a reservation
    */
    function _initiateDraw(
        address _user,
        uint256 _quantity
    ) internal {
        // make request for random number
        bytes32 requestId = vrfClient.requestRandomNumber();

        // given that the above succeeded, create a reservation
        // random seed will be 0 since it hasn't been assigned yet
        uint256[MAX_SLICES] memory computedRarities;
        reservations[_user] = Reservation({
            user: _user,
            quantity: _quantity,
            requestId: requestId,
            randomSeed: 0,
            drawsOccurred: 0,
            computedRarities: computedRarities
        });
    }

    /*
    If the randomSeed has not yet been captured, then...
        (1) store random seed
        (2) compute rarities
        (3) clean up the VRFClient
    */
    function _preprocessFulfillDraw(address _user) internal {
        Reservation storage res = reservations[_user];
        require(res.quantity > 0, "Reservation does not exist");

        // only compute if randomSeed hasn't been set yet
        if (res.randomSeed == 0) {
            uint256 randomSeed = _getRandomSeedForUser(_user);
            require(randomSeed != 0, "Random seed not ready");
            res.randomSeed = randomSeed;
            // compute and store rarities
            res.computedRarities = RandomNumberProcessor.getRarityLevels(
                randomSeed,
                res.quantity
            );
            // now that we have the random seed, delete the reference in vrfClient
            vrfClient.deleteReference(res.requestId);
        }
    }

    /*
    Check if the request has been completely fulfilled. If so...
        (1) pay out the deposit
        (2) delete the reservation
    */
    function _postprocessFulfillDraw(address _user) internal {
        Reservation storage res = reservations[_user];

        // if user has drawn AS MUCH AS they are allowed...
        if (res.drawsOccurred >= res.quantity) {
            delete reservations[_user];
        }
    }

    /*
    Refund the user for however many credits they have left
    */
    function _refundUser(address _user) internal {
        Reservation storage res = reservations[_user];
        // delete reference
        vrfClient.deleteReference(res.requestId);
        // ensure that we are not going to mint for a contract
        // if someone used a contract, that's against ToS
        if (!_isContract(_user)) {
            // mint the same number of credits as the number of draws the user has left
            credits.mintCredits(
                _user,
                credits.threshold(),
                res.quantity - res.drawsOccurred
            );
        }
        delete reservations[_user];
    }

    /********* INTERNAL VIEWS *********/

    function _getNftSelectors(
        uint256 rarity,
        uint256 randomSeed
    ) internal view returns (uint256, uint256) {

        bool[33] memory activeTiers = nftDispenser.getActiveTiers();
        uint256 selectedTier = 0;
        for (uint i = 0; i < rarity; i++) {
            // find the first, highest active tier
            if (activeTiers[rarity - i]) break;
        }

        uint256 index = randomSeed % nftDispenser.getIndexesByTier(selectedTier);
        return (selectedTier, index);
    }

    function _validateUser(address _user) internal view {
        require(!_isContract(_user), "User is contract");
    }

    function _validateDraw(address _user, uint256 _quantity) internal view {
        _validateUser(_user);
        require(_quantity > 0, "Quantity == 0");
        require(_quantity <= RandomNumberProcessor.MAX_SLICES, "Quantity > 8");
        require(!_userHasReservation(_user), "Reservation for user exists");
    }

    function _userHasReservation(address _user) internal view returns (bool) {
        Reservation storage res = reservations[_user];
        return (res.quantity != 0);
    }

    function _getRandomSeedForUser(address _user) internal view returns (uint256) {
        Reservation storage res = reservations[_user];
        return vrfClient.getRandomNumber(res.requestId);
    }

    /********* EXTERNAL VIEWS *********/

    function canFulfillReservation(address _user) external view returns (bool) {
        return _getRandomSeedForUser(_user) > 0;
    }

    function getReservationDetails(address _user) external view returns (
        address, uint256, uint256
    ) {
        Reservation storage res = reservations[_user];
        return (
            res.user,
            res.quantity,
            res.drawsOccurred
        );
    }

    function getPrivateReservationDetails(address _user) external view eoaAdminOnly returns (
        bytes32, uint256, uint256[MAX_SLICES] memory
    ) {
        Reservation storage res = reservations[_user];
        return (
            res.requestId,
            res.randomSeed,
            res.computedRarities
        );
    }

    function getSideContractAddresses() external view eoaAdminOnly returns (
        address, address, address, address
    ) {
        return (
            address(credits),
            address(nftDispenser),
            address(vrfClient),
            address(wethManager)
        );
    }

    /********* ADMIN *********/

    function updateFeeRecipient(address _feeRecipient) external eoaAdminOnly {
        feeRecipient = _feeRecipient;
    }

    function updateDrawFee(uint256 _fee) external eoaAdminOnly {
        drawFee = _fee;
    }

    function updateCreditFee(uint256 _quantity, uint256 _fee) external eoaAdminOnly {
        creditFeeByQuantity[_quantity] = _fee;
    }
    
    function refundUser(address _user) external eoaAdminOnly {
        _refundUser(_user);
    }
}