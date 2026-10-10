# Collect a Pi attempt

Use a terminal with Pi installed and signed in to `openai-codex`. Install this project's dependencies with `npm ci` first.

## 1. Generate the HTML

For this checkout, first run `cd /Users/riza/code/capy_id`.

Paste the following block unchanged. It creates a new evidence folder automatically. To try another model later, change only `openai-codex/gpt-6-luna`.

```sh
(
	set -eu
	REPO="$PWD"
	ATTEMPT="$HOME/capyboard-attempts/$(date -u +%Y%m%dT%H%M%SZ)"
	mkdir -p "$HOME/capyboard-attempts"
	mkdir "$ATTEMPT" "$ATTEMPT/workspace"
	printf 'Evidence folder: %s\n' "$ATTEMPT"
	pi --version > "$ATTEMPT/pi-version.txt"
	date -u +%Y-%m-%dT%H:%M:%SZ > "$ATTEMPT/started-at.txt"
	PROMPT="$(< "$REPO/content/challenges/capybara-hoverboard-v1/prompt.txt")"$'\n'
	cd "$ATTEMPT/workspace"
	pi --print --model openai-codex/gpt-6-luna --thinking low \
		--no-approve --no-extensions --no-mcp --no-skills \
		--no-prompt-templates --no-context-files --no-themes \
		--tools read,bash,edit,write --session-dir "$ATTEMPT/sessions" \
		"$PROMPT" < /dev/null > "$ATTEMPT/response.txt" 2> "$ATTEMPT/diagnostics.txt"
	printf 'Generation finished. Evidence folder: %s\n' "$ATTEMPT"
)
```

Wait for `Generation finished`. If it does not appear, open `diagnostics.txt` in the printed folder. Keep the failed attempt. Do not overwrite or repair it.

The folder contains `response.txt`, the original Pi session under `sessions/`, and the agent's files under `workspace/`. It remains on disk. No metadata copy or manual ID assignment is needed.

## 2. Ask Pi to import the attempt

Return to your Pi coding session for this repository. Paste this request, replacing `[evidence folder]` with the absolute folder path printed above.

```text
Import the Pi attempt at [evidence folder] into Capyboard.
Read its saved session to obtain the actual provider, model, timestamp, tool use, and all user and assistant text turns.
Create metadata.json and transcript.json in that evidence folder. Use a stable run ID based on the session ID and challenge capybara-hoverboard-v1. Record generation.harness with name Pi, version from pi-version.txt, and effort from the session's thinkingLevel.
Record generation.metrics. For time, use kind model and duration_ms from the sum of assistant durationMs values. If any response lacks a duration, use time null. For tokens, sum Pi usage.input, usage.cacheRead as cached, usage.output, and usage.totalTokens as total. Include every model call and auxiliary usage entry belonging to this attempt. Preserve Pi's reported total. Use null for unavailable measurements, not zero. Do not count reasoning tokens twice or mistake model time for tool-inclusive elapsed time.
Do not record temperature, top_p, token limits, seed, or a system-instruction flag.
Import response.txt with those files using the existing importer, then run npm run validate. Preserve the response bytes and actual transcript. Do not repair output, publish the run, or enable its preview.
Report the run ID and validation result. Keep the original Pi session private.
```

Pi prepares the import files. The importer writes evidence to `content/runs/<run-id>/` and an unpublished record to `content/curation/<run-id>.json`.

## 3. Review before publishing

Follow [curator review and screenshot capture](curation.md#review-and-publish-locally). Never enable an unreviewed preview.

The command disables discovered project instructions and extensions, but retains Pi's built-in instructions and agent-directory configuration. Pi tools are not a security sandbox.
