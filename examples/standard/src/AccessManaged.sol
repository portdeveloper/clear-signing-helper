// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Small local access-control base used to exercise inherited ABI entries.
abstract contract AccessManaged {
    address public admin;

    error Unauthorized();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }
}
