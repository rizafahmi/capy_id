# Capyboard

A static gallery of model attempts at one fixed challenge. Visitors can inspect
original evidence and compare two restricted previews. It is not a model
leaderboard.

The public app uses HTML, CSS, and vanilla JavaScript. Node.js 24 and strict
TypeScript handle import, validation, static generation, and screenshot capture.
There is no runtime backend or model API integration.

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

Follow [the curation workflow](docs/curation.md). Import preserves the response
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
- `scripts/build.ts` generates real gallery, challenge, run, and comparison
  routes.
- `src/` contains the shared shell CSS and browser controls.
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
