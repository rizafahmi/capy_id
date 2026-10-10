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

## Pi collection workflow

1. `how` over the affected subsystem.
2. `architect` for parallel design exploration. Skipping stays as `architect skipped: <reason>`. Do not fold the design decision silently into implementation.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (the **separate-before-serializing-shared-state** principle skill). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Delegate code-writing to a subagent using your configured feature model (default inherit-parent) with a specific scope (file paths, named data shape and its organizing structure per **principle-model-the-domain**, a state machine over scattered booleans, a table/registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic, and success criteria). Review its diff yourself. When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), delegate via the **arena** skill instead so the runners surface the alternatives and the cross-judge guards the pick. Mandatory: no skip-with-reason escape, and Laziness Protocol does not override it (the gain is review separation, not lines saved). You can spawn a subagent even though you are one. "The app is small" and "a subagent cannot spawn one" are both wrong. A subagent forbidden to spawn satisfies this by owning the diff directly with the same review separation. No "standing by" reply that waits on a nested agent. Comments per **Comments**. Surgical edits, re-ground against the source for upstream-derived files. Port shared-primitive improvements to all consumers and verify each. Commit liberally.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
6. Rebase into small, ordered commits. Stack follow-ups.
   Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.
7. If the design is contested, `interrogate` before shipping.
8. Run **Opening a PR**.

### Task status

- [x] Explore import schemas, evidence preservation, and Pi CLI behavior directly.
- [x] Architect skipped: delegation requires approval. Keep the existing record model and normalize omissions only at import.
- [x] Delegation skipped: no subagents have been approved.
- [x] Test omitted generation settings and system-instruction knowledge through actual import.
- [x] Normalize omitted fields at the metadata boundary without weakening immutable run validation.
- [x] Add a Pi metadata example and collection guide.
- [x] Run formatter, lint, type checks, tests, schema generation, and the real CLI import.
- [x] Review the diff and report remaining collection limits.
- [x] Commits, rebasing, and opening a PR skipped: not authorized.
- [x] Interrogate skipped: no contested design.

### Throughput checkpoint

- Blocking first steps. Prove the omission failure before changing the metadata schema.
- Independent workstreams. n/a: one owner, no approved fan-out.
- Shared mutable state. Use temporary content roots for import verification. Do not edit historical evidence.
- Smallest safe decomposition. One import-boundary change with tests, then a documented manual Pi collection path.

### Data shape

Keep the existing immutable run record. The metadata schema accepts omitted sampling settings and system-instruction knowledge, then produces explicit unknown values for storage. Pi collection uses coding-agent records and tool-assisted transcripts when tools run. Do not add provider integration or a second record format.

### Verification and handoff

The omission tests failed before the import-schema change. Review then found that JSON schema export still required defaulted fields. A separate failing CLI test caught that mismatch before changing export to input mode for metadata.

The final check passes formatting, lint, TypeScript, and all 30 tests, including real CLI import and schema export. Content validation and diff whitespace checks pass. The Pi command matches installed Pi 1.1.0 flags and passes shell syntax validation. Evidence is in .audit/pi-collection-checks.txt.

No model call or browser run was made. Application UI and preview behavior are unchanged. The command's provider interaction remains unverified. Full Pi sessions and harness configuration are not structured immutable artifacts in the current importer. The guide discloses that limit.

The active LSP probe reported no errors or warnings, but one recheck was inconclusive. TypeScript compilation passed separately. Existing number-schema deprecation hints remain unrelated. The shape-name hint flags Zod's standard shape API, not a new domain symbol.

How, architect, and comment-review delegation were not run because subagents were not approved. Direct code and comment review found no new comments or suppressions. Existing unrelated untracked files were left untouched.

Suggested commit, not executed: `git commit -m "feat: add Pi collection workflow with optional generation controls"`.
