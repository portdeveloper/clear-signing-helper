# Clear-signing submission bundle

Descriptors use the pinned ERC-7730 v2 schema. The testsv2 files contain unsigned sample transactions and expected signing output in the registry v2 test format, validated against its pinned schema. The fixtures and renderings directories retain the original local review examples. Read portability.json for known consumer limitations; a passing local test is not wallet certification. Copy descriptors and testsv2 into registry/<entity>/ when submitting.

Verify deployed code and proxy mappings independently. Open a registry pull request with descriptors and examples: https://clearsigning.org/build/ . Registry review, attestations, and wallet availability are separate steps.
