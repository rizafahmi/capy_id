# Capyboard implementation

## Astro migration

Migrate one page type per verified slice. Start with run detail. Preserve visible output,
vanilla browser controls, original evidence bytes, preview isolation, response headers,
and safe build replacement. All gallery pages are migrated, including not-found.
The preview-origin fallback remains separate. Dev-server integration and hot
reloading remain a later slice.

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

### Challenge-slice checklist

- [x] Pin the behavior contract first. Capture challenge behavior and screenshots before moving markup. How delegation skipped because subagents are not authorized; direct tracing covers validation, evidence copying, and browser copy controls.
- [x] Name the structure the code is missing per principle-model-the-domain. Add typed challenge records paired with their exact prompt text to AstroPages.
- [x] Name the target shape. Astro renders /challenge/ in the existing staged build. Existing tooling validates content and copies original evidence. Architect exploration skipped because subagents are not authorized.
- [x] Subtract before you add. Remove the challenge HTML-string template and its orphaned inspiration constant when their callers migrate.
- [x] Move in small behavior-preserving steps, each keeping the pin green. Keep controls, protocol, limitations, and styles unchanged. Mechanical delegation skipped because subagents are not authorized.
- [x] Prove behavior is unchanged on the real artifact, not "it compiles". Verify multiple challenge versions, exact prompt evidence and copy behavior, all browser engines, and visual parity.
- [x] Confirm the change is worth keeping. Review the typed boundary and readable page markup for duplicate rules and unnecessary components.
- [x] Rebase into small ordered commits. Commits, rebasing, and opening a PR skipped because they are not authorized. Suggest the challenge-slice commit after verification.

### Challenge throughput checkpoint

- Blocking first steps. Pin prompt display and copy behavior and capture screenshots before replacing the renderer.
- Independent workstreams. n/a: one page slice and no approved delegation.
- Shared mutable state. Retain canonical per-build workspaces and isolated Astro and Vite caches. Browser tests use separate content and output directories.
- Smallest safe decomposition. Migrate only challenge, then verify before changing comparison or not-found pages.

### Challenge-slice handoff

`src/astro/pages/challenge.astro` replaces the challenge string template. Typed
`ChallengePrompt` records pair validated metadata with prompt text. Tooling still
copies the original evidence bytes. Copy controls, protocol, limitations, preview
policy, styles, and client JavaScript remain unchanged. No new component layer or
dependency was added.

Formatting, lint, both type checkers, 56 tooling tests, and 120 browser tests pass.
All 29 compared Chromium screenshots match pixel-for-pixel. Twelve cover real and
fixture challenge pages at three widths in light and dark mode. Seventeen protect
existing gallery and run-detail rendering. A browser regression caught and verifies
the repaired space after the inspiration link.

Production generation, validation of nine real attempts, and dependency audit
pass. Evidence is in `.audit/astro-challenge-check.txt`,
`.audit/astro-challenge-e2e.txt`, and `.audit/astro-challenge-visual-parity.json`.
The active LSP probe reported no errors but could not confirm one file. Full
compiler checks pass independently. Hot reloading, remote CI, deployed HTTPS
verification, independent review, and commits remain outside this slice.
Your existing `AGENTS.md` edit is untouched.

Next slice: comparison. Suggested commit, not executed:
`git commit -m "refactor: migrate challenge rendering to Astro"`.

### Comparison-slice checklist

- [x] Pin the behavior contract first. Characterize selector labels, publication choices, GET submission, shared URLs, no-JavaScript fallback, and screenshots before moving markup. How delegation skipped because subagents are not authorized; direct tracing covers the static form and browser catalogue.
- [x] Name the structure the code is missing per principle-model-the-domain. Comparison input holds validated run IDs and model labels plus the fixture flag. Browser catalogue and preview state remain unchanged.
- [x] Name the target shape. Astro renders /compare/ in the existing staged build. Existing tooling owns publication ordering, evidence, catalogue, headers, and staging. Architect exploration skipped because subagents are not authorized.
- [x] Subtract before you add. Remove the comparison HTML-string renderer when its caller migrates. Keep the not-found renderer until its own slice.
- [x] Move in small behavior-preserving steps, each keeping the pin green. Preserve form hooks, native labels, condition notices, URL behavior, and preview controls. Mechanical delegation skipped because subagents are not authorized.
- [x] Prove behavior is unchanged on the real artifact, not "it compiles". Verify all browser engines, malicious-looking model text, withheld choices, native GET submission, and pixel parity.
- [x] Confirm the change is worth keeping. Review the narrow typed input and readable page for duplicate state and unnecessary component layers.
- [x] Rebase into small ordered commits. Commits, rebasing, and opening a PR skipped because they are not authorized. Suggest the comparison-slice commit after verification.

### Comparison throughput checkpoint

- Blocking first steps. Characterization and screenshots precede the renderer replacement.
- Independent workstreams. n/a: one page slice and no approved delegation.
- Shared mutable state. Keep isolated Astro workspaces and caches. Browser fixtures use separate content roots and ephemeral servers.
- Smallest safe decomposition. Migrate only comparison, then run verification before changing not-found pages.

### Comparison-slice handoff

`src/astro/pages/compare.astro` replaces the comparison string renderer. Its typed
input contains run IDs and model metadata for native selectors. Superseded runs
remain selectable, and withheld runs disappear. Browser catalogue generation,
comparison panels, preview state, client JavaScript, CSS, and headers are unchanged.
No new dependency or component layer was added.

Formatting, lint, both type checkers, 56 tooling tests, and 126 browser tests pass.
All 50 compared Chromium screenshots match pixel-for-pixel. Twenty-seven cover
comparison's selected, empty, and no-JavaScript states. Twenty-three protect
existing gallery, challenge, and run detail. Native GET submission, history,
malicious-looking labels, and preview unloading pass in all three engines.

Baseline characterization exposed a Firefox no-JavaScript font-promise hang and
an owned temporary server's connection-cleanup wait. Tests now poll synchronous
font status and close owned connections during shutdown. No-JavaScript parity
screenshots use Chromium; functional tests still cover all engines. No timeout
increase, retry, application workaround, or inline suppression was added.

Production generation, validation of nine real attempts, and dependency audit
pass. Evidence is in `.audit/astro-comparison-check.txt`,
`.audit/astro-comparison-e2e.txt`, and `.audit/astro-comparison-visual-parity.json`.
The active LSP probe reported no errors but could not confirm one file. Full
compiler checks pass independently. Hot reloading, remote CI, deployed HTTPS
verification, independent review, and commits remain outside this slice.

Next slice: not-found. Suggested commit, not executed:
`git commit -m "refactor: migrate comparison rendering to Astro"`.

### Not-found-slice checklist

- [x] Pin the behavior contract first. Characterize actual HTTP 404 responses, fixture labeling, no-JavaScript recovery, preview-origin fallback, and screenshots before moving markup. How delegation skipped because subagents are not authorized; direct tracing covers generation, local serving, and headers.
- [x] Name the structure the code is missing per principle-model-the-domain. Not-found input contains only the fixture flag. It does not echo requested paths or add routing state.
- [x] Name the target shape. Astro generates gallery/404.html with the existing shell. Tooling retains HTTP header generation, preview-origin fallback, and output safeguards. Architect exploration skipped because subagents are not authorized.
- [x] Subtract before you add. Delete the last gallery HTML-string renderer, its escaping helper, and the old 404 write when their caller migrates.
- [x] Move in small behavior-preserving steps, each keeping the pin green. Preserve text, navigation, appearance, and response status. Mechanical delegation skipped because subagents are not authorized.
- [x] Prove behavior is unchanged on the real artifact, not "it compiles". Verify real and fixture 404s, all browser engines, accessibility, strict preview headers, and pixel parity.
- [x] Confirm the change is worth keeping. Review the single-field input and readable template. Confirm no obsolete renderer callers remain.
- [x] Rebase into small ordered commits. Commits, rebasing, and opening a PR skipped because they are not authorized. Suggest the not-found-slice commit after verification.

### Not-found throughput checkpoint

- Blocking first steps. HTTP characterization and screenshots precede the final gallery renderer replacement.
- Independent workstreams. n/a: one page slice and no approved delegation.
- Shared mutable state. Keep per-build Astro workspaces and caches. Browser tests use isolated contexts and the suite-owned servers.
- Smallest safe decomposition. Migrate only the gallery not-found page. Leave the stricter preview fallback and dev-server integration unchanged.

### Not-found-slice handoff

`src/astro/pages/404.astro` now generates the gallery's static not-found document.
Its input contains only the fixture flag. The last gallery string renderer, its
escaping helper, and the old 404 write are removed. All gallery pages now use
Astro. The preview-origin fallback and its stricter headers remain unchanged.
No new dependency, browser runtime, CSS, or routing state was added.

Formatting, lint, both type checkers, 56 tooling tests, and 132 browser tests pass.
Unknown routes retain actual HTTP 404 responses. Recovery works with keyboard
input and JavaScript disabled in all three engines. All 56 compared Chromium
screenshots match pixel-for-pixel. Eighteen cover real and fixture not-found
pages; thirty-eight protect the other migrated pages.

Production generation, validation of nine real attempts, and dependency audit
pass. The active LSP probe confirmed five changed tooling files clean. Evidence
is in `.audit/astro-not-found-check.txt`, `.audit/astro-not-found-e2e.txt`, and
`.audit/astro-not-found-visual-parity.json`. Hot reloading, remote CI, deployed HTTPS
verification, independent review, and commits remain outside this slice.
The unrelated `NOTES.md` remains untouched.

Gallery template migration is complete. Next useful slice: two-origin Astro
server integration and hot reloading. Suggested commit, not executed:
`git commit -m "refactor: migrate not-found rendering to Astro"`.

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
