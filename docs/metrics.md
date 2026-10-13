# Recorded usage measurements

`generation.metrics` is optional. Its shape is defined in `scripts/schema.ts` and exported to `schemas/metadata.json` and `schemas/run.json`.

- `time` is either `null` or an object with `kind` and `duration_ms`. The kind is `model` or `elapsed`. Model time excludes tools and agent startup; elapsed time covers the recorded attempt. Do not label one as the other.
- `tokens` records `input`, `cached`, `output`, and `total`. Each count can be `null` when unavailable.
- `cost` is an optional approximate amount in USD, converted from the provider dashboard when necessary. The report displays it as `Cost (USD)` and preserves unknown values as `Unknown`.
- Measurements must be nonnegative safe integers. Zero means a measured zero, not missing data.

Preserve the reported total instead of recomputing it. Providers and harnesses differ in how they account for cache and reasoning tokens. Do not count reasoning tokens twice. Missing historical measurements display as `Unknown`; do not rewrite old evidence to add defaults.

The gallery, run page, and comparison use the same recorded values. These measurements describe a run, not a model score.
