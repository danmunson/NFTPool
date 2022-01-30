// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

abstract contract SecurityBase {
    address internal admin;
    bool internal lock;

    modifier secured {
        require(msg.sender == admin, "Must be admin");
        require(lock == false, "Contract is locked");
        lock = true;
        _;
        lock = false;
    }

    modifier noReentry {
        require(lock == false, "Contract is locked");
        lock = true;
        _;
        lock = false;
    }

    modifier adminOnly {
        require(msg.sender == admin, "Must be admin");
        _;
    }

    function _isContract(address addr) internal view returns (bool) {
        // credit @ppenzepplin Address.sol
        // will not work if address was sourced via an external call
        // that was made by a contract
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }
}