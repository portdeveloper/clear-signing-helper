# Custom layout reference project

This project intentionally uses `contracts/` and `specs/` instead of Foundry's
default `src/` and `test/` directories. Build artifacts are written to
`artifacts/`, and the CI profile keeps the optimizer settings explicit.

`CustomVault` has an initializer and a deposit/withdraw surface. The small
`CustomVaultProxy` records an implementation and admin so a caller can provide
an explicit proxy-to-implementation mapping when configuring clear signing;
the tests intentionally exercise the implementation directly and do not deploy
or broadcast a proxy.

```sh
FOUNDRY_PROFILE=ci forge test --root examples/custom-layout
FOUNDRY_PROFILE=ci forge build --root examples/custom-layout
```
