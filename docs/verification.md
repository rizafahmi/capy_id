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

Browser journeys cover search, combined filters, sorting, gallery non-execution, direct run refresh, exact-byte downloads, clipboard fallback, failed retrieval, altered-artifact rejection, preview start/stop/restart, invalid comparison pairs, shared URLs, equal viewports, and unavailable results.

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
  image, and still works with provider filtering and search.
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
