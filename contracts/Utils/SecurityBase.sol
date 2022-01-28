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
}