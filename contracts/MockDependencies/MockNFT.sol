// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

// this contract represents the extent of the behavior of an ERC721 as is needed for testing

contract MockNFT is ERC721 {
    constructor() ERC721("Test", "TestNFT") {}

    function mint(uint256 tokenId) external {
        _mint(msg.sender, tokenId);
    }
}