# Capyboard implementation

## Workflow

- [x] Read the Principles section of the **poteto-mode** skill.
- [x] Phase A: Frame
- [x] Phase B: Design the workflow
- [x] Phase C: Run the loop
- [x] Phase D: Keep the audit trail
- [x] Phase E: Verify and hand back

## Scope and gates

Build F1 through F5 with Node.js and strict TypeScript tooling.
Keep browser code as vanilla JavaScript.
Verify import, immutable evidence, static routes, opt-in isolated previews, and two-run comparison on the real generated site.
Production deployment and genuine model content are separate launch gates.
The starting directory has no application or Git repository.
Do not commit, deploy, or spawn subagents without approval.

Architect skipped: the PRD fixes the static architecture and record boundaries. Parallel design delegation has not been approved. Keep the build sequential and review the actual files.

## Throughput checkpoint

- Blocking first steps. Test import and historical integrity before generating pages. Verify enforced HTTP preview headers before enabling previews.
- Independent workstreams. n/a: one owner, no approved fan-out.
- Shared mutable state. Import serializes content and ledger writes. Tests use separate temporary directories.
- Smallest safe decomposition. Five sequential units follow the PRD delivery sequence and each ends with a runnable check.

## Units

- [x] Evidence foundation. Add schemas, fixed challenge, import, integrity validation, labelled fixtures, and adversarial content tests.
- [x] Static gallery. Generate pages, assets, filters, sorting, and useful empty and not-found states.
- [x] Run inspection. Add escaped lazy evidence, byte-preserving downloads, isolated previews, and curation notices.
- [x] Comparison. Add two-run selection, URL reconstruction, equal viewports, and condition differences.
- [x] Launch preparation. Run browser containment and accessibility checks, inspect screenshots, document curation and hosting, and record launch blockers.

Suggest a Conventional Commit command after each green unit. Never run it without approval.
Keep decision evidence in decisions.tsv.

## Handoff

README.md and docs/curation.md document the working local and publication paths.
docs/verification.md records 24 content/build/CLI tests and 48 browser tests passing.
The 100-run shell totals 12,729 gzip bytes. Local HTTP routes and headers passed verification.

- [ ] Import genuine attempts from three identified models and review provenance.
- [ ] Deploy both HTTPS origins and verify their actual routes and headers.
- [ ] Run the added GitHub Actions workflow remotely.
- [ ] Obtain an independent review. No subagent was spawned without approval.

Opening a PR skipped: commit, push, and PR creation were not authorized.
Suggested final-unit commit, not executed: `git commit -m "feat: add verified static experiment gallery"`.

The repository now exists on main, but it has no committed historical content baseline.
The explicit prior-ledger regression passes; CI compares the PR base when a prior ledger exists.
