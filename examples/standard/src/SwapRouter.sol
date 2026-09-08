// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessManaged} from "./AccessManaged.sol";

/// @notice A local router fixture with overloads, tuples, tuple arrays, and bytes.
contract SwapRouter is AccessManaged {
    struct RouteStep {
        address pool;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        bytes callData;
    }

    struct Swap {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
    }

    event SwapExecuted(
        address indexed caller,
        address indexed recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event RouteExecuted(address indexed caller, address indexed recipient, uint256 amountOut, uint256 stepCount);

    error EmptyRoute();
    error InvalidRecipient();
    error InvalidPath();

    /// @notice Five-argument form used by common router integrations.
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        address recipient
    ) external returns (uint256 amountOut) {
        _checkSwap(tokenIn, tokenOut, recipient);
        if (amountIn < amountOutMin) revert InvalidPath();
        amountOut = amountIn;
        emit SwapExecuted(msg.sender, recipient, tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @notice Compact overload for callers that use msg.sender as recipient.
    function swapExactTokensForTokens(uint256 amountIn, address tokenIn, address tokenOut)
        external
        returns (uint256 amountOut)
    {
        _checkSwap(tokenIn, tokenOut, msg.sender);
        amountOut = amountIn;
        emit SwapExecuted(msg.sender, msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    function executeRoute(RouteStep[] calldata steps, address recipient)
        external
        returns (uint256 amountOut)
    {
        if (steps.length == 0) revert EmptyRoute();
        if (recipient == address(0)) revert InvalidRecipient();
        for (uint256 i; i < steps.length; ++i) {
            RouteStep calldata step = steps[i];
            _checkSwap(step.tokenIn, step.tokenOut, recipient);
            if (step.amountIn < step.minAmountOut) revert InvalidPath();
            amountOut = step.amountIn;
        }
        emit RouteExecuted(msg.sender, recipient, amountOut, steps.length);
    }

    function executeRoute(RouteStep calldata step, address recipient)
        external
        returns (uint256 amountOut)
    {
        _checkSwap(step.tokenIn, step.tokenOut, recipient);
        if (step.amountIn < step.minAmountOut) revert InvalidPath();
        amountOut = step.amountIn;
        emit RouteExecuted(msg.sender, recipient, amountOut, 1);
    }

    function batchSwap(Swap[] calldata swaps, address recipient)
        external
        returns (uint256[] memory amountsOut)
    {
        if (recipient == address(0)) revert InvalidRecipient();
        amountsOut = new uint256[](swaps.length);
        for (uint256 i; i < swaps.length; ++i) {
            Swap calldata swap = swaps[i];
            _checkSwap(swap.tokenIn, swap.tokenOut, recipient);
            if (swap.amountIn < swap.minAmountOut) revert InvalidPath();
            amountsOut[i] = swap.amountIn;
        }
        uint256 totalAmountOut;
        for (uint256 i; i < amountsOut.length; ++i) totalAmountOut += amountsOut[i];
        emit RouteExecuted(msg.sender, recipient, totalAmountOut, swaps.length);
    }

    function _checkSwap(address tokenIn, address tokenOut, address recipient) internal pure {
        if (tokenIn == address(0) || tokenOut == address(0) || recipient == address(0)) {
            revert InvalidPath();
        }
        if (tokenIn == tokenOut) revert InvalidPath();
    }
}
