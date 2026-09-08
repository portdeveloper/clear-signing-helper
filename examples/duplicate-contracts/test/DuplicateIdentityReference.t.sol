// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Registry as AlphaRegistry} from "../src/alpha/Registry.sol";
import {Registry as BetaRegistry} from "../src/beta/Registry.sol";

/// @notice Imports aliases make the duplicate source identities explicit in tests.
contract DuplicateIdentityReferenceTest {
    bytes32 internal constant KEY = keccak256("owner");
    address internal constant VALUE = address(0x5001);

    function testBothRegistriesHaveDistinctBehavior() external {
        AlphaRegistry alpha = new AlphaRegistry();
        BetaRegistry beta = new BetaRegistry();
        alpha.register(KEY, VALUE);
        beta.register(KEY, VALUE);
        require(alpha.entries(KEY) == VALUE, "alpha entry");
        require(beta.entries(KEY) == VALUE, "beta entry");
        require(keccak256(bytes(alpha.namespace())) == keccak256(bytes("alpha")), "alpha namespace");
        require(keccak256(bytes(beta.namespace())) == keccak256(bytes("beta")), "beta namespace");
    }

    function testBetaRejectsSecondRegistration() external {
        BetaRegistry beta = new BetaRegistry();
        beta.register(KEY, VALUE);
        (bool succeeded,) = address(beta).call(
            abi.encodeCall(BetaRegistry.register, (KEY, address(0x5002)))
        );
        require(!succeeded, "duplicate accepted");
    }
}
