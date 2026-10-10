# Capyboard

A static gallery of model attempts at one fixed challenge. Visitors can inspect
original evidence and compare two restricted previews. It is not a model
leaderboard.

The public app uses HTML, CSS, and vanilla JavaScript. Node.js 24 and strict
TypeScript handle import, validation, static generation, and screenshot capture.
Astro generates the gallery, challenge, and run-detail pages. Comparison and
not-found pages use the existing renderer while migration proceeds one page type
at a time. There is no runtime backend or model API integration.

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
that command, not the previous invocation. Omit `--fixtures` to use real content.
The script only stops a matching process it recorded. It does not adopt or kill
an existing foreground or unmanaged server. Stop the background server before
running browser tests. A crashed command may leave `.dev/lock`; remove that
empty directory only after confirming no lifecycle command is still running.

Use these commands rather than standalone `astro dev` or `astro build`. They run
content validation and maintain both origins. The migration currently keeps
the build-on-start development server. Restart it after template or content edits.
Astro hot reloading is not wired into the two-origin server yet.

## Verify

```sh
npm run check
npm run validate
npm run test:e2e
```

The browser suite covers Chromium, Firefox, and WebKit. It exercises actual
generated routes, containment attempts, downloads, keyboard navigation,
responsive layouts, and automated accessibility checks. Tests also build a
100-run collection and check the compressed shell budget.

## Publish another attempt

Use [Pi to collect coding-agent attempts](docs/pi-collection.md), then follow
[the curation workflow](docs/curation.md). Import preserves the response
and selected HTML bytes. Publication and execution remain disabled until curator
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
- `scripts/build.ts` validates and stages both deployments, copies evidence, and
  generates the pages not yet migrated to Astro.
- `scripts/astro-pages.ts` builds Astro gallery, challenge, and run-detail routes inside the staging directory.
- `src/astro/` contains Astro pages, layouts, and components.
- `src/site.css` and `src/app.js` contain shared styles and vanilla browser controls.
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
