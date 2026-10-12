(
  set -eu
  REPO="$PWD"
  ATTEMPT="$HOME/capyboard-attempts/$(date -u +%Y%m%dT%H%M%SZ)"
  AGY_MODEL="${AGY_MODEL:-gpt-oss-120b-medium}"
  mkdir -p "$HOME/capyboard-attempts"
  mkdir "$ATTEMPT" "$ATTEMPT/workspace"
  printf 'Evidence folder: %s\n' "$ATTEMPT"
  agy --version >"$ATTEMPT/agy-version.txt"
  printf '%s\n' "$AGY_MODEL" >"$ATTEMPT/agy-model.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$ATTEMPT/started-at.txt"
  PROMPT="$(<"$REPO/content/challenges/capybara-hoverboard-v1/prompt.txt")"$'\n'
  cd "$ATTEMPT/workspace"
  agy \
    --model "$AGY_MODEL" \
    --dangerously-skip-permissions \
    --disable-slash-commands \
    --log-file "$ATTEMPT/agy.log" \
    --print="$PROMPT" </dev/null \
    >"$ATTEMPT/response.txt" \
    2>"$ATTEMPT/diagnostics.txt"
  printf 'Generation finished. Evidence folder: %s\n' "$ATTEMPT"
)
