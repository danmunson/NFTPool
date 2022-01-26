// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";

// this contract represents the extent of the behavior of the LINK contract as needed for testing
contract MockLINK {
    mapping(address => uint256) public balances;

    function setBalance(address addr, uint256 amount) external {
        balances[addr] = amount;
    }

    function balanceOf(address owner) external view returns (uint256) {
        return balances[owner];
    }

    function transferAndCall(address to, uint256 fee, bytes calldata c) external returns (bool) {
        require(balances[msg.sender] >= fee, "Fee exceeds balance");
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

// this is a contract used to test the oracle defined above
contract TestVRFConsumer {
    mapping(bytes32 => uint256) public randoms;

    function rawFulfillRandomness(bytes32 requestId, uint256 randomness) external {
        randoms[requestId] = randomness;
    }
}

interface IVRFClient {
    function requestRandomNumber() external returns (bytes32);
    function getRandomNumber(bytes32) external view returns (uint256);
    function updateFee(uint256) external;
    function updateKeyhash(bytes32) external;
}

// this contract is used to test the actual VRFClient
// it is needed to expose the requestID that is computed by the VRF client
contract TestVRFClientHost {
    address internal vrfClientAddress;
    mapping(uint256 => bytes32) internal requestIds;
    
    function setVrfClientAddress(address _address) external {
        vrfClientAddress = _address;
    }

    function makeRequest(uint256 id) external {
        bytes32 requestId = IVRFClient(vrfClientAddress).requestRandomNumber();
        requestIds[id] = requestId;
    }

    function getRequestId(uint256 id) external view returns (bytes32) {
        return requestIds[id];
    }

    function readRandom(uint256 id) external view returns (uint256) {
        bytes32 requestId = requestIds[id];
        return IVRFClient(vrfClientAddress).getRandomNumber(requestId);
    }

    function setFee(uint256 fee) external {
        IVRFClient(vrfClientAddress).updateFee(fee);
    }

    function setKeyhash(bytes32 keyhash) external {
        IVRFClient(vrfClientAddress).updateKeyhash(keyhash);
    }
}