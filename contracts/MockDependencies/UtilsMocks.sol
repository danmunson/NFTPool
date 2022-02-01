// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import {RandomNumberProcessor} from "../Utils/RandomNumberProcessor.sol";
import {SecurityBase} from "../Utils/SecurityBase.sol";

contract RNPTester {
    uint constant MAX_SLICES = 8;

    function getRarityLevels(
        uint random,
        uint numRequested
    ) external pure returns (uint[MAX_SLICES] memory) {
        return RandomNumberProcessor.getRarityLevels(random, numRequested);
    }

    function _getRarity(uint number) external pure returns (uint) {
        return RandomNumberProcessor._getRarity(number);
    }

    function _getSlices(
        uint random,
        uint numOfSlices
    ) external pure returns (uint[MAX_SLICES] memory) {
        return RandomNumberProcessor._getSlices(random, numOfSlices);
    }

    function _getSliceFromUint(
        uint number,
        uint inclusiveStart, // >= 0
        uint numBits // <= 256
    ) external pure returns (uint) {
        return RandomNumberProcessor._getSliceFromUint(number, inclusiveStart, numBits);
    }

    function _getMask(
        uint inclusiveStart,
        uint exclusiveEnd
    ) external pure returns (uint) {
        return RandomNumberProcessor._getMask(inclusiveStart, exclusiveEnd);
    }
}

contract Secured is SecurityBase {
    MaliciousContract internal maliciousContract;

    constructor(address _eoaAdmin, address _contractAdmin) {
        eoaAdmin = _eoaAdmin;
        contractAdmin = _contractAdmin;
        maliciousContract = new MaliciousContract();
    }

    function testReentry() external noReentry {
        maliciousContract.receiveAndCall();
    }

    function eoaView() external view eoaAdminOnly returns (bool) {
        return true;
    }

    function contractView() external view contractAdminOnly returns (bool) {
        return true;
    }

    function anyAdminView() external view anyAdmin returns (bool) {
        return true;
    }

    function isContract() external view returns (bool) {
        return _isContract(address(maliciousContract));
    }
}

contract MaliciousContract {
    function receiveAndCall() external {
        Secured(msg.sender).testReentry();
    }
}