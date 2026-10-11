# Agent instructions

This web app is an exemplary, state-of-the-art web gallery and evaluation
system. The goal is to make this project exemplary for personal evaluation.
Keep it aligned with modern web standards.

## Tech Stack

- Frontend and static rendering: Astro
- Tooling: Node.js 24 and TypeScript
- Production runtime: Static files with no runtime backend or database

## Coding Conventions

- Prefer use web standards over third party libraries for HTML, CSS and
  JavaScript. Use modern-web-guidance skill as a guidance.
- Minimalist Dependencies: Prioritize lightweight modules; avoid third-party
  dependencies whenever possible.
- Progressive Enhancement: All frontend pages must remain fully functional even
  if JavaScript is disabled in the browser.
- Rendered HTML: Every page must be rendered by Astro during development and
  production builds. Do not introduce client-only page rendering.
- No Code Annotations: Do not include comments, annotations, or JSDoc in the
  source files.

## Development server

- `npm run dev` is the canonical foreground command. It validates content and
  owns the gallery and isolated preview origins.
- Do not start a development server at every session start. For UI or browser
  work, use `./scripts/dev-server.sh start` as the idempotent check/start path;
  it reuses the managed server when one is already running and reports conflicts.
  Use `restart` when changing its arguments.
- Use `./scripts/dev-server.sh start`, `restart`, and `stop` for agent-run
  background servers. Do not background `npm run dev` or manage PIDs manually.
- Start and restart use real content by default. Pass `--fixtures` explicitly
  for demo data on each invocation.
- Content and curation changes are watched by the managed development process
  and become visible only after validation succeeds. Do not add an unvalidated
  content watcher or expose the content directory through Vite.
- Use `npm run build` for production generation. Do not invoke standalone
  `astro dev` or `astro build`; they bypass the validation and origin-isolation
  workflow.
- Run `./scripts/dev-server.sh stop` before `npm run test:e2e` to free the app
  ports.
- Never kill or adopt an unmanaged server occupying those ports. Report the
  conflict instead.
- See [README.md, Run locally](README.md#run-locally) for logs, PID records, and
  stale-lock handling.
