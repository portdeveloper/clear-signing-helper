# Standard reference project

This is the main fixture for ABI discovery and descriptor scaffolding. `ClearToken`
inherits `admin` and `transferAdmin` from `AccessManaged`; `AssetVault` exposes
deposit, withdraw, and an admin-only emergency path; and `SwapRouter` contains
canonical overloads plus tuple and tuple-array parameters.

The tests cover token allowance flow, vault accounting, the inherited admin call,
router overload resolution, dynamic tuple arrays, and `bytes` members. They use
only Solidity `require` assertions.

```sh
forge test --root examples/standard
forge build --root examples/standard
```
