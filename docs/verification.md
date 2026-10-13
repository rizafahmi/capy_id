# Verification report

Recorded on 2026-10-10. These checks test Capyboard, not model quality.

## Completed checks

| Check                                               | Result                                                     | Evidence                            |
| --------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------- |
| Strict TypeScript, Biome lint, and formatting       | Passed                                                     | `.audit/final-checks.txt`           |
| Content, build, and real CLI workflows              | 24 tests passed                                            | `.audit/final-checks.txt`           |
| Browser acceptance tests                            | 48 tests passed, no retries                                | `.audit/final-browser-tests.txt`    |
| Empty genuine-content collection                    | Valid, zero attempts                                       | `npm run validate`                  |
| Local HTTP route, header, and checksum verification | Five runs, nine artifacts, three previews                  | `.audit/local-deployment-check.txt` |
| 100-run shell budget                                | 12,729 gzip bytes across gallery HTML, CSS, and JavaScript | `.audit/final-checks.txt`           |
| Dependency audit                                    | No known vulnerabilities reported                          | `npm audit --omit=optional`         |

The budget excludes thumbnails and experiment artifacts, as specified in the PRD. It is not a Core Web Vitals measurement.

## Browser coverage

The installed Playwright engines reported these versions.

| Engine   | Version      |
| -------- | ------------ |
| Chromium | 156.0.8078.4 |
| Firefox  | 157.0        |
| WebKit   | 27.2         |

Each engine passed 16 browser tests. Curator capture always uses Chromium, including when its CLI regression test runs under another test project. This does not certify the standalone Safari application or every assistive technology.

Browser journeys cover exact metadata filters, combined filters, sorting, gallery non-execution, direct run refresh, exact-byte downloads, clipboard fallback, failed retrieval, altered-artifact rejection, preview start/stop/restart, invalid comparison pairs, shared URLs, equal viewports, and unavailable results.

Containment fixtures attempt parent DOM access, top navigation, popups, form submission, fetch, remote images, and remote scripts. Tests check the actual HTTP CSP and sandbox attributes. A directly opened preview also receives response-level sandbox restrictions. No infinite-loop fixture was executed.

The shell passed Axe WCAG 2.1 AA rule checks across gallery, run, challenge, and comparison routes. Keyboard tests reach evidence and the host-owned Stop control. Layout tests found no horizontal overflow at 360, 768, and 1440 CSS pixels. This is automated and keyboard evidence, not a formal accessibility certification of generated artwork.

## Visual inspection

The local fixture collection includes actual captures from its restricted preview, including a blank broken result. Screenshots inspected during this run are available locally.

- `.audit/gallery-desktop.png` shows the gallery with captured thumbnails and honest placeholders.
- `.audit/run-desktop.png` shows a running preview with host-owned Stop and Restart controls.
- `.audit/compare-mobile.png` shows stacked equal viewports before execution.
- `.audit/comparison-live-panel-1.png` and `.audit/comparison-live-panel-2.png` show the actual mobile previews after Run both.
- `.audit/comparison-live-geometry.json` records both live iframe viewports at 292 by 219 CSS pixels.
- `.audit/gallery-mobile.png` records the narrow gallery.

Browser test screenshots and engine version files are in `test-results/`. These generated artifacts are excluded from Git. Rerun the tests to reproduce them.

## Defects caught and corrected

Import rollback now removes only curation files that the import created. Orphan curation records fail validation rather than being ignored. Their preservation regression is in `tests/content.test.ts`.

Screenshot capture waits for an attached body, not a visible body. This permits a blank broken result. It also uses a whole-pixel 640 by 480 crop after checking iframe dimensions. The browser suite inspects the PNG dimensions and verifies that evidence and ledger bytes remain unchanged.

Cached artifact bytes now undergo the requested checksum check before display, copy, or download. Altered content cannot receive a verified status or initiate an HTML download. Empty local galleries no longer claim to contain development fixtures. Tracked empty-directory markers permit a clean checkout to retain the initial content layout.

## Review and remaining gates

I reviewed tests and the implementation for correctness, data ownership, escaping, preview containment, and static runtime dependencies. No independent cross-model review was performed because delegation was not authorized.

An active LSP scan reported no TypeScript error. Three files could not confirm a clean push-only server response. Full-project `tsc --noEmit` passed. Auxiliary AST rules suggested stylistic changes to string sorting, filter/map chains, small display ternaries, and loopback defaults. Those are not functional failures. String sorting is intentional, localhost values are development defaults, and the existing expressions retain direct readable behavior.

The explicit prior-ledger CLI regression passed, including rejection of rewritten metadata with a rewritten current ledger. Automatic Git HEAD comparison has no historical baseline in this uncommitted checkout. The added CI workflow has not run on GitHub.

Public launch remains blocked on genuine attempts from three identified models, founder provenance review, and verification of deployed HTTPS headers and routes. No production deployment, commit, push, or PR was performed.

Sandbox and CSP do not provide absolute network or CPU isolation. Curator review remains necessary. Stop cannot reliably recover a browser blocked by an infinite loop.

## Astro run-detail migration

The first Astro slice preserves the run-detail behavior and appearance. The other
page types retain their existing renderer.

- `npm run format` and `npm run check` pass. Both type checkers, Biome, template
  formatting, and all 54 tooling tests pass.
- `npm run test:e2e` passes all 111 tests across Chromium, Firefox, and WebKit.
  Downloads, no-JavaScript evidence, lazy highlighting, opt-in previews, actual
  CSP enforcement, and automated accessibility checks remain covered.
- Six Chromium detail screenshots match the pre-migration captures pixel-for-pixel.
  They cover light and dark mode at widths of 360, 768, and 1366 CSS pixels.
  `.audit/astro-visual-parity.json` records dimensions and zero changed pixels.
- Added tests exercise escaped model names, instructions, and observations;
  external-only scripts; route removal after withholding a run; and concurrent
  builds with separate preview origins.
- Content validation passes for nine real attempts. Static generation with HTTPS
  gallery and preview origins passes. This is a local production build, not
  verification of a deployed site.
- `npm audit` reports zero known vulnerabilities. The 100-run shell remains
  17,600 gzip bytes across gallery HTML, CSS, and browser JavaScript.

The baseline browser suite had one stale comparison assertion failing in every
engine. Both selected runs have a preview link. The test now expects two links.

Logs are in `.audit/astro-format.txt`, `.audit/astro-check.txt`,
`.audit/astro-e2e.txt`, and `.audit/astro-validation.txt`. Generated browser
screenshots remain in `test-results/`.

Direct review removed the orphaned legacy preview helper. No new comments or
inline lint suppressions were added. Astro template analysis uses its own checker
because Biome's partial template support reports false unused-variable findings.
Two existing Zod deprecation hints remain. One LSP recheck could not confirm a
clean push-only response; full tooling and template compilation pass separately.
Existing auxiliary findings about escaping, string sorting, and small display
ternaries do not change the verified behavior.

The build-on-start development server remains in place. Astro hot reloading,
remote CI, deployed HTTPS verification, and independent review are not completed
by this slice. No commit, push, or PR was performed.

## Astro gallery migration

The gallery now uses Astro alongside run detail. Challenge, comparison, and
not-found pages retain the existing renderer. Browser controls and styles are
unchanged. No new client runtime was added.

- Formatting, lint, tooling TypeScript, Astro template checks, and all 55 tooling
  tests pass. `npm run check` also passed while browser tests built sites concurrently.
- All 114 browser tests pass across Chromium, Firefox, and WebKit without retries.
  New tests verify that hostile-looking metadata remains text, cannot inject an
  image, and still works with provider and harness filtering.
- All 21 compared Chromium screenshots have zero changed pixels. They cover
  fixture galleries, real-content galleries, single-attempt galleries, and run
  detail at desktop and mobile widths in light and dark mode.
- Concurrent builds use different collections and preview origins. Tests verify
  the respective card counts, detail URLs, and exclusion of staged metadata.
- Validation passes for nine real attempts. Static generation with HTTPS origins
  passes locally. This does not verify a deployed site.
- `npm audit` reports zero known vulnerabilities. The 100-run compressed shell is
  17,604 bytes, below the 200 KiB budget.

Concurrent verification exposed shared Astro prerender output and Vite optimizer
cache races. The CLI now runs from a canonical per-build workspace, and Astro and
Vite caches are isolated explicitly. Stronger concurrent-build tests pass without
locks, retries, or suppressed errors.

Logs are in `.audit/astro-gallery-format.txt`, `.audit/astro-gallery-check.txt`,
`.audit/astro-gallery-e2e.txt`, `.audit/astro-gallery-validation.txt`,
`.audit/astro-gallery-production-build.txt`, and `.audit/astro-gallery-audit.txt`.
`.audit/astro-gallery-visual-parity.json` records image comparisons. Browser
screenshots are in `test-results/` and real-content captures are in
`.audit/astro-gallery-real/`.

Direct code review found no new comments or suppressions. The active LSP probe
reported no errors, but one file's response was inconclusive. Full tooling and
template compilation pass independently. Existing Zod deprecation hints remain.
Hot reloading, remote CI, deployed HTTPS verification, and independent review are
not completed. No commit, push, or PR was performed.

## Astro challenge migration

`src/astro/pages/challenge.astro` now renders the challenge. Comparison and
not-found pages retain the existing renderer. The evidence pipeline, browser
controls, styles, collection protocol, and preview policy are unchanged.

- Formatting, lint, tooling TypeScript, Astro template checks, and all 56 tooling
  tests pass. Template checks and browser builds also pass concurrently.
- All 120 browser tests pass across Chromium, Firefox, and WebKit without retries.
  Challenge tests cover direct refresh, exact prompt text, clipboard copying and
  fallback, keyboard-focusable prompts, no-JavaScript reading, and limitations links.
- A build regression covers a second challenge version with HTML-like title and
  prompt text. Both versions render as escaped text with their own hashes and
  copy URLs. Evidence files retain the original bytes, including prompt newlines.
- All 29 compared Chromium screenshots have zero changed pixels. Twelve cover
  real and fixture challenge pages at widths of 360, 768, and 1366 CSS pixels in
  light and dark mode. Seventeen cover existing gallery and run-detail pages.
- Content validation passes for nine real attempts. A local static production
  build with separate HTTPS origins passes. This does not verify deployed headers.
- `npm audit` reports zero known vulnerabilities. The 100-run gallery shell
  remains 17,604 gzip bytes, below the 200 KiB budget.

Screenshot comparison caught a missing space after the inspiration link. A new
full-sentence browser assertion failed in all three engines before the template
fix. An explicit space at the inline-element boundary restores the original text
and appearance. `.audit/astro-challenge-spacing-red.txt` and
`.audit/astro-challenge-spacing-green.txt` record the regression and fix.

Logs are in `.audit/astro-challenge-format.txt`, `.audit/astro-challenge-check.txt`,
`.audit/astro-challenge-e2e.txt`, `.audit/astro-challenge-validation.txt`,
`.audit/astro-challenge-production-build.txt`, and `.audit/astro-challenge-audit.txt`.
`.audit/astro-challenge-visual-parity.json` records image comparisons. Real-content
screenshots are in `.audit/astro-challenge-real/`; browser captures are in
`test-results/`. `.audit/capture-challenge.mjs` and `.audit/compare-challenge.mjs`
can repeat the local real-content captures and pixel comparison while the matching
managed server and saved baseline are available.

Direct review found no new comments or suppressions. Delegated design and review
were not authorized. The active LSP probe reported no errors but one file was
inconclusive. Full tooling and template compilation pass independently.
Hot reloading, remote CI, deployed HTTPS verification, and independent review
remain unverified. No commit, push, or PR was performed. The pre-existing
`AGENTS.md` edit was left untouched.

## Astro comparison migration

`src/astro/pages/compare.astro` replaces the comparison string renderer. Native
selector names, required choices, GET action, status hooks, and preview controls
are unchanged. Browser JavaScript, CSS, catalogue generation, and preview headers
are unchanged. The not-found page retains its existing renderer.

- Formatting, lint, both type checkers, and all 56 tooling tests pass. Template
  checks and browser builds also pass concurrently.
- All 126 browser tests pass across Chromium, Firefox, and WebKit without retries.
  Added coverage verifies direct refresh, shared choices, browser history,
  preview unloading after selection changes, accessible labels, and native GET
  submission with JavaScript disabled.
- Hostile-looking model and provider labels remain text in selectors and panels.
  Tests verify original option values and the absence of injected images.
- Build checks verify withheld choices disappear, empty collections retain only
  placeholders, and superseded and replacement runs remain selectable.
- All 50 compared Chromium screenshots have zero changed pixels. Twenty-seven
  cover comparison, including selected, empty, and no-JavaScript states. Twenty-three
  protect gallery, challenge, and run detail. Real captures use the same two runs
  before and after migration and never execute their previews.
- Validation of nine real attempts, local production generation with separate
  HTTPS origins, and dependency audit pass. There are zero known vulnerabilities.
  The 100-run gallery shell remains 17,604 gzip bytes.

The initial characterization run exposed test-harness failures before production
changes. Firefox reported loaded fonts with JavaScript disabled, but waiting on
`document.fonts.ready` hung. The test now polls synchronous font status in every
engine. No-JavaScript pixel captures use Chromium. All engines still exercise
native selectors, submission, and fallback navigation.

The temporary metadata-test server also waited for browser connections after all
assertions passed. Cleanup now closes connections owned by that server after
initiating shutdown. The baseline and post-migration suites pass with the same
assertions and without increased timeouts or retries.

Logs are in `.audit/astro-comparison-check.txt`, `.audit/astro-comparison-e2e.txt`,
`.audit/astro-comparison-validation.txt`, `.audit/astro-comparison-production-build.txt`,
and `.audit/astro-comparison-audit.txt`. Baseline failures and the font probe are in
`.audit/astro-comparison-baseline/`. `.audit/astro-comparison-visual-parity.json`
records image comparisons. Real screenshots are in `.audit/astro-comparison-real/`.
`.audit/capture-comparison.mjs` and `.audit/compare-comparison.mjs` repeat the local
captures and pixel comparison with a managed server and saved baseline.

Direct code review found no new comments or suppressions. Delegated design and
review were not authorized. The active LSP probe reported no errors but one file
was inconclusive. Full compiler checks pass independently. Existing Zod hints
remain unrelated. Without JavaScript, the form submits selected IDs and explains
that comparison panels and previews require JavaScript. Individual evidence pages
remain readable. This slice preserves that fallback rather than adding server-side
comparison selection.

Hot reloading, remote CI, deployed HTTPS verification, and independent review
remain unverified. No commit, push, or PR was performed.

## Astro not-found migration

`src/astro/pages/404.astro` replaces the final gallery string template. The legacy
page wrapper and its unused escaping helper are removed. All gallery pages now
use Astro. The preview-origin fallback remains a separate minimal document under
its stricter policy. Browser JavaScript, CSS, preview files, and headers are unchanged.

- Formatting, lint, both type checkers, and all 56 tooling tests pass. Template
  checks and browser builds also pass concurrently.
- All 132 browser tests pass across Chromium, Firefox, and WebKit without retries.
  Added coverage verifies actual HTTP 404s for unknown run and other routes,
  response headers, fixture labels, keyboard recovery, no-JavaScript recovery,
  no horizontal overflow, and detectable WCAG 2.1 AA violations.
- Build checks verify the static 404 path, external-only scripts, and absence of
  the fixture banner for a genuine empty collection. Unknown paths are not echoed.
- All 56 compared Chromium screenshots have zero changed pixels. Eighteen cover
  real and fixture not-found pages, including JavaScript-disabled captures.
  Thirty-eight protect the other migrated pages. Widths include 360, 768, and
  1366 CSS pixels in light and dark mode.
- The preview-origin fallback body is byte-identical. Actual responses retain
  HTTP 404, `nosniff`, sandbox, and network, font, and frame restrictions.
- Validation of nine real attempts, local production generation with separate
  HTTPS origins, and dependency audit pass. There are zero known vulnerabilities.
  The 100-run gallery shell remains 17,604 gzip bytes.

Logs are in `.audit/astro-not-found-format.txt`, `.audit/astro-not-found-check.txt`,
`.audit/astro-not-found-e2e.txt`, `.audit/astro-not-found-validation.txt`,
`.audit/astro-not-found-production-build.txt`, and `.audit/astro-not-found-audit.txt`.
`.audit/astro-not-found-visual-parity.json` records image comparisons. Real-content
captures are in `.audit/astro-not-found-real/`; fixture captures are in `test-results/`.
`.audit/capture-not-found.mjs` and `.audit/compare-not-found.mjs` repeat the local
captures and pixel comparison with a managed server and saved baseline.

Direct review found no new comments or suppressions and no remaining legacy
renderer callers. The active LSP probe confirmed all five changed tooling files
clean. Full tooling and template compilation pass separately. Existing Zod hints
remain unrelated. Delegated design and review were not authorized.

Gallery template migration and local Astro development integration are complete.
Remote CI, deployed HTTPS verification, and independent review remain unverified.
No commit, push, or PR was performed. The unrelated `NOTES.md` was left untouched.

## Native Astro development integration

Astro now renders development gallery routes live. The managed shell still owns
one process and separate gallery and preview origins. Content validation runs
before either origin is ready. Content and curation edits trigger a debounced
validated rebuild.

- Formatting, lint, TypeScript, and Astro checks pass. All 57 tooling tests pass.
  `npm run check` remains independent of browser installation, matching CI's order.
- `npm run test:e2e` includes one managed-server integration test across Chromium,
  Firefox, and WebKit, followed by all 132 acceptance tests without retries.
- The integration test copies the project into a temporary directory with spaces.
  It changes a shared template, CSS, JavaScript, and local assets. An already-open
  browser receives each update without manual navigation. Asset addition and
  deletion also reach actual HTTP responses.
- Five Chromium screenshots compare native development with a static build.
  Gallery, challenge, comparison, run detail, and not-found PNGs are byte-identical.
  These checks live in the integration test rather than a local-only script.
- Actual gallery 200 and 404 responses retain security headers. HMR adds only the
  local WebSocket to `connect-src`. Inline script, inline style, and eval permissions
  remain unchanged. Native preview HTML has no injected Astro or Vite code.
- Preview and evidence response bodies match the original artifact bytes.
  Evidence keeps plain-text MIME and `nosniff`. Private content and PID records
  cannot be retrieved through normal routes or Vite filesystem and raw requests.
- A valid curation edit removes the withheld route and its published evidence
  without a manual restart. Invalid JSON and corrupted historical bytes leave the
  previous gallery, preview, and evidence generation available. A later valid edit
  retries the rebuild. Preparation failure leaves the previous output unchanged.
- Real managed restart and stop release both ports. Occupied gallery and preview
  ports fail startup without changing the unmanaged listener. Partial startup
  closes the other owned origin and removes its PID record.
- Nine-attempt validation, local static production generation with separate HTTPS
  origins, and dependency audit pass. There are zero known vulnerabilities.
  The 100-run gallery shell remains 17,604 gzip bytes.
- The managed server's default real collection renders seven published cards
  without a fixture banner. Desktop and dark mobile screenshots were inspected.
  The challenge remains readable without JavaScript.

The source-reload failing baseline is `.audit/astro-dev-red.txt`. The content-watch
failing baseline is `.audit/astro-content-watch-red.txt`. Final checks, browser
results, production generation, validation, and audit are in
`.audit/astro-dev-check.txt`, `.audit/astro-dev-e2e.txt`,
`.audit/astro-dev-production.txt`, `.audit/astro-dev-validation.txt`, and
`.audit/astro-dev-audit.txt`. The focused content-watch result is
`.audit/astro-content-watch-green.txt`.
`.audit/astro-dev-real.txt` records the real-content probe. Its images are
`.audit/astro-dev-real-desktop.png` and `.audit/astro-dev-real-mobile.png`.

Acceptance tests exposed missing gallery headers because Astro overrides Vite's
header setting. Astro's `server.headers` now owns them. A strict-CSP WebKit probe
also reported native form-control `style-src-attr` violations without app scripts,
Vite, or author styles. The integration test compares these with the static
baseline and rejects additional violations. It does not relax the policy.

Direct source review found no new comments or suppressions. Active tooling
language-server probes report no errors. Auxiliary rules flag intentional fixed
loopback origins, catch-boundary `unknown`, and existing static-handler style
hints. Astro's programmatic dev API remains experimental and version-pinned.
Production still uses the isolated CLI build. Remote CI, deployment, and
independent review remain unverified. Managed servers are stopped.
No commit, push, or PR was performed. `NOTES.md` is untouched.

## Reproduce

```sh
npm ci
npm exec playwright install chromium firefox webkit
npm run format
npm run check
npm run validate
npm run test:e2e
```

Stop local dev servers before the browser suite. The suite owns ports 4173, 4174, and 4175. Follow `docs/deployment.md` for actual HTTP verification and `docs/curation.md` for capture commands.
