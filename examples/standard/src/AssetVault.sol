// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessManaged} from "./AccessManaged.sol";

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice A deliberately small vault whose write calls have clear asset semantics.
contract AssetVault is AccessManaged {
    IERC20Like public immutable asset;
    mapping(address account => uint256 shares) public sharesOf;
    uint256 public totalAssets;

    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);

    error InvalidReceiver();
    error InsufficientShares();
    error TokenTransferFailed();

    constructor(address assetToken) {
        if (assetToken == address(0)) revert ZeroAddress();
        asset = IERC20Like(assetToken);
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        if (receiver == address(0)) revert InvalidReceiver();
        if (!asset.transferFrom(msg.sender, address(this), assets)) revert TokenTransferFailed();
        shares = assets;
        totalAssets += assets;
        sharesOf[receiver] += shares;
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        external
        returns (uint256 shares)
    {
        if (receiver == address(0)) revert InvalidReceiver();
        if (owner != msg.sender) revert Unauthorized();
        shares = assets;
        if (sharesOf[owner] < shares) revert InsufficientShares();
        sharesOf[owner] -= shares;
        totalAssets -= assets;
        if (!asset.transfer(receiver, assets)) revert TokenTransferFailed();
        emit Withdraw(msg.sender, receiver, assets, shares);
    }

    function emergencyWithdraw(address receiver, uint256 assets) external onlyAdmin {
        if (receiver == address(0)) revert InvalidReceiver();
        if (!asset.transfer(receiver, assets)) revert TokenTransferFailed();
    }
}
