// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CustomAsset} from "../contracts/CustomAsset.sol";
import {CustomVault} from "../contracts/CustomVault.sol";

/// @notice Test suite for the non-default Foundry layout and `ci` profile.
contract CustomLayoutReferenceTest {
    address internal constant MANAGER = address(0x4001);
    address internal constant RECEIVER = address(0x4002);

    function testInitializedVaultRoundTrip() external {
        CustomAsset asset = new CustomAsset(1_000 ether, address(this));
        CustomVault vault = new CustomVault();
        vault.initialize(address(asset), MANAGER);
        require(vault.initialized(), "initialized");
        require(vault.manager() == MANAGER, "manager");
        require(asset.approve(address(vault), 100 ether), "approval");
        require(vault.deposit(100 ether, RECEIVER) == 100 ether, "deposit");
        require(vault.deposits(RECEIVER) == 100 ether, "shares");
    }

    function testWithdrawUsesCallerPosition() external {
        CustomAsset asset = new CustomAsset(1_000 ether, address(this));
        CustomVault vault = new CustomVault();
        vault.initialize(address(asset), MANAGER);
        require(asset.approve(address(vault), 75 ether), "approval");
        require(vault.deposit(75 ether, address(this)) == 75 ether, "deposit");
        uint256 before = asset.balanceOf(address(this));
        require(vault.withdraw(25 ether, RECEIVER) == 25 ether, "withdraw");
        require(asset.balanceOf(address(this)) == before, "caller balance");
        require(asset.balanceOf(RECEIVER) == 25 ether, "receiver balance");
    }
}
