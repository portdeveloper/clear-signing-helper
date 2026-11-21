// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice A mintable token with only what the swap needs.
contract PlainToken {
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @notice Sells `tokenOut` for `tokenIn` one for one. A nonzero `stopAt` caps the output and skips the check
/// that the full `amountOut` was delivered, the way Uniswap V3's sqrtPriceLimitX96 does in exactOutputSingle.
/// `deadline` is checked; `expires` is accepted and ignored, the way CoW EthFlow's invalidateOrder ignores validTo.
/// `deposit` takes `amount` of a token, or the value sent when `asset` is zero, where `amount` is ignored: the
/// way THORChain-style routers do, so an argument can be ignored on one branch and read on the other.
/// `pay` sends `tokenIn` to a list, the way Disperse does; any recipient, the swap itself included, is on screen.
contract StopSwap {
    PlainToken public immutable tokenIn;
    PlainToken public immutable tokenOut;
    uint256 public deposited;

    constructor(PlainToken input, PlainToken output) {
        tokenIn = input;
        tokenOut = output;
    }

    function buy(uint256 amountOut, uint256 amountInMaximum, uint256 stopAt, address recipient, uint256 deadline, uint256 expires) external {
        require(block.timestamp <= deadline, "expired");
        expires;
        uint256 delivered = stopAt == 0 || stopAt > amountOut ? amountOut : stopAt;
        if (stopAt == 0) require(delivered == amountOut, "partial");
        require(delivered <= amountInMaximum, "too much");
        tokenIn.transferFrom(msg.sender, address(this), delivered);
        tokenOut.transfer(recipient, delivered);
    }

    function deposit(address asset, uint256 amount) external payable {
        if (asset == address(0)) {
            require(msg.value > 0, "no value");
            deposited += msg.value;
        } else {
            PlainToken(asset).transferFrom(msg.sender, address(this), amount);
        }
    }

    function pay(address[] calldata recipients, uint256[] calldata values) external {
        for (uint256 i = 0; i < recipients.length; i++) tokenIn.transferFrom(msg.sender, recipients[i], values[i]);
    }
}
