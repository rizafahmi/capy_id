# Capyboard

A static gallery of model attempts at one fixed challenge. Visitors can inspect
original evidence and compare two restricted previews. It is not a model
leaderboard.

The public app uses HTML, CSS, and vanilla JavaScript. Node.js 24 and strict
TypeScript handle import, validation, static generation, and screenshot capture.
Astro generates every gallery page, including the not-found document. The
separate preview deployment keeps preserved HTML and a minimal fallback under
its stricter policy. There is no runtime backend or model API integration.

This web app is an exemplary, state-of-the-art web gallery and evaluation
system. The goal is to make this project exemplary for personal evaluation. Keep
it aligned with modern web standards.

## Run locally

Use Node.js 24 or later. Install machine tooling through your existing Nix
development environment.

```sh
npm ci
npm exec playwright install chromium firefox webkit
npm run dev -- --fixtures
```

Open http://127.0.0.1:4173. The separate preview origin uses port 4174. All demo
attempts are labelled development fixtures, not genuine model experiments. Stop
the server with Ctrl+C before running browser tests.

`npm run dev` uses the real `content/` collection, which starts empty. Neither
command needs a secret.

For a managed background server:

```sh
./scripts/dev-server.sh start --fixtures
./scripts/dev-server.sh restart --fixtures
./scripts/dev-server.sh stop
```

PID and process start time are recorded in `.dev/server.pid`; output goes to
`.dev/server.log`. Restart waits for shutdown and uses the arguments supplied to
that command, not the previous invocation. Omit `--fixtures` to use real
content. The script only stops a matching process it recorded. It does not adopt
or kill an existing foreground or unmanaged server. Stop the background server
before running browser tests. A crashed command may leave `.dev/lock`; remove
that empty directory only after confirming no lifecycle command is still
running.

Use these commands rather than standalone `astro dev` or `astro build`. They run
content validation and maintain both origins. Astro renders gallery pages live.
Template edits update open browsers. CSS, JavaScript, and local asset edits
trigger a full page reload. Reloading restores filters from the URL and stops
active previews.

The gallery can filter by provider, exact model identifier, coding harness,
recorded effort (including unknown), and generation mode. It can also sort by
name or newest attempt. Copy the address to share the current view. These controls use
browser JavaScript; without it, every published attempt remains browsable.

Restart after tooling or configuration edits. Content and curation changes
trigger a debounced validated rebuild. Invalid changes leave the last good
gallery and preview available. Development uses a validated content snapshot,
not a live unvalidated collection. Its output contains prepared artifacts rather
than deployable gallery HTML. Run `npm run build` before publishing. The
development gallery permits its local HMR WebSocket. Preview and production
security policies stay unchanged.

## Verify

```sh
npm run check
npm run validate
npm run test:e2e
```

The browser suite covers Chromium, Firefox, and WebKit. It first tests live
source updates and managed server lifecycle in a temporary project copy. It then
exercises Astro routes, containment attempts, downloads, keyboard navigation,
responsive layouts, and automated accessibility checks. Static build tests cover
generated routes and a 100-run collection's compressed shell budget. Stop
development servers before `npm run test:e2e`; the integration tests use the
same local ports.

## Publish another attempt

Use [Pi to collect coding-agent attempts](docs/pi-collection.md), then follow
[the curation workflow](docs/curation.md). Import preserves the response and
selected HTML bytes. Publication and execution remain disabled until curator
review. Screenshot capture records its browser, viewport, delay, and preview
policy.

Build the two static deployments with their actual HTTPS origins.

```sh
npm run build -- --gallery-origin "$GALLERY_ORIGIN" --preview-origin "$PREVIEW_ORIGIN"
```

Deploy `dist/gallery/` and `dist/preview/` separately. See
[deployment requirements](docs/deployment.md). A hosting provider must enforce
the generated response headers. Merely uploading HTML is not enough.

## Project map

- `scripts/schema.ts` defines the content model and validation types.
- `scripts/content.ts` imports evidence and verifies historical integrity.
- `scripts/build.ts` validates and stages both deployments, prepares page data,
  and copies original evidence and previews.
- `scripts/astro-pages.ts` builds all gallery pages and the static 404 document
  inside the staging directory.
- `scripts/astro-config.ts` shares the validated rendering configuration.
- `scripts/astro-dev.ts` connects Astro development rendering to prepared
  artifacts and source reloads.
- `src/astro/` contains Astro pages, layouts, and components.
- `src/site.css` and `src/app.js` contain shared styles and vanilla browser
  controls.
- `content/` contains immutable evidence and separate mutable curation records.
- `tests/` contains content, build, and browser acceptance tests.
- `schemas/` contains generated JSON schemas. Regenerate with
  `node scripts/cli.ts schemas`.
- `PLAN.md` and `decisions.tsv` record delivery gates and decisions.

[Architecture](docs/architecture.md) explains the boundaries.
[Verification](docs/verification.md) records checks and limitations.

## Launch status

The implementation uses test fixtures until the founder supplies genuine
outputs. Public launch needs attempts from at least three identified models,
provenance review, feasible screenshots, and verification of the deployed routes
and headers.

Sandboxing limits capabilities but does not guarantee CPU isolation or prevent
every navigation path. Enable only curator-reviewed outputs. Do not use
Capyboard to host arbitrary hostile code.
