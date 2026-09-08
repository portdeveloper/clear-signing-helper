# Observed limitations

- OpenZeppelin export rejected a local-only fixture and missing production deployment binding/coverage. This is recorded as a failed export gate, not a pilot pass.
- Uniswap `SwapRouter` initialization exposed the payable `receive()` entrypoint as `UNSUPPORTED_ENTRYPOINT`; preview was therefore blocked before rendering the tuple fixture. This is an honest strict-portability/onboarding result requiring an explicit exclusion or descriptor treatment.
- No live deployment, wallet, broadcast, registry write, maintainer contact, or external review occurred.
