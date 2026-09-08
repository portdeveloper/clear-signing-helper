// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ICustomAsset {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address owner, address recipient, uint256 amount) external returns (bool);
}

/// @notice A vault with a custom source path and explicit initialization call.
contract CustomVault {
    ICustomAsset public asset;
    address public manager;
    bool public initialized;
    mapping(address account => uint256) public deposits;

    event Initialized(address indexed manager, address indexed asset);
    event Deposit(address indexed caller, address indexed receiver, uint256 amount);
    event Withdraw(address indexed caller, address indexed receiver, uint256 amount);

    function initialize(address assetToken, address initialManager) external {
        require(!initialized, "already initialized");
        require(assetToken != address(0) && initialManager != address(0), "zero address");
        asset = ICustomAsset(assetToken);
        manager = initialManager;
        initialized = true;
        emit Initialized(initialManager, assetToken);
    }

    function deposit(uint256 amount, address receiver) external returns (uint256 shares) {
        require(initialized, "not initialized");
        require(receiver != address(0), "zero receiver");
        require(asset.transferFrom(msg.sender, address(this), amount), "transfer in");
        deposits[receiver] += amount;
        emit Deposit(msg.sender, receiver, amount);
        return amount;
    }

    function withdraw(uint256 amount, address receiver) external returns (uint256 assets) {
        require(receiver != address(0), "zero receiver");
        require(deposits[msg.sender] >= amount, "deposit");
        deposits[msg.sender] -= amount;
        require(asset.transfer(receiver, amount), "transfer out");
        emit Withdraw(msg.sender, receiver, amount);
        return amount;
    }
}
