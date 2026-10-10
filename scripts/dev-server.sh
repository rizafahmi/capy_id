#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$root"
node_binary=$(command -v node)
dev_script="$root/scripts/dev.ts"
state_dir="$root/.dev"
pid_file="$state_dir/server.pid"
log_file="$state_dir/server.log"

action=${1:-}
case "$action" in
start | stop | restart) shift ;;
*)
  echo "Usage: $0 {start|stop|restart} [dev arguments]" >&2
  exit 2
  ;;
esac
if [[ "$action" == stop && $# -gt 0 ]]; then
  echo "stop does not accept dev arguments" >&2
  exit 2
fi

mkdir -p "$state_dir"
if ! mkdir "$state_dir/lock" 2>/dev/null; then
  echo "Another dev-server command is running. If it crashed, remove $state_dir/lock." >&2
  exit 1
fi
trap 'rmdir "$state_dir/lock"' EXIT

start_time() {
  ps -p "$1" -o lstart= | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# A PID alone is unsafe after a process exits and its number is reused.
load_pid() {
  [[ -f "$pid_file" ]] || return 1
  local recorded_start actual_start process_command
  if { IFS= read -r pid && IFS= read -r recorded_start; } <"$pid_file" &&
    [[ "$pid" =~ ^[1-9][0-9]*$ ]]; then
    actual_start=$(start_time "$pid") || actual_start=""
    process_command=$(ps -p "$pid" -o command=) || process_command=""
    if [[ -n "$actual_start" && "$actual_start" == "$recorded_start" ]] &&
      [[ "$process_command" == "$node_binary $dev_script" || "$process_command" == "$node_binary $dev_script "* ]]; then
      return 0
    fi
  fi
  echo "Removed stale PID record." >&2
  rm -f "$pid_file"
  return 1
}

stop() {
  if ! load_pid; then
    echo "Not running."
    return
  fi
  local stopping_pid=$pid attempt
  kill -TERM "$stopping_pid"
  for ((attempt = 0; attempt < 100; attempt++)); do
    if ! load_pid; then
      echo "Stopped (PID $stopping_pid)."
      return
    fi
    sleep 0.1
  done
  echo "PID $stopping_pid did not stop within 10 seconds. PID record retained; no forced kill." >&2
  return 1
}

startup_failed() {
  echo "Dev server failed to start. See $log_file:" >&2
  tail -n 20 "$log_file" >&2
  rm -f "$pid_file"
  return 1
}

start() {
  if load_pid; then
    echo "Already running (PID $pid). Use restart to change dev arguments."
    return
  fi
  local started attempt actual_start
  nohup "$node_binary" "$dev_script" "$@" </dev/null >"$log_file" 2>&1 &
  pid=$!
  started=$(start_time "$pid") || {
    startup_failed
    return 1
  }
  printf '%s\n%s\n' "$pid" "$started" >"$pid_file"
  for ((attempt = 0; attempt < 600; attempt++)); do
    actual_start=$(start_time "$pid") || {
      startup_failed
      return 1
    }
    [[ "$actual_start" == "$started" ]] || {
      startup_failed
      return 1
    }
    # dev.ts prints this only after both gallery and preview servers listen.
    if grep -q '^Gallery http://' "$log_file" && load_pid; then
      echo "Started (PID $pid). Log: $log_file"
      return
    fi
    sleep 0.1
  done
  echo "Startup timed out after 60 seconds." >&2
  stop
  startup_failed
}

case "$action" in
start) start "$@" ;;
stop) stop ;;
restart)
  stop
  start "$@"
  ;;
esac
