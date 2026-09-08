// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Same contract name as beta/Registry.sol, with a distinct source identity.
contract Registry {
    string public constant namespace = "alpha";
    mapping(bytes32 key => address value) public entries;

    event Registered(bytes32 indexed key, address indexed value);

    function register(bytes32 key, address value) external {
        require(value != address(0), "zero value");
        entries[key] = value;
        emit Registered(key, value);
    }
}
