// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Metadata-only proxy fixture used to exercise explicit implementation mappings.
/// The reference project never deploys this contract or performs delegatecalls.
contract CustomVaultProxy {
    address public admin;
    address public implementation;

    event Upgraded(address indexed implementation);

    constructor(address implementation_, address admin_) {
        require(implementation_ != address(0) && admin_ != address(0), "zero address");
        implementation = implementation_;
        admin = admin_;
    }

    function upgradeTo(address implementation_) external {
        require(msg.sender == admin, "admin");
        require(implementation_ != address(0), "zero implementation");
        implementation = implementation_;
        emit Upgraded(implementation_);
    }
}
