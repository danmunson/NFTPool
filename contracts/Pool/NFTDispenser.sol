pragma solidity >=0.8.0;
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC1155.sol";

struct NFT {
    address addr;
    uint256 tokenId;
    bool isErc1155;
    uint256 quantity;
    uint8 tier;
    uint256 index;
}

contract NFTDispenser {
    address internal admin;
    bool internal lock;
    // store the counts of active tiers
    bool[256] internal activeTiers;
    // tracks NFTs by reference
    mapping(bytes32 => NFT) internal trackedNfts;
    // tracks the tier that each nft belongs to
    bytes32[][256] internal nftRefsByTier;

    constructor(address _admin) {
        admin = _admin;
        lock = false;
    }

    modifier onlyAdmin {
        require(msg.sender == admin, "Must be admin");
        require(lock == false, "Contract is locked");
        lock = true;
        _;
        lock = false;
    }

    /*
    VIEWS
    */
    function getActiveTiers() external view returns (bool[256] memory) {
        return activeTiers;
    }

    function getIndexesByTier(uint8 _tier) external view returns (uint256) {
        bytes32[] storage refArray = nftRefsByTier[_tier];
        return refArray.length;
    }

    function getNftInfo(address _nftAddress, uint256 _tokenId ) external view returns (
        address, uint256, bool, uint256, uint8, uint256
    ) {
        bytes32 ref = getRef(_nftAddress, _tokenId);
        NFT storage nft = trackedNfts[ref];
        return (
            nft.addr,
            nft.tokenId,
            nft.isErc1155,
            nft.quantity,
            nft.tier,
            nft.index
        );
    }

    /*
    EXTERNAL USER FUNCTIONS
    */
    function setTier(
        address _nftAddress,
        uint256 _tokenId,
        bool _isErc1155,
        uint8 _tier
    ) external onlyAdmin {
        additiveUpdate(_nftAddress, _tokenId, _isErc1155, _tier);
    }

    function dispenseNft(uint8 _tier, uint256 _index, address _to) external onlyAdmin returns (bool) {
        // check bounds
        require(nftRefsByTier[_tier].length > _index, "Not enough NFTs in tier");

        bytes32 ref = nftRefsByTier[_tier][_index];
        NFT storage nft = trackedNfts[ref];

        // transfer and remove NFT
        bool transferred = transferOwnership(nft.addr, nft.tokenId, nft.isErc1155, _to, false);
        subtractiveUpdate(ref, false);

        return transferred;
    }

    /*
    ADMIN
    */
    function adminForceTransferNft(
        address _nftAddress,
        uint256 _tokenId,
        bool _isErc1155,
        address _to
    ) external onlyAdmin {

        transferOwnership(_nftAddress, _tokenId, _isErc1155, _to, true);
        bytes32 ref = getRef(_nftAddress, _tokenId);
        subtractiveUpdate(ref, true);
    }

    function adminForceRemoveNft(address _nftAddress, uint256 _tokenId) external onlyAdmin {
        bytes32 ref = getRef(_nftAddress, _tokenId);
        subtractiveUpdate(ref, true);
    }

    /*
    INTERNAL
    */
    function getRef(address _nftAddress, uint256 _tokenId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_nftAddress, _tokenId));
    }

    function balanceOfThis(
        address _nftAddress,
        uint256 _tokenId,
        bool _isErc1155
    ) internal view returns (uint256) {

        if (_isErc1155) {
            uint256 balance = IERC1155(_nftAddress).balanceOf(address(this), _tokenId);
            return balance;
        } else {
            address nftOwner = IERC721(_nftAddress).ownerOf(_tokenId);
            if (nftOwner == address(this)) {
                return 1;
            }
        }
        return 0;
    }

    function additiveUpdate(address _nftAddress, uint256 _tokenId, bool _isErc1155, uint8 _tier) internal {
        uint256 balance = balanceOfThis(_nftAddress, _tokenId, _isErc1155);
        require(balance > 0, "Not owner of NFT");

        bytes32 ref = getRef(_nftAddress, _tokenId);
        NFT storage nft = trackedNfts[ref];

        // check if nft doesn't exist yet
        if (nft.quantity == 0) {
            uint256 newNftIndex = nftRefsByTier[_tier].length;

            NFT memory newNft = NFT({
                addr: _nftAddress,
                tokenId: _tokenId,
                isErc1155: _isErc1155,
                quantity: balance,
                tier: _tier,
                index: newNftIndex
            });

            nftRefsByTier[_tier].push(ref);
            trackedNfts[ref] = newNft;
            activeTiers[_tier] = true;

        } else if (_isErc1155) {
            nft.quantity = balance;
        }
    }

    function subtractiveUpdate(bytes32 _ref, bool _fullRemove) internal {
        NFT storage nft = trackedNfts[_ref];
        uint8 tier = nft.tier;

        // ensure NFT exists, otherwise don't bother
        if (nft.quantity > 0) {

            if (nft.isErc1155 && nft.quantity > 1 && !_fullRemove) {
                // Simply reduce quantity by 1
                nft.quantity -= 1;

            } else {
                uint256 lastRefIndex = nftRefsByTier[tier].length - 1;

                if (nft.index != lastRefIndex) {
                    // Ref was not at end of list, so move last ref to this index, then pop
                    bytes32 lastRef = nftRefsByTier[tier][lastRefIndex];
                    nftRefsByTier[tier][nft.index] = lastRef;
                    // update the index of the NFT struct that was moved
                    NFT storage movedNft = trackedNfts[lastRef];
                    movedNft.index = nft.index;
                }

                // pop the last reference index (not needed in any case)
                // delete the NFT struct
                nftRefsByTier[tier].pop();
                delete trackedNfts[_ref];
            }

            // if nft was the last in it's tier, update activeTiers
            if (nftRefsByTier[tier].length == 0) {
                activeTiers[tier] = false;
            }
        }
    }

    function transferOwnership(
        address _address,
        uint256 _tokenId,
        bool _isErc1155,
        address _to,
        bool _transferAll
    ) internal returns (bool) {

        uint256 balance = balanceOfThis(_address, _tokenId, _isErc1155);
        if (balance == 0) {
            return false;
        }

        if (_isErc1155) {
            uint256 quantity = 1;
            if (_transferAll) {
                quantity = balance;
            }
            IERC1155(_address).safeTransferFrom(address(this), _to, _tokenId, quantity, "");

        } else {
            IERC721(_address).transferFrom(address(this), _to, _tokenId);
        }

        return true;
    }

    /*
    SAFE TRANSFER CALLBACKS
    */
    function onERC721Received(
        address _operator,
        address _from,
        uint256 _tokenId,
        bytes calldata _data
    ) external pure returns (bytes4) {

        return this.onERC721Received.selector;
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external pure returns (bytes4) {

        return this.onERC1155Received.selector;
    }
}