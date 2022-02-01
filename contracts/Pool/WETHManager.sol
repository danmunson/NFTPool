// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "../Utils/SecurityBase.sol";

abstract contract WETHMinimal {
    function executeMetaTransaction(
        address userAddress,
        bytes memory functionSignature,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) public payable returns (bytes memory) {}
}

contract WETHManager {
    WETHMinimal internal weth;

    constructor(address _wethAddress) {
        weth = WETHMinimal(_wethAddress);
    }

    function validateFunctionCall(
        uint256 _expectedAmount,
        address _expectedRecipient,
        bytes calldata _functionCall
    ) internal pure {
        bytes32 _fsig = keccak256(bytes(_functionCall[:4]));
        (address _recipient, uint256 _amount) = abi.decode(_functionCall[4:], (address, uint256));
        // check function call
        require(
            _fsig == keccak256(abi.encodePacked(bytes4(keccak256("transfer(address,uint256)")))),
            "Transfer not target function"
        );
        // check recipient
        require(_recipient == _expectedRecipient, "Transfer to wrong recipient");
        // check amount
        require(_amount == _expectedAmount, "Transfer is for wrong amount");
    }

    function forwardMetaTransaction(
        uint256 _expectedAmount,
        address _expectedRecipient,
        address _mtxUserAddress,
        bytes calldata _mtxFunctionSignature,
        bytes32 _mtxSigR,
        bytes32 _mtxSigS,
        uint8 _mtxSigV
    ) external {
        validateFunctionCall(_expectedAmount, _expectedRecipient, _mtxFunctionSignature);
        // WETH will revert on any issues
        weth.executeMetaTransaction(_mtxUserAddress, _mtxFunctionSignature, _mtxSigR, _mtxSigS, _mtxSigV);
    }
}