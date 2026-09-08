// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Same contract name as alpha/Registry.sol, with different behavior.
contract Registry {
    string public constant namespace = "beta";
    mapping(bytes32 key => address value) public entries;

    event Registered(bytes32 indexed key, address indexed value);

    function register(bytes32 key, address value) external {
        require(value != address(0), "zero value");
        require(entries[key] == address(0), "already registered");
        entries[key] = value;
        emit Registered(key, value);
    }
}
