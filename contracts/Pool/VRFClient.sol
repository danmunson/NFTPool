// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "../Utils/SecurityBase.sol";

contract VRFClient is SecurityBase, VRFConsumerBase {
    mapping(bytes32 => uint256) internal randomMap;
    uint256 public fee;
    bytes32 public keyHash;

    constructor (
        address _eoaAdmin,
        address _contractAdmin,
        address _vrfAddress,
        address _linkAddress,
        uint256 _fee,
        bytes32 _keyHash
    ) VRFConsumerBase(_vrfAddress, _linkAddress) {
        eoaAdmin = _eoaAdmin;
        contractAdmin = _contractAdmin;
        lock = false;
        fee = _fee;
        keyHash = _keyHash;
    }

    function updateFee(uint256 newFee) external eoaAdminOnly {
        fee = newFee;
    }

    function updateKeyhash(bytes32 newKeyHash) external eoaAdminOnly {
        keyHash = newKeyHash;
    }

    function deleteReference(bytes32 _key) external contractAdminOnly {
        delete randomMap[_key];
    }

    function requestRandomNumber() external contractAdminOnly noReentry returns (bytes32) {
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
        return requestRandomness(keyHash, fee);
    }

    function fulfillRandomness(bytes32 _requestId, uint256 _random) internal override {
        randomMap[_requestId] = _random;
    }

    function getRandomNumber(bytes32 _requestId) external view returns (uint256) {
        return randomMap[_requestId];
    }
}