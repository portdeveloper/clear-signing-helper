# Registry compatibility corpus

Source: https://github.com/ethereum/clear-signing-erc7730-registry/tree/0318f9a51ec4fc7ba4aed6de5e315c8884d1fe38

`corpus.json` records all 278 top-level calldata submissions in that snapshot, their 1,435 function entries after resolving local includes, deployments, and 605 v2 raw transaction examples. It separately counts 104 top-level EIP-712 descriptors, which this calldata test does not claim to implement. `sources` contains SHA-256 hashes of the original input files.

Only signatures and deployment metadata are used to generate new descriptions. Upstream intent strings, field formatting rules, hiding rules, token mappings, and other curated semantics are not generator inputs. The original raw transaction bytes are retained, including all suffix bytes.

`verified-abis.json` separately contains ABIs fetched from the Sourcify v2 API for four deployed registry addresses on 2026-09-07. Each entry includes the exact URL, address, chain, and verification match status. These test actual parameter names and mutability, which cannot be recovered from registry format keys alone.

Tests use these local snapshots and do not contact the registry or Sourcify. To refresh the snapshot intentionally:

```sh
npm run registry:snapshot -- /path/to/clear-signing-erc7730-registry
```

Registry data is CC0-1.0; the upstream dedication is included as `LICENSE.md`. Counts are pinned regression expectations. Updating the snapshot requires reviewing changed counts and compatibility results.
