# Architecture

## Static app and local tooling

The public application is generated HTML, CSS, and vanilla JavaScript. Every run has a real directory route. Evidence links and the challenge prompt remain readable without JavaScript. Browser code adds filters, exact-byte downloads, clipboard fallback, comparison selectors, and explicit preview controls.

Node.js 24 executes erasable TypeScript directly. `tsc --noEmit` checks strict types separately. No application framework, bundler, or runtime server is required.

Zod validates external JSON and exports JSON schemas. It is a local tooling dependency, not a browser bundle. Biome formats and lints the source. Playwright drives browser acceptance tests and curator capture. Axe checks detectable shell accessibility violations. These dependencies do not enter the static production runtime.

## Four record boundaries

An immutable challenge identifies the exact prompt and its checksum. An immutable run identifies one attempt, generation conditions, transcript, response, and selected HTML. A mutable curation record controls publication, execution, observations, series disclosure, and thumbnail metadata. The append-only integrity ledger records immutable file hashes and byte counts.

Branded run and challenge IDs prevent accidental mixing in tooling. Boundary validation rejects invalid enums, timestamps, paths, hashes, and provenance relationships. Internal code works with parsed records. Preview availability is a discriminated ready-or-unavailable value with a URL or reason.

Validation also rejects symlinks, orphan curation, duplicate series attempt numbers, missing artifacts, and modifications to prior ledger entries. Imports use an exclusive local lock and create-only writes. Rollback removes only files the import created. A crash still requires curator inspection; the filesystem operations are not a distributed transaction.

JSON schemas describe structural constraints. The TypeScript validator owns cross-file, hash, extraction-range, series, and provenance checks that JSON schema cannot express.

## Untrusted previews

The gallery and preview files are separate static deployments on distinct HTTPS origins. Gallery CSP allows local assets and frames only from the configured preview origin. Original source is plain text with `nosniff`, never executable same-origin HTML.

Previews are opt-in iframes with `sandbox="allow-scripts"`. They also receive enforced response CSP with `sandbox allow-scripts`, which protects directly opened preview documents. Forms, popups, parent access, top navigation, workers, remote images and scripts, and network fetches are restricted. No frame messages are consumed.

The current preview policy is `restricted-html-v1`. Build preparation copies HTML bytes without repair or instrumentation. Null characters make a preview unavailable while preserving its evidence. Broken scripts are not graded or rewritten. Screenshot capture uses these same restricted routes.

CSP and sandbox are capability restrictions, not absolute network or resource isolation. Self-navigation and CPU exhaustion remain concerns. Keep the preview origin free of credentials, sensitive cookies, application storage, and unrelated services. A separate registrable domain reduces accidental cookie sharing. Curator review is required before execution.

## Comparison and capacity

Comparison starts exactly two distinct runs after Run both. Both viewports use the same smaller available width, capped at 640 CSS pixels, and a 4:3 ratio. Outputs are not rescaled independently. Stop removes a frame; Restart creates another instance. At most two frames can exist.

The gallery loads no response or HTML artifacts and executes no generated code. Thumbnails reserve dimensions and load lazily. Source is fetched only when requested and its checksum is verified before display or download. Shiki generates light/dark token ranges during the build, stored separately in `assets/highlights/`. Prettier generates a separate, two-space-indented HTML view, including embedded CSS and JavaScript, before Shiki highlights it. The HTML viewer defaults to this formatted view and can toggle back to the verified original. Formatting is display-only: it may change whitespace and is never used for previews, copying originals, or downloads. Formatting failures fall back to the highlighted original. The viewer uses text nodes, never executable HTML. Neither Prettier nor Shiki enters the browser bundle. Source wraps by default; the toolbar can switch to horizontal scrolling. The build suite measures a 100-run collection against the 200 KB compressed shell budget.

Future evaluation records can reference stable run IDs and artifact hashes. There is no evaluation engine, score field, provider integration, or dormant Lab infrastructure.
