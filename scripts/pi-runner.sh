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
  pi --print --model meta/muse-spark-1.3-contributor --thinking max \
    --no-approve --no-extensions --no-mcp --no-skills \
    --no-prompt-templates --no-context-files --no-themes \
    --tools read,bash,edit,write --session-dir "$ATTEMPT/sessions" \
    "$PROMPT" </dev/null >"$ATTEMPT/response.txt" 2>"$ATTEMPT/diagnostics.txt"
  printf 'Generation finished. Evidence folder: %s\n' "$ATTEMPT"
)
