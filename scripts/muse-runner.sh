#!/usr/bin/env bash

(
  set -eu
  REPO="$PWD"
  ATTEMPT="$HOME/capyboard-attempts/$(date -u +%Y%m%dT%H%M%SZ)"
  MUSE_MODEL="${MUSE_MODEL:-muse-spark-1.3-contributor}"
  MUSE_REASONING_EFFORT="${MUSE_REASONING_EFFORT:-medium}"
  mkdir -p "$HOME/capyboard-attempts"
  mkdir "$ATTEMPT" "$ATTEMPT/workspace"
  printf 'Evidence folder: %s\n' "$ATTEMPT"
  muse --version >"$ATTEMPT/muse-version.txt"
  printf '%s\n' "$MUSE_MODEL" >"$ATTEMPT/muse-model.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$ATTEMPT/started-at.txt"
  PROMPT="$REPO/content/challenges/capybara-hoverboard-v1/prompt.txt"
  cd "$ATTEMPT/workspace"
  muse exec \
    --model "$MUSE_MODEL" \
    --reasoning-effort "$MUSE_REASONING_EFFORT" \
    --prompt-file "$PROMPT" \
    --workspace "$ATTEMPT/workspace" \
    --yolo \
    --no-foreign-personal-context \
    --disable-web-tools \
    --no-session-log \
    >"$ATTEMPT/response.txt" \
    2>"$ATTEMPT/diagnostics.txt"
  printf 'Generation finished. Evidence folder: %s\n' "$ATTEMPT"
)
