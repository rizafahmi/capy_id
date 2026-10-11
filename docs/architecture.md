# Architecture

## Static app and local tooling

The public application is generated HTML, CSS, and vanilla JavaScript. Every run has a real directory route. Evidence links and the challenge prompt remain readable without JavaScript. Browser code adds filters, exact-byte downloads, clipboard fallback, comparison selectors, and explicit preview controls.

Node.js 24 executes erasable TypeScript directly. `tsc --noEmit` checks tooling types. `astro check --tsconfig tsconfig.astro.json` checks templates. Astro generates all gallery pages, including the static not-found document, from `src/astro/`. No production runtime server is required.

Zod validates external JSON and exports JSON schemas. It is a local tooling dependency, not a browser bundle. Biome formats and lints the source. Playwright drives browser acceptance tests and curator capture. Axe checks detectable shell accessibility violations. These dependencies do not enter the static production runtime. Prettier with `prettier-plugin-astro` formats Astro templates. Biome checks JavaScript and TypeScript files. Its incomplete Astro template analysis is excluded in favor of Astro's template-aware checker.

## Astro rendering boundary

The migration replaces page templates, not the evidence pipeline. `scripts/build.ts` validates content and prepares typed `AstroPages` data before `scripts/astro-pages.ts` invokes the Astro CLI. The gallery input contains published entries after provenance-correction selection. The run input keeps every visible detail route, including superseded records. The challenge input pairs validated challenge metadata with UTF-8 prompt text. Tooling copies the original prompt bytes into evidence before rendering. Comparison receives published run IDs and model metadata for its native selectors. It retains superseded records, unlike the gallery's current-attempt selection. Browser code still builds comparison panels from the existing catalogue. Not-found input contains only the fixture flag; requested paths are not rendered.

Each build has its own staging workspace, data file, generated types, and separate Astro and Vite caches. The CLI runs from the canonical staging directory so prerender files cannot race between builds. A temporary node_modules symlink lets emitted build modules resolve installed tooling without copying dependencies. Only the generated site is copied into the gallery deployment. The child process receives the workspace path through its environment to locate its data. Vite substitutes the validated records into the static page modules. The data file and intermediate output never enter either deployment.

Astro renders `/`, `/challenge/`, `/compare/`, `/runs/:id/`, and the gallery's `/404.html` with a shared shell. Run detail uses metadata, screenshot, preview, and artifact components. Gallery cards use `RunCard.astro`. The gallery and run previews share `Screenshot.astro`. Measurements use `scripts/presentation.ts` so the gallery and Astro detail page keep the same formatting. Content collections do not replace the cross-file integrity validator.

The production boundary uses Astro's supported build command rather than its experimental programmatic build or Container APIs. It adds process startup per build but avoids mutable process-wide build state. The original build keeps output-directory safeguards and replaces the final deployment only after all generation succeeds.

Styles and the existing browser module remain external same-origin assets. There is no hydration framework, client router, or new production browser runtime. Astro does not transform preserved evidence or preview HTML. Preview files and response headers remain the responsibility of existing tooling. The preview-origin 404 is a separate minimal document with no gallery assets or scripts. Local serving returns the origin's fallback with HTTP 404 and the applicable response policy. Development rendering uses the separate local boundary described below.

## Native development server

`scripts/dev.ts` validates content and prepares original evidence, previews, catalogue data, and assets through `buildSite({ render: "dev" })`. This mode returns the same typed `AstroPages` snapshot without generating static gallery HTML. Production builds still render every page before replacement. Development output is not a deployable gallery.

`scripts/astro-config.ts` shares the rendering configuration without changing parent-process environment variables. `scripts/astro-dev.ts` uses [Astro's programmatic dev API](https://docs.astro.build/en/reference/programmatic-reference/) to render gallery routes on port 4173. That API is experimental, so the pinned Astro version and real lifecycle tests are part of the contract. One process owns Astro and the separate static preview server on port 4174. A child CLI and proxy would add process and socket ownership without improving this local setup.

Astro watches templates natively. A Vite watcher copies edits to the existing external CSS, JavaScript, and local assets, then reloads the page. Asset writes are serialized before broadcasting reloads. No framework transform touches evidence or preview HTML. Reloads reset browser controls and remove active previews. A separate debounced watcher treats content and curation paths as triggers only. It calls `buildSite({ render: "dev" })`, which validates the immutable ledger and prepares a new output generation. Astro restarts only after that build succeeds. Invalid changes keep the current generation. Tooling and configuration changes require restart.

The development gallery adds only `ws://127.0.0.1:4173` to its connection policy. Inline scripts, inline styles, and eval remain disallowed. Astro's dev toolbar is disabled. Headers belong in Astro's `server.headers`; its resolved server configuration overrides Vite's header setting. The shared static handler preserves evidence's plain-text MIME type and `nosniff`. Preview and production policies are unchanged.

Vite file access is limited to source, tooling, and installed dependencies. Unpublished content, managed PID records, and private development caches are not public files. Development caches live in a temporary workspace. The content watcher can observe the configured root but does not add it to Vite's allowed file paths. Managed stop uses Astro's stop API and closes only owned static servers. A failed start closes servers already opened and does not move to another port or signal an unmanaged listener. `scripts/dev-server.sh` retains its PID, process-start-time, command-identity, and lifecycle-lock checks.

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
