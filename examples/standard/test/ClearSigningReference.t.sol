// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AssetVault} from "../src/AssetVault.sol";
import {ClearToken} from "../src/ClearToken.sol";
import {SwapRouter} from "../src/SwapRouter.sol";

/// @notice Forge tests intentionally use plain require so this fixture has no forge-std dependency.
contract ClearSigningReferenceTest {
    address internal constant ALICE = address(0x1001);
    address internal constant BOB = address(0x1002);
    address internal constant TOKEN_IN = address(0x2001);
    address internal constant TOKEN_OUT = address(0x2002);

    function testTokenTransferApproveAndInheritedAdmin() external {
        ClearToken token = new ClearToken("Clear USD", "cUSD", 6, 1_000_000_000, address(this));
        require(token.decimals() == 6, "decimals");
        require(token.transfer(ALICE, 250_000), "transfer");
        require(token.balanceOf(ALICE) == 250_000, "alice balance");
        require(token.approve(address(this), 75_000), "approve");
        require(token.transferFrom(address(this), BOB, 75_000), "transferFrom");
        require(token.balanceOf(BOB) == 75_000, "bob balance");
        token.mint(ALICE, 1_000);
        require(token.balanceOf(ALICE) == 251_000, "mint");
        token.transferAdmin(ALICE);
        require(token.admin() == ALICE, "admin transfer");
    }

    function testVaultDepositAndWithdraw() external {
        ClearToken token = new ClearToken("Clear USD", "cUSD", 6, 1_000_000, address(this));
        AssetVault vault = new AssetVault(address(token));
        require(token.approve(address(vault), 500_000), "vault approval");
        uint256 shares = vault.deposit(400_000, ALICE);
        require(shares == 400_000, "deposit shares");
        require(vault.sharesOf(ALICE) == 400_000, "alice shares");
        // Transfer ownership of the local position to the test caller for withdrawal.
        // A second deposit gives the caller a position that can be redeemed directly.
        uint256 ownShares = vault.deposit(100_000, address(this));
        require(ownShares == 100_000, "own shares");
        uint256 before = token.balanceOf(address(this));
        uint256 withdrawn = vault.withdraw(50_000, address(this), address(this));
        require(withdrawn == 50_000, "withdraw shares");
        require(token.balanceOf(address(this)) == before + 50_000, "vault balance");
        require(vault.totalAssets() == 450_000, "total assets");
    }

    function testRouterOverloadsTupleAndArrays() external {
        SwapRouter router = new SwapRouter();
        uint256 compact = router.swapExactTokensForTokens(12_000, TOKEN_IN, TOKEN_OUT);
        require(compact == 12_000, "compact overload");
        uint256 detailed = router.swapExactTokensForTokens(
            25_000,
            24_000,
            TOKEN_IN,
            TOKEN_OUT,
            ALICE
        );
        require(detailed == 25_000, "detailed overload");

        SwapRouter.RouteStep[] memory path = new SwapRouter.RouteStep[](2);
        path[0] = SwapRouter.RouteStep(address(0x3001), TOKEN_IN, TOKEN_OUT, 10_000, 9_000, hex"1234");
        path[1] = SwapRouter.RouteStep(address(0x3002), TOKEN_OUT, address(0x2003), 9_500, 9_000, hex"abcd");
        require(router.executeRoute(path, BOB) == 9_500, "tuple array");

        SwapRouter.Swap[] memory swaps = new SwapRouter.Swap[](2);
        swaps[0] = SwapRouter.Swap(TOKEN_IN, TOKEN_OUT, 1_000, 900);
        swaps[1] = SwapRouter.Swap(TOKEN_OUT, address(0x2003), 2_000, 1_800);
        uint256[] memory amounts = router.batchSwap(swaps, BOB);
        require(amounts.length == 2, "batch length");
        require(amounts[0] == 1_000 && amounts[1] == 2_000, "batch amounts");
    }
}
