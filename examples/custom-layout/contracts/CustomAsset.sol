// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Token fixture in a non-default `contracts` source directory.
contract CustomAsset {
    string public constant name = "Layout Dollar";
    string public constant symbol = "LAY";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address account => uint256 amount) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(uint256 supply, address recipient) {
        totalSupply = supply;
        balanceOf[recipient] = supply;
        emit Transfer(address(0), recipient, supply);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;
        emit Transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address owner, address recipient, uint256 amount) external returns (bool) {
        require(allowance[owner][msg.sender] >= amount, "allowance");
        require(balanceOf[owner] >= amount, "balance");
        allowance[owner][msg.sender] -= amount;
        balanceOf[owner] -= amount;
        balanceOf[recipient] += amount;
        emit Approval(owner, msg.sender, allowance[owner][msg.sender]);
        emit Transfer(owner, recipient, amount);
        return true;
    }
}
