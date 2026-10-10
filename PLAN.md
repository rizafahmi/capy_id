# Capyboard implementation

## Astro migration

Migrate one page type per verified slice. Start with run detail. Preserve visible output,
vanilla browser controls, original evidence bytes, preview isolation, response headers,
and safe build replacement. Run detail and gallery are migrated. Challenge,
comparison, and not-found pages stay on the existing renderer until their own slices.

### First-slice checklist

- [x] Pin the behavior contract first. Existing build and browser acceptance tests cover run inspection. Capture desktop and mobile screenshots before moving the templates.
- [x] Name the structure the code is missing per principle-model-the-domain. Use typed RunPage records containing the validated Entry, discriminated Preview, optional correction, and fixture label.
- [x] Name the target shape. Astro owns page markup and static run routes. Existing tooling owns content validation, artifact copying, previews, headers, and staging. Architect and how delegation skipped because subagents are not authorized. Direct source tracing is complete.
- [x] Subtract before you add. Delete the legacy detail template and its detail-only helpers when Astro replaces them.
- [x] Move in small behavior-preserving steps, each keeping the pin green. Migrate only run detail. Mechanical delegation skipped because subagents are not authorized.
- [x] Prove behavior is unchanged on the real artifact, not "it compiles". Run static checks, build tests, three-engine browser tests, and before/after screenshot comparison.
- [x] Confirm the change is worth keeping. Inspect component boundaries and remove unnecessary adapters or duplicate domain rules.
- [x] Rebase into small ordered commits. Commits, rebasing, and opening a PR skipped because they are not authorized. Suggest the first-slice commit after verification.

### Throughput checkpoint

- Blocking first steps. Establish passing baseline checks and capture run-detail screenshots before changing rendering.
- Independent workstreams. n/a: one page slice and no approved delegation.
- Shared mutable state. Pass build data to an isolated Astro child process. Keep each build inside its own staging directory. Do not use parent-process environment mutation or shared generated content.
- Smallest safe decomposition. One run-detail migration with real static output, then a verification boundary before another page.

### First-slice handoff

Run detail is migrated in `src/astro/pages/runs/[id].astro`. The legacy detail,
artifact, and preview templates are removed. Shared measurement formatting lives
in `scripts/presentation.ts`. The other pages and preview deployment remain unchanged.

Formatting, lint, both type checkers, all 54 tooling tests, and all 111 browser tests
pass. Six Chromium screenshots at 360, 768, and 1366 pixels in light and dark mode
match the baseline pixel-for-pixel. Production generation and validation of the
nine-attempt real collection pass. Evidence is in `.audit/astro-check.txt`,
`.audit/astro-e2e.txt`, and `.audit/astro-visual-parity.json`.

The development server still builds once at startup. No hot reloading, production
deployment, independent review, commit, push, or PR is included in this slice.
Next slice: gallery. Suggested commit, not executed:
`git commit -m "refactor: migrate run detail rendering to Astro"`.

### Gallery-slice checklist

- [x] Pin the behavior contract first. Run the baseline checks and capture gallery screenshots before moving markup.
- [x] Name the structure the code is missing per principle-model-the-domain. Share PublishedEntry records through typed AstroPages data with separate gallery and run inputs.
- [x] Name the target shape. Astro renders the gallery and run detail in one staged build. Existing tooling retains publication selection, validation, artifacts, headers, and deployment replacement. How and architect delegation skipped because subagents are not authorized.
- [x] Subtract before you add. Delete gallery, card, screenshot, and metadata string templates when their callers migrate.
- [x] Move in small behavior-preserving steps, each keeping the pin green. Migrate the gallery without changing browser controls or CSS. Mechanical delegation skipped because subagents are not authorized.
- [x] Prove behavior is unchanged on the real artifact, not "it compiles". Verify static output, all browser engines, and screenshots.
- [x] Confirm the change is worth keeping. Review the typed build boundary and components for duplicated rules or unnecessary adapters.
- [x] Rebase into small ordered commits. Commits, rebasing, and opening a PR skipped because they are not authorized. Suggest the gallery-slice commit after verification.

### Gallery throughput checkpoint

- Blocking first steps. Passing baseline and gallery screenshots precede markup changes.
- Independent workstreams. n/a: one page slice and no approved delegation.
- Shared mutable state. Use the existing per-build Astro workspace. No process-global mutation or shared generated files.
- Smallest safe decomposition. One gallery migration, followed by full verification before moving another page.

### Gallery-slice handoff

The gallery is migrated in `src/astro/pages/index.astro`. `RunCard.astro` owns card
markup. `Screenshot.astro` is shared with run previews. The legacy gallery templates
are removed. `scripts/astro-pages.ts` builds both page types from typed records.
Browser controls, styles, evidence bytes, and preview deployment remain unchanged.

Formatting, lint, both type checkers, all 55 tooling tests, and all 114 browser tests
pass. All 21 compared Chromium screenshots match pixel-for-pixel. They cover fixture,
real-content, single-attempt galleries, and run detail. Concurrent builds with
separate collections and origins pass while the template checker runs. Canonical
per-build working directories and separate Astro and Vite caches prevent races.

Production generation, nine-attempt content validation, and dependency audit pass.
Evidence is in `.audit/astro-gallery-check.txt`, `.audit/astro-gallery-e2e.txt`,
and `.audit/astro-gallery-visual-parity.json`. Hot reloading, remote CI, deployment,
independent review, and commits remain outside this slice.

Next slice: challenge. Suggested commit, not executed:
`git commit -m "refactor: migrate gallery rendering to Astro"`.

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
