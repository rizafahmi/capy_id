#!/usr/bin/env bash

(
  set -eu
  REPO="$PWD"
  DSH_ROOT="$HOME/code/deepseek-harness"
  ATTEMPT="$HOME/capyboard-attempts/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$HOME/capyboard-attempts"
  mkdir "$ATTEMPT" "$ATTEMPT/workspace"
  printf 'Evidence folder: %s\n' "$ATTEMPT"
  pnpm --dir "$DSH_ROOT" exec node "$DSH_ROOT/apps/cli/lib/bin.js" --version >"$ATTEMPT/dsh-version.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$ATTEMPT/started-at.txt"
  PROMPT="$(<"$REPO/content/challenges/capybara-hoverboard-v1/prompt.txt")"$'\n'
  cd "$ATTEMPT/workspace"
  export DSH_ROOT
  DSH_WORKSPACE="$ATTEMPT/workspace"
  export DSH_WORKSPACE
  DSH_STATUS=0
  printf '%s' "$PROMPT" |
    pnpm --dir "$DSH_ROOT" exec sh -c \
      "cd \"\$DSH_WORKSPACE\" && exec node \"\$DSH_ROOT/apps/cli/lib/bin.js\" headless --json -" \
    >"$ATTEMPT/events.jsonl" \
    2>"$ATTEMPT/diagnostics.txt" || DSH_STATUS=$?
  node - "$ATTEMPT/events.jsonl" "$ATTEMPT/response.txt" "$ATTEMPT/usage.json" "$ATTEMPT/cost.json" <<'NODE'
const fs = require('node:fs')
const [eventsPath, responsePath, usagePath, costPath] = process.argv.slice(2)
const events = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const final = [...events].reverse().find(event => event.type === 'final')
fs.writeFileSync(responsePath, typeof final?.text === 'string' ? `${final.text}\n` : '')
const usage = events
  .filter(event => event.type === 'status' && event.phase === 'step_end' && event.usage !== undefined)
  .map(event => ({ turn: event.turn, step: event.step, usage: event.usage }))
if (usage.length > 0) fs.writeFileSync(usagePath, `${JSON.stringify(usage, null, 2)}\n`)
const costs = events
  .filter(event => event.cost !== undefined || event.usage?.cost !== undefined)
  .map(event => ({ type: event.type, cost: event.cost ?? event.usage.cost }))
if (costs.length > 0) fs.writeFileSync(costPath, `${JSON.stringify(costs, null, 2)}\n`)
NODE
  if [ "$DSH_STATUS" -ne 0 ]; then
    printf 'Generation failed. Evidence folder: %s\n' "$ATTEMPT"
    exit "$DSH_STATUS"
  fi
  printf 'Generation finished. Evidence folder: %s\n' "$ATTEMPT"
)
