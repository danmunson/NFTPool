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

    function transfer(address recipient, uint256 amount) public returns (bool) {}
}

contract WETHManager is SecurityBase {
    WETHMinimal weth;

    constructor(address _wethAddress, address _admin) {
        weth = WETHMinimal(_wethAddress);
        admin = _admin;
    }

    function validateFunctionCall(
        uint256 _expectedAmount,
        bytes calldata _functionCall
    ) internal {
        bytes32 _fsig = keccak256(bytes(_functionCall[:4]));
        (address _recipient, uint256 _amount) = abi.decode(_functionCall[4:], (address, uint256));
        // check function call
        require(
            _fsig == keccak256(abi.encodePacked(bytes4(keccak256("transfer(address,uint256)")))),
            "Transfer not target function"
        );
        // check recipient
        require(_recipient == address(this), "Transfer to wrong recipient");
        // check amount
        require(_amount == _expectedAmount, "Transfer is for wrong amount");
    }

    function forwardMetaTransaction(
        uint256 _expectedAmount,
        address _mtx_userAddress,
        bytes calldata _mtx_functionSignature,
        bytes32 _mtx_sigR,
        bytes32 _mtx_sigS,
        uint8 _mtx_sigV
    ) external secured {
        validateFunctionCall(_expectedAmount, _mtx_functionSignature);
        // WETH will revert on any issues
        weth.executeMetaTransaction(_mtx_userAddress, _mtx_functionSignature, _mtx_sigR, _mtx_sigS, _mtx_sigV);
    }

    function transfer(address _to, uint256 _amount) external secured {
        // WETH will revert on any issues
        weth.transfer(_to, _amount);
    }
}