# Duplicate contract identity reference project

Both `src/alpha/Registry.sol` and `src/beta/Registry.sol` define a contract
named `Registry`. The source path and contract name together are therefore the
identity a discovery tool must preserve. The test imports both with aliases and
checks that the two implementations remain independently addressable.

```sh
forge test --root examples/duplicate-contracts
forge build --root examples/duplicate-contracts
```
