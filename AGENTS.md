# Agent instructions

This web app is examplerary, state of the art web galery and eval system. Make
sure this project meet the baseline of modern web standards.

## Tech Stack

- Frontend: Astro
- Backend: Node with Astro and TypeScript
- Database: No database

## Coding Conventions

- Prefer use web standards over third party libraries for HTML, CSS and
  JavaScript. Use modern-web-guidance skill as a guidance.
- Minimalist Dependencies: Prioritize lightweight modules; avoid third-party
  dependencies whenever possible.
- Progressive Enhancement: All frontend pages must remain fully functional even
  if JavaScript is disabled in the browser.
- Server-Side Rendering (SSR): Every page must be rendered on the server using
  the designated templating engine.
- No Code Annotations: Do not include comments, annotations, or JSDoc in the
  source files.

## Development server

- Use `./scripts/dev-server.sh start`, `restart`, and `stop` for agent-run
  background servers. Do not background `npm run dev` or manage PIDs manually.
- Start and restart use real content by default. Pass `--fixtures` explicitly
  for demo data on each invocation.
- Run `./scripts/dev-server.sh stop` before `npm run test:e2e` to free the app
  ports.
- Never kill or adopt an unmanaged server occupying those ports. Report the
  conflict instead.
- See [README.md, Run locally](README.md#run-locally) for logs, PID records, and
  stale-lock handling.
