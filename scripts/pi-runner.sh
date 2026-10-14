#!/usr/bin/env bash

(
  set -eu
  REPO="$PWD"
  ATTEMPT="$HOME/capyboard-attempts/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$HOME/capyboard-attempts"
  mkdir "$ATTEMPT" "$ATTEMPT/workspace"
  printf 'Evidence folder: %s\n' "$ATTEMPT"
  pi --version >"$ATTEMPT/pi-version.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$ATTEMPT/started-at.txt"
  PROMPT="$(<"$REPO/content/challenges/capybara-hoverboard-v1/prompt.txt")"$'\n'
  cd "$ATTEMPT/workspace"
  pi --mode json --model openai-codex/gpt-6-astra --thinking high \
    --no-approve --no-extensions --no-mcp --no-skills \
    --no-prompt-templates --no-context-files --no-themes \
    --tools read,bash,edit,write --session-dir "$ATTEMPT/sessions" \
    "$PROMPT" </dev/null >"$ATTEMPT/events.jsonl" 2>"$ATTEMPT/diagnostics.txt"
  node - "$ATTEMPT/events.jsonl" "$ATTEMPT/sessions" "$ATTEMPT/response.txt" "$ATTEMPT/usage.json" "$ATTEMPT/cost.json" <<'NODE'
const fs = require('node:fs')
const [eventsPath, sessionsPath, responsePath, usagePath, costPath] = process.argv.slice(2)
const readJsonl = (path) => fs.readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
const events = readJsonl(eventsPath)
const final = [...events].reverse().find((event) => event.type === 'message_end' && event.message?.role === 'assistant')
const content = final?.message?.content
const text = Array.isArray(content)
  ? content.filter((block) => block.type === 'text').map((block) => block.text).join('')
  : typeof content === 'string' ? content : ''
fs.writeFileSync(responsePath, text ? `${text}\n` : '')

const sessionFiles = fs.existsSync(sessionsPath)
  ? fs.readdirSync(sessionsPath).filter((name) => name.endsWith('.jsonl'))
  : []
const sessionEntries = sessionFiles.flatMap((name) => readJsonl(`${sessionsPath}/${name}`))
const usageRecords = sessionEntries.flatMap((entry) => {
  if (entry.type === 'message' && entry.message?.role === 'assistant' && entry.message.usage)
    return [{ type: 'assistant', provider: entry.message.provider, model: entry.message.model, usage: entry.message.usage }]
  if (entry.type === 'usage' && entry.usage) return [{ type: entry.kind ?? 'usage', provider: entry.provider, model: entry.model, usage: entry.usage }]
  if ((entry.type === 'compaction' || entry.type === 'branch_summary') && entry.usage)
    return [{ type: entry.type, usage: entry.usage }]
  return []
})
if (usageRecords.length > 0) fs.writeFileSync(usagePath, `${JSON.stringify(usageRecords, null, 2)}\n`)
const costs = usageRecords
  .filter(({ usage }) => usage.cost?.total !== undefined)
  .map(({ type, provider, model, usage }) => ({ type, provider, model, cost: usage.cost }))
if (costs.length > 0) fs.writeFileSync(costPath, `${JSON.stringify(costs, null, 2)}\n`)
NODE
  printf 'Generation finished. Evidence folder: %s\n' "$ATTEMPT"
)
