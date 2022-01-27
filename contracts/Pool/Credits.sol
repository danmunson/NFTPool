pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "../Utils/SecurityBase.sol";

/*
ERC-1155 standard token for tracking user credits.

Goals:
    * credits should be viewable/tradable on opensea
    * credits can be spent in place of raw weth
    * credits can be bought directly
*/

contract Credits is SecurityBase, ERC1155 {
    string public uri;
    uint8 public threshold = 12;

    constructor(address _admin, string memory _uri) ERC1155(_uri) {
        admin = _admin;
        uri = _uri;
    }

    function mintCredits(address _user, uint256 _tokenId, uint256 _amount) external secured {
        require(
            _tokenId <= threshold && _tokenId % threshold == 0,
            "Token ID not allowed"
        );
        _mint(_user, _tokenId, _amount, "");
    }

    // It is up to the user to spend the right number of credits.
    function spendCredits(
        address _from,
        uint256[] memory _ids,
        uint256[] memory _amounts
    ) external secured {

        require(_ids.length == _amounts.length, "IDs and amounts must be even");
        
        uint256 sum = 0;
        bool hasEnough = false;

        for (uint8 i = 0; i < _ids.length; i++) {
            sum += _ids[i] * _amounts[i];
            if (sum >= threshold) {
                hasEnough = true;
                break;
            }
        }

        require(hasEnough, "Credits are insufficient");

        // _burnBatch checks to make sure that balances are sufficient
        _burnBatch(_from, _ids, _amounts);
    }
}