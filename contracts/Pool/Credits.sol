// SPDX-License-Identifier: UNLICENSED
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
    string public contractURI;
    uint256 constant public threshold = 12;

    constructor(
        address _eoaAdmin,
        address _contractAdmin,
        string memory _uri,
        string memory _contractURI
    ) ERC1155(_uri) {

        eoaAdmin = _eoaAdmin;
        contractAdmin = _contractAdmin;
        lock = false;
        contractURI = _contractURI;
    }

    function setUris(
        string memory _uri,
        string memory _contractURI
    ) external eoaAdminOnly {
        _setURI(_uri);
        contractURI = _contractURI;
    }

    function tokenIsValid(uint256 _tokenId) internal pure returns (bool) {
        return (
            _tokenId != 0 &&
            _tokenId <= threshold &&
            threshold % _tokenId == 0
        );
    }

    function mintCredits(address _user, uint256 _tokenId, uint256 _amount) external anyAdmin {
        require(tokenIsValid(_tokenId), "Token ID not allowed");
        _mint(_user, _tokenId, _amount, "");
    }

    // It is up to the user to spend the right number of credits.
    function spendCredits(
        address _from,
        uint256 _purchaseQuantity,
        uint256[] memory _ids,
        uint256[] memory _amounts
    ) external contractAdminOnly {

        require(_ids.length == _amounts.length, "Tokens and amounts uneven");
        
        uint256 sum = 0;
        uint256 thresholdAmount = threshold * _purchaseQuantity;
        bool hasEnough = false;

        for (uint i = 0; i < _ids.length; i++) {
            sum += _ids[i] * _amounts[i];
            if (sum >= thresholdAmount) {
                hasEnough = true;
                break;
            }
        }

        require(hasEnough, "Credits are insufficient");

        // _burnBatch checks to make sure that balances are sufficient
        _burnBatch(_from, _ids, _amounts);
    }
}