# Capy Club pilot commands

These scripts prepare and run one autonomous Pi attempt against the Capy Club
starter, preserve its output, and prepare a separate copy for review. They do
not implement the application, decide acceptance, or launch a model during
preparation.

Run commands from the `capy_id` repository. All generated data lives outside
this repository. Existing `eval/` contents are not used or modified.

## Requirements

- macOS or Linux, Bash, Git, tar, Node.js 22 or newer, Nix with flakes, and Pi.
- Pi must support `--no-context-files`, `--append-system-prompt`, JSON mode,
  `auth check`, and `PI_CODING_AGENT_DIR`. These commands target the documented
  Pi 1.2 CLI.
- The source repository defaults to `~/code/capy_club`, commit `fbf70bd`.
- The source must contain its Nix flake, lockfiles, instructions, requirements,
  and scenario specification.
- Network access is needed for uncached dependencies, authentication, and model
  calls. Preparation can take several minutes on a cold cache.

The shell entry points share dependency-free Node helpers for subprocess
lifecycle, JSON records, and usage accounting. No npm install is required for
these scripts themselves.

## 1. Choose the model and prepare

List the models available in your current Pi installation without loading
personal extensions or context:

```sh
pi --no-extensions --no-skills --no-mcp --no-context-files --list-models
```

Select exact provider and model IDs, then prepare a run:

```sh
cd ~/code/capy_id
printf 'Provider ID: '
read -r PROVIDER
printf 'Exact model ID: '
read -r MODEL

./scripts/pilot/prepare.sh pilot-001 \
  --source "$HOME/code/capy_club" \
  --baseline fbf70bd \
  --provider "$PROVIDER" \
  --model "$MODEL" \
  --thinking high \
  --billing subscription \
  --seconds 3600 \
  --port 4100 \
  --evaluation-port 4101
```

Choose a thinking level supported by the selected model. Use `--billing api`
for API billing, or `--billing unknown` when attribution is unclear. Billing
metadata does not change provider authentication or constrain spending.

The run is created at `~/capy-pilots/pilot-001`. To use another storage location,
set the same variable for every command:

```sh
export CAPY_PILOT_ROOT="$HOME/other-capy-runs"
```

Preparation:

1. Exports the exact committed source. Uncommitted changes and old Git history
   are not copied.
2. Creates a disposable workspace with a local baseline commit. It does not
   commit in or modify the original repository.
3. Creates a private, isolated Pi profile and a neutral development prompt.
4. Records the selected model, Pi version, baseline, ports, and deadline in
   `run.json`.
5. Enters the baseline's pinned Nix environment for setup, formatting,
   compilation, tests, asset building, identity checks, and clock checks.
6. Creates `artifacts/prepared.json` only after every check passes.

Existing run directories are never overwritten. If preparation fails, inspect
`artifacts/preflight/`, correct the environmental problem, and prepare another
run ID. No model implementation request has been sent.

The default clock is `2030-06-15T02:00:00Z`. The starter must contain the five
agreed users and support conversion to `Asia/Jakarta`.

## 2. Authenticate the isolated profile

```sh
./scripts/pilot/auth.sh pilot-001
```

Inside Pi, use `/login` and complete the provider login. Exit with Ctrl+D.
Do not send a model prompt in this authentication session.

Credentials are stored in the run's `private-pi/` directory, not copied from
`~/.pi/agent`. Never publish that directory. Existing provider API-key
environment variables can still affect authentication; unset the relevant
variable before these commands if you intend to use subscription login instead.

Check readiness and model availability:

```sh
./scripts/pilot/auth.sh pilot-001 check
./scripts/pilot/auth.sh pilot-001 models
```

If the isolated profile does not support the selected model, prepare a new run
with an available exact ID. Custom provider extensions are deliberately not
loaded by this plain-Pi workflow.

## 3. Start the measured attempt

This is the only command that sends the implementation prompt:

```sh
./scripts/pilot/run.sh pilot-001
```

The script refuses to start if preparation failed, instructions changed, source
changed after preparation, Pi's version changed, authentication is unavailable,
the application port is occupied, or the attempt has already started.

A fresh Pi invocation receives:

- Pi's default system prompt and the frozen project `AGENTS.md`.
- The prompt saved in `artifacts/prompt.txt`.
- The exact provider/model selection and requested thinking level.
- Built-in `read`, `bash`, `edit`, and `write` tools.
- No discovered parent context files, extensions, skills, MCP tools, prompt
  templates, or project Pi configuration.
- Automatic compaction and cache warming disabled.
- The fixed application clock and selected development port.

The requested reasoning level may be clamped by the provider. Inspect the
reported reasoning/model metadata in the saved session and usage summary.

No browser extension is supplied. The agent can use the shell and tools it
chooses to install. This limitation is part of the recorded plain-Pi baseline,
not a claim that this matches your customized daily setup.

Once `artifacts/started.json` is written, the attempt cannot be restarted, even
if it fails immediately. Authentication and port failures before that marker do
not consume an attempt. The start record contains a copy of the run manifest.

Do not answer questions, send follow-up prompts, edit the workspace, or repair
failures while the agent runs. Internal agent testing and provider retries
remain part of the same attempt.

The deadline covers the launched Nix/Pi process. On timeout or Ctrl+C, the
supervisor interrupts its own process group, then escalates if needed. It never
kills a process merely because it occupies a port. On normal completion it also
stops background children still in that owned group before taking the source
snapshot. Deliberately daemonized processes can escape that group; inspect
remaining processes manually rather than killing by port.

Typical exit codes:

| Code          | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| 0             | Process completed and source capture succeeded; not application acceptance |
| 1             | Preparation/check/capture failure, or an underlying process failure        |
| 124           | Deadline reached                                                           |
| 130           | Interrupted by the operator                                                |
| Other nonzero | Underlying process exit code                                               |

Watch diagnostic output from a separate terminal:

```sh
tail -f ~/capy-pilots/pilot-001/artifacts/stderr.log
```

No model call is needed to inspect these files.

## 4. Inspect the preserved output

Review the generated source before executing it. Then run:

```sh
./scripts/pilot/inspect.sh pilot-001 checks
```

This checks the captured source archive's hash, extracts it into `evaluation/`,
and runs `mix setup`, formatting checks, compilation, tests, and asset building
in the original baseline's Nix environment. Check logs and exit statuses go into
a uniquely named directory under `artifacts/results/`.

It does not run `mix precommit`, apply formatting fixes, or edit the submission
to make checks pass. Project-defined Mix aliases still execute submission code;
this is not a sandbox. `mix setup` initializes only the separate evaluation
copy, and may modify dependencies according to the submission's configuration.

Setup/checks run once per evaluation copy. Repeating the command is refused so
it cannot silently reinitialize a database used for persistence checks.

Seed the required scenario explicitly:

```sh
./scripts/pilot/inspect.sh pilot-001 seed
```

A missing or failing scenario script is evidence of an incomplete submission.
The script is not supplied or repaired by this tool. Repeating `seed` is allowed
as a probe: a correct submission should refuse populated scenario tables without
changing their contents. Logs from each call are preserved separately.

Start the review server in the foreground:

```sh
./scripts/pilot/inspect.sh pilot-001 serve
```

Open `http://127.0.0.1:4101`, or the evaluation port selected during preparation.
Ctrl+C stops this foreground server. `serve` runs only `mix phx.server`; it does
not initialize, migrate, or seed the database.

For a persistence check, create distinctive data in the browser, stop the
server, and run `serve` again. Do not rerun setup or seeding between starts.

For tests needing another clock instant or custom probes, work only in the
`evaluation/` copy. Use the baseline's Nix environment explicitly rather than
changing the recorded measured attempt:

```sh
RUN="$HOME/capy-pilots/pilot-001"
cd "$RUN/evaluation"
CAPY_NOW=2030-06-16T02:00:00Z PORT=4101 \
  nix develop "path:$RUN/baseline" --command mix phx.server
```

Stop the existing evaluation server first. That instant makes Quiet Build
Morning started exactly at its boundary. No automatic source repair or agent
continuation is performed.

## 5. Review acceptance and usage

```sh
./scripts/pilot/summarize.sh pilot-001
```

The run command already produces the usage summary. This command regenerates it
from the preserved event stream without a model call or changes to the review
record.

Review these files:

| File                                    | Purpose                                                |
| --------------------------------------- | ------------------------------------------------------ |
| `run.json`                              | Prepared configuration                                 |
| `artifacts/started.json`                | Configuration at measured launch                       |
| `artifacts/completion.json`             | Exit status, timeout/interruption, capture errors      |
| `artifacts/events.jsonl`                | Raw Pi events, including tool calls and reported usage |
| `artifacts/sessions/`                   | Persistent Pi session files                            |
| `artifacts/stderr.log`                  | Runtime diagnostics                                    |
| `artifacts/results/source.tar.gz`       | Final source including newly created files             |
| `artifacts/results/snapshot.json`       | Source archive SHA-256                                 |
| `artifacts/results/changes.patch`       | Tracked-file differences from the workspace baseline   |
| `artifacts/results/untracked-files.txt` | Newly created untracked paths                          |
| `artifacts/results/final-response.txt`  | Last nonempty assistant text                           |
| `artifacts/results/usage.json`          | Reported usage, estimates, completeness warnings       |
| `artifacts/results/acceptance.org`      | Frozen requirements and manual acceptance record       |

Database and build/cache files are excluded from the portable source archive.
The original workspace, including its databases, is left in place. The archive
is not a database backup. Preserve a SQLite backup separately if its intermediate
state is important to a finding.

Usage accounting includes final assistant messages only. It does not sum
streaming updates, `turn_end`, or `agent_end` copies. Reported reasoning is
already part of output. Missing fields, zero usage, malformed/truncated events,
unexpected compaction, and nested model usage remain explicit. Additional tool
and compaction usage is listed separately and needs review before describing a
figure as total run cost.

Pi's cost is an estimate, not a billing statement. `actualBilledCostUsd` remains
null. Subscription-backed usage is not automatically free.

Edit `acceptance.org` with independent evidence. Leave the result as
`evaluation incomplete` until all requirements are checked. A completed process
and passing submission tests do not imply acceptance. Specifically verify:

- Role/ownership enforcement through server operations, not just hidden UI.
- Duplicate registration and competing requests for the final spot.
- Cancellation, re-registration, and cancellation-history visibility.
- Exact start-time boundaries and Jakarta form/display behavior.
- Scenario correctness and atomic refusal when data already exists.
- Restart persistence without initialization or seeding.
- Keyboard use and layout at 390px and 1440px.

Request/event names depend on the generated implementation. Independent probes
for those operations must be written after inspecting it, outside the coding
workspace. Do not pretend a generic browser click is a concurrency test.

## Safety and scope

Run directories must be outside both repositories. No command resets or removes
a run directory, modifies the original source repository, or publishes results.
The only automatic Git commit is the initial snapshot inside the new disposable
workspace; signing and hooks are disabled there.

This is configuration and data organization, not operating-system isolation.
The agent and submitted Mix code run with your user permissions. Parent
instructions are not automatically loaded, but files outside the workspace are
not access-controlled. Use a separate OS user/container if that boundary is
required. Never publish `private-pi/`, and inspect transcripts for secrets before
sharing artifacts. External API-key environment variables are not scrubbed.

Run-specific settings should be chosen during `prepare`. Do not edit frozen
instructions, prompt, or Pi settings after preparation. Do not change `run.json`
after the attempt starts. Use a new ID for another attempt or changed protocol.

If the supervisor is killed with SIGKILL or the machine crashes, automatic final
capture may not finish. Keep the workspace and raw logs; the start marker still
prevents accidental duplicate spending. Such an attempt needs manual forensic
recovery, not a resumed model session.

## Script verification

```sh
node --test scripts/pilot/*.test.mjs
npx biome check scripts/pilot
for script in scripts/pilot/*.sh; do bash -n "$script"; done
```

The tests exercise the actual shell entry points with temporary Git repositories
and fake Pi/Nix/Mix executables. They do not call a paid model. They cover
preflight/authentication gates, occupied ports, source isolation, repeat-run
refusal, deadline capture, source snapshots, separate evaluation, and usage
accounting.
