// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";

// this contract represents the extent of the behavior of the LINK contract as needed for testing
contract MockLINK {
    mapping(address => uint256) public balances;

    function setBalance(address addr, uint256 amount) external {
        balances[addr] = amount;
    }

    function balanceOf(address addr) public view returns (uint256) {
        return balances[addr];
    }

    function transferAndCall(address to, uint256 fee, bytes memory c) external {
        require(balanceOf(msg.sender) >= fee, "Fee exceeds balance");
        balances[msg.sender] = balances[msg.sender] - fee;
        balances[to] = balances[to] + fee;
    }
}

// this contract represents the extent of the behavior of the VRF Oracle as needed for testing
contract MockVRFOracle {
    function submitRandomness(address consumerAddress, bytes32 requestId, uint256 randomness) external {
        VRFConsumerBase(consumerAddress).rawFulfillRandomness(requestId, randomness);
    }
}

contract TestVRFConsumer {
    mapping(bytes32 => uint256) public randoms;

    function rawFulfillRandomness(bytes32 requestId, uint256 randomness) external {
        randoms[requestId] = randomness;
    }
}