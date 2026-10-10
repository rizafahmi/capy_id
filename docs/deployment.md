# Deploy two static sites

## Build

Choose distinct HTTPS origins. Set these variables to the actual origins, not route paths.

```sh
export GALLERY_ORIGIN="https://your-gallery-host"
export PREVIEW_ORIGIN="https://your-preview-host"
npm ci
npm run check
npm run validate
npm run build -- --gallery-origin "$GALLERY_ORIGIN" --preview-origin "$PREVIEW_ORIGIN"
```

The build rejects identical origins and insecure production origins. It also rejects labelled development fixtures. The default collection starts empty; a successful empty build does not satisfy the launch-content gate.

Deploy `dist/gallery/` as the gallery site and `dist/preview/` as the preview site. Do not upload `content/`, `.fixture-content/`, or the entire repository as a public document root. Do not serve previews through a same-origin gallery proxy.

## Hosting configuration example

Each deployment contains a generated `_headers` file using Netlify-style static header syntax. A compatible host must apply it as response headers, not serve it as an inert text file. For another host, translate the same generated policies into its header configuration.

The gallery headers allow its own local assets and frames only from the configured preview origin. Preview headers enforce `restricted-html-v1`, including the HTTP-only sandbox directive. Evidence routes require `Content-Type: text/plain; charset=utf-8` and `X-Content-Type-Options: nosniff`. Both sites include permissions restrictions and a no-referrer policy. HTTPS deployments include HSTS.

Use ordinary directory index routes. Do not configure a SPA success fallback. Unknown run IDs must return the generated useful 404 with HTTP status 404.

Both origins are static. No Worker, Node server, API, secret, or model key belongs in production. Keep the preview origin free of application credentials and sensitive cookies.

## Verify actual HTTP responses

After deployment run this command against the public origins.

```sh
npm run verify:deployment -- --gallery-origin "$GALLERY_ORIGIN" --preview-origin "$PREVIEW_ORIGIN" --launch
```

The verifier checks deep links, unknown-run 404 behavior, enforced security headers, source MIME types, and source/preview checksums over HTTP. Launch mode requires at least three distinct identified models on challenge v1. Human review must still establish genuine provenance. A fabricated identity cannot become genuine through a passing script.

Also drive the deployed gallery, evidence downloads, and comparison in a browser. Static host redirects and header precedence can differ from local serving. A provider that cannot enforce the preview response headers does not satisfy the PRD.

For local header verification while the dev server is running use this command.

```sh
npm run verify:deployment -- --gallery-origin http://127.0.0.1:4173 --preview-origin http://127.0.0.1:4174 --development
```

Only localhost development accepts HTTP. Do not use `--development` for a public release.

## Replace or retract content

Rebuild and replace both deployment roots as one release. Do not merge generated files into an old deployment and leave removed run routes behind. Review the resulting static 404 behavior after hiding a run. Keep its original evidence in version control.

Production deployment has not been performed in this implementation session. Domains, hosting credentials, genuine attempts, and a deployed-header check remain founder launch work.
