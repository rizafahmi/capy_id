import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, openSync } from "node:fs";
import { access, cp, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { summarize } from "./usage.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const harnessDirectory = resolve(scriptDirectory, "../..");
const flags = [
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  "--no-mcp",
  "--no-context-files",
  "--no-approve",
];
const settings = {
  compaction: { enabled: false },
  cacheWarming: "off",
  defaultProjectTrust: "never",
};
const prompt = `Implement the requirements in TASKS.md, including the sample data
specified in SCENARIO.md.

Read README.md and use the existing PORT and CAPY_NOW environment
settings when running the application.

Before finishing, run the documented project checks.
Summarize what you implemented, what you verified, and any known
failures or incomplete requirements.
`;
const baselineFiles = [
  "AGENTS.md",
  "README.md",
  "TASKS.md",
  "SCENARIO.md",
  "flake.nix",
  "flake.lock",
  "mix.lock",
];

function fail(message) {
  throw new Error(message);
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function canonical(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return join(await canonical(dirname(path)), basename(path));
  }
}

async function json(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON from ${path}: ${error.message}`, { cause: error });
  }
}

async function save(path, value, exclusive = false) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    flag: exclusive ? "wx" : "w",
    mode: 0o600,
  });
}

async function hash(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

function within(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("../") && path !== ".." && !isAbsolute(path));
}

function integer(value, label, minimum, maximum) {
  if (!/^\d+$/.test(String(value))) fail(`Invalid ${label}: ${value}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    fail(`${label} must be between ${minimum} and ${maximum}`);
  }
  return number;
}

async function executable(name) {
  for (const directory of (process.env.PATH ?? "").split(":")) {
    const path = resolve(directory, name);
    try {
      await access(path, constants.X_OK);
      if ((await lstat(path)).isDirectory()) continue;
      return path;
    } catch {}
  }
  fail(`Required executable is unavailable: ${name}`);
}

function environment(run, manifest, evaluation = false) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("PI_") ||
      [
        "MIX_ENV",
        "DATABASE_PATH",
        "PHX_SERVER",
        "PHX_BIND_IP",
        "MIX_HOME",
        "HEX_HOME",
        "MIX_XDG",
      ].includes(key)
    ) {
      delete env[key];
    }
  }
  return {
    ...env,
    CAPY_NOW: manifest.clock,
    PORT: String(evaluation ? manifest.evaluationPort : manifest.port),
    PHX_BIND_IP: "127.0.0.1",
    PI_CODING_AGENT_DIR: join(run, "private-pi"),
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
  };
}

async function execute(binary, args, options = {}) {
  const descriptors = [];
  function output(path) {
    const fd = openSync(path, "wx", 0o600);
    descriptors.push(fd);
    return fd;
  }
  let stdio = "inherit";
  let child;
  try {
    if (!options.interactive) {
      stdio = [
        "ignore",
        options.stdout ? output(options.stdout) : "pipe",
        options.stderr ? output(options.stderr) : "pipe",
      ];
    }
    child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio,
      detached: !options.interactive,
    });
  } finally {
    for (const fd of descriptors) closeSync(fd);
  }
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let interrupted = false;
  let spawnError;
  let escalation;
  const signal = (name) => {
    if (!child.pid) return;
    try {
      if (options.interactive) child.kill(name);
      else process.kill(-child.pid, name);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const stop = (name) => {
    signal(name);
    escalation ??= setTimeout(() => signal("SIGKILL"), 2000);
  };
  const interrupt = () => {
    interrupted = true;
    stop("SIGINT");
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const timer = options.seconds
    ? setTimeout(() => {
        timedOut = true;
        stop("SIGINT");
      }, options.seconds * 1000)
    : undefined;
  child.stdout?.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  child.on("error", (error) => {
    spawnError = error.message;
  });
  const result = await new Promise((resolveResult) => {
    child.on("close", (code, exitSignal) => resolveResult({ code, signal: exitSignal }));
  });
  clearTimeout(timer);
  clearTimeout(escalation);
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  if (options.cleanupGroup && !options.interactive) {
    signal("SIGTERM");
    await new Promise((done) => setTimeout(done, 100));
    signal("SIGKILL");
  }
  let code = result.code ?? 1;
  if (interrupted) code = 130;
  if (timedOut) code = 124;
  return {
    code,
    signal: result.signal,
    timedOut,
    interrupted,
    stdout,
    stderr,
    ...(spawnError ? { spawnError } : {}),
  };
}

async function must(binary, args, options = {}) {
  const result = await execute(binary, args, options);
  if (result.code !== 0) {
    fail(
      `${binary} ${args.join(" ")} failed (${result.code}). ${result.stderr || "See command logs."}`,
    );
  }
  return result.stdout.trim();
}

async function portAvailable(port) {
  const server = createServer();
  await new Promise((resolvePort, reject) => {
    server.once("error", () =>
      reject(new Error(`Port ${port} is unavailable; no process was stopped.`)),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolvePort));
  });
}

async function nix(run, manifest, command, args, options = {}) {
  return execute(
    manifest.nixExecutable,
    [
      "develop",
      `path:${join(run, "baseline")}`,
      "--no-write-lock-file",
      "--command",
      command,
      ...args,
    ],
    {
      cwd: options.evaluation ? join(run, "evaluation") : join(run, "workspace"),
      env: environment(run, manifest, options.evaluation),
      ...options,
    },
  );
}

async function check(run, manifest, directory, name, command, args, evaluation = false) {
  console.log(`${name}: ${command} ${args.join(" ")}`);
  const result = await nix(run, manifest, command, args, {
    evaluation,
    stdout: join(directory, `${name}.stdout.log`),
    stderr: join(directory, `${name}.stderr.log`),
  });
  await save(join(directory, `${name}.json`), {
    command: [command, ...args],
    exitCode: result.code,
    signal: result.signal,
  });
  return result.code;
}

async function fingerprints(run) {
  const paths = baselineFiles.map((name) => `baseline/${name}`);
  paths.push("artifacts/prompt.txt", "private-pi/settings.json");
  const result = {};
  for (const path of paths) result[path] = await hash(join(run, path));
  return result;
}

async function verifyInputs(run, manifest) {
  const actual = await fingerprints(run);
  if (JSON.stringify(actual) !== JSON.stringify(manifest.fingerprints)) {
    fail("Frozen instructions, dependencies, prompt, or Pi settings changed. Prepare a new run.");
  }
}

async function prepare(id, values, run) {
  if (!values.provider || !values.model) fail("prepare requires --provider and --model");
  const source = await realpath(resolve(values.source ?? join(homedir(), "code/capy_club")));
  if (within(source, run) || within(harnessDirectory, run)) {
    fail("Run directories must be outside the source and evaluation repositories.");
  }
  const port = integer(values.port ?? "4100", "port", 1024, 65535);
  const evaluationPort = integer(
    values["evaluation-port"] ?? "4101",
    "evaluation port",
    1024,
    65535,
  );
  if (port === evaluationPort) fail("Implementation and evaluation ports must differ.");
  const seconds = integer(values.seconds ?? "3600", "seconds", 1, 86400);
  const thinking = values.thinking ?? "high";
  if (!["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(thinking)) {
    fail("Unsupported thinking level");
  }
  const billing = values.billing ?? "unknown";
  if (!["subscription", "api", "unknown"].includes(billing)) fail("Invalid billing method");
  const git = await executable("git");
  const nixExecutable = await executable("nix");
  const piExecutable = values.pi ? await realpath(resolve(values.pi)) : await executable("pi");
  const baseline = await must(git, [
    "-C",
    source,
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${values.baseline ?? "fbf70bd"}^{commit}`,
  ]);
  await mkdir(dirname(run), { recursive: true, mode: 0o700 });
  try {
    await mkdir(run, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST")
      fail(`Run already exists: ${run}. Use a new ID; nothing was overwritten.`);
    throw error;
  }
  for (const path of [
    "baseline",
    "workspace",
    "private-pi",
    "artifacts",
    "artifacts/preflight",
    "artifacts/sessions",
    "artifacts/results",
  ]) {
    await mkdir(join(run, path), { mode: 0o700 });
  }
  const archive = join(run, "artifacts/baseline.tar");
  await must(git, ["-C", source, "archive", "--format=tar", "-o", archive, baseline]);
  await must("tar", ["-xf", archive, "-C", join(run, "baseline")]);
  for (const file of baselineFiles) await access(join(run, "baseline", file));
  await cp(join(run, "baseline"), join(run, "workspace"), { recursive: true });
  const workspace = join(run, "workspace");
  await must(git, ["init", "--template=", "-b", "main", workspace]);
  await must(git, ["-C", workspace, "config", "core.hooksPath", "/dev/null"]);
  await must(git, ["-C", workspace, "add", "."]);
  await must(git, [
    "-C",
    workspace,
    "-c",
    "user.name=Local Snapshot",
    "-c",
    "user.email=local@localhost",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "chore: initialize Capy Club",
  ]);
  await save(join(run, "private-pi/settings.json"), settings);
  await save(join(run, "artifacts/settings.json"), settings);
  await writeFile(join(run, "artifacts/prompt.txt"), prompt, { mode: 0o600 });
  const manifest = {
    schemaVersion: 1,
    id,
    source,
    baseline,
    workspaceCommit: await must(git, ["-C", workspace, "rev-parse", "HEAD"]),
    model: { provider: values.provider, id: values.model, thinking },
    billing,
    port,
    evaluationPort,
    seconds,
    clock: "2030-06-15T02:00:00Z",
    piExecutable,
    nixExecutable,
    createdAt: new Date().toISOString(),
    fingerprints: await fingerprints(run),
  };
  manifest.piVersion = await must(piExecutable, [...flags, "--version"], {
    env: environment(run, manifest),
    cwd: workspace,
  });
  await save(join(run, "run.json"), manifest);
  await portAvailable(port);
  const directory = join(run, "artifacts/preflight");
  const commands = [
    ["runtime", "elixir", ["--version"]],
    ["setup", "mix", ["setup"]],
    ["format", "mix", ["format", "--check-formatted"]],
    ["compile", "mix", ["compile", "--warnings-as-errors"]],
    ["tests", "mix", ["test"]],
    ["assets", "mix", ["assets.build"]],
    [
      "data-clock",
      "mix",
      [
        "run",
        "-e",
        `
users = CapyClub.Accounts.list_users() |> Enum.map(&{&1.name, &1.role}) |> Enum.sort()
expected = [{"Maya", "organizer"}, {"Arif", "organizer"}, {"Nia", "attendee"}, {"Bima", "attendee"}, {"Sari", "attendee"}] |> Enum.sort()
unless users == expected, do: raise("Unexpected identities")
unless CapyClub.Clock.now() == ~U[2030-06-15 02:00:00Z], do: raise("Clock is not frozen")
{:ok, local} = DateTime.shift_zone(CapyClub.Clock.now(), "Asia/Jakarta")
unless local.hour == 9, do: raise("Unexpected Jakarta time")
IO.inspect(local)
`,
      ],
    ],
  ];
  for (const [name, command, args] of commands) {
    if (await check(run, manifest, directory, name, command, args)) {
      fail(`Preflight failed at ${name}. No model task was launched. Logs: ${directory}`);
    }
  }
  if (await must(git, ["-C", workspace, "status", "--porcelain"])) {
    fail("Preflight changed workspace source. Investigate before preparing another run.");
  }
  await save(join(run, "artifacts/prepared.json"), { at: new Date().toISOString(), baseline });
  await reviewRecord(run);
  console.log(`Prepared ${run}\nNext: scripts/pilot/auth.sh ${id}`);
}

async function load(run) {
  if ((await lstat(run)).isSymbolicLink()) fail("Run directory must not be a symlink");
  const manifest = await json(join(run, "run.json"));
  if (manifest.schemaVersion !== 1) fail("Unsupported run manifest");
  integer(manifest.seconds, "seconds", 1, 86400);
  integer(manifest.port, "port", 1024, 65535);
  integer(manifest.evaluationPort, "evaluation port", 1024, 65535);
  if (!manifest.model?.provider || !manifest.model?.id) fail("Missing model selection");
  return manifest;
}

async function auth(run, manifest, action) {
  if (await exists(join(run, "artifacts/started.json")))
    fail("This run has already started; its profile is frozen.");
  let args;
  switch (action) {
    case "models":
      args = [...flags, "--list-models"];
      break;
    case "check":
      args = [...flags, "auth", "check", "--provider", manifest.model.provider, "--json"];
      break;
    case "login":
      args = [...flags, "--no-tools"];
      break;
    default:
      fail("auth actions: login, models, check");
  }
  if (action === "login")
    console.log(
      "Use /login, then Ctrl+D. Do not submit a model prompt. Credentials remain in private-pi/.",
    );
  return (
    await execute(manifest.piExecutable, args, {
      env: environment(run, manifest),
      cwd: join(run, "workspace"),
      interactive: true,
    })
  ).code;
}

async function snapshot(run, manifest) {
  const results = join(run, "artifacts/results");
  const workspace = join(run, "workspace");
  for (const [name, args] of [
    ["git-status.txt", ["status", "--porcelain=v1"]],
    ["changes.patch", ["diff", "--binary", manifest.workspaceCommit]],
    ["untracked-files.txt", ["ls-files", "--others", "--exclude-standard"]],
  ]) {
    await must("git", ["-C", workspace, ...args], { stdout: join(results, name) });
  }
  const archive = join(results, "source.tar.gz");
  await must("tar", [
    "--exclude=./.git",
    "--exclude=./_build",
    "--exclude=./deps",
    "--exclude=./.nix-mix",
    "--exclude=./.nix-hex",
    "--exclude=node_modules",
    "--exclude=*.db",
    "--exclude=*.db-*",
    "--exclude=*.sqlite",
    "--exclude=*.sqlite-*",
    "--exclude=*.sqlite3",
    "--exclude=*.sqlite3-*",
    "-czf",
    archive,
    "-C",
    workspace,
    ".",
  ]);
  await save(join(results, "snapshot.json"), {
    sha256: await hash(archive),
    createdAt: new Date().toISOString(),
  });
}

async function runAttempt(run, manifest) {
  if (await exists(join(run, "artifacts/started.json")))
    fail("Attempt already started. Use a new run ID; resuming would invalidate this attempt.");
  if (!(await exists(join(run, "artifacts/prepared.json")))) fail("Preflight has not passed.");
  await verifyInputs(run, manifest);
  if (await must("git", ["-C", join(run, "workspace"), "status", "--porcelain"])) {
    fail("Workspace changed after preflight. Prepare a new run.");
  }
  if (
    (await must("git", ["-C", join(run, "workspace"), "rev-parse", "HEAD"])) !==
    manifest.workspaceCommit
  ) {
    fail("Workspace baseline commit changed.");
  }
  const env = environment(run, manifest);
  const version = await must(manifest.piExecutable, [...flags, "--version"], { env });
  if (version !== manifest.piVersion) fail("Pi version changed after preparation.");
  await must(
    manifest.piExecutable,
    [...flags, "auth", "check", "--provider", manifest.model.provider, "--json"],
    { env },
  );
  await portAvailable(manifest.port);
  const startedAt = new Date().toISOString();
  await save(join(run, "artifacts/started.json"), { startedAt, manifest }, true);
  console.log(
    `Running ${manifest.model.provider}/${manifest.model.id}. No follow-up input. Logs: ${join(run, "artifacts")}`,
  );
  const args = [
    ...flags,
    "--offline",
    "--mode",
    "json",
    "--provider",
    manifest.model.provider,
    "--model",
    manifest.model.id,
    "--thinking",
    manifest.model.thinking,
    "--append-system-prompt",
    join(run, "baseline/AGENTS.md"),
    "--tools",
    "read,bash,edit,write",
    "--session-dir",
    join(run, "artifacts/sessions"),
    await readFile(join(run, "artifacts/prompt.txt"), "utf8"),
  ];
  let result;
  try {
    result = await nix(run, manifest, manifest.piExecutable, args, {
      seconds: manifest.seconds,
      cleanupGroup: true,
      stdout: join(run, "artifacts/events.jsonl"),
      stderr: join(run, "artifacts/stderr.log"),
    });
  } catch (error) {
    result = { code: 1, error: error.message, timedOut: false };
  }
  const completion = {
    startedAt,
    endedAt: new Date().toISOString(),
    exitCode: result.code,
    timedOut: result.timedOut,
    interrupted: result.interrupted ?? false,
    signal: result.signal ?? null,
    error: result.error ?? result.spawnError ?? null,
  };
  await save(join(run, "artifacts/completion.json"), completion);
  try {
    await snapshot(run, manifest);
  } catch (error) {
    completion.snapshotError = error.message;
    await save(join(run, "artifacts/completion.json"), completion);
    console.error(`Snapshot failed: ${error.message}. Keep the workspace intact.`);
  }
  await summarize(run);
  console.log(
    `Attempt stopped (${result.code}). Acceptance remains unreviewed. No automatic retry will run.`,
  );
  return result.code || (completion.snapshotError ? 1 : 0);
}

async function reviewRecord(run) {
  const target = join(run, "artifacts/results/acceptance.org");
  if (await exists(target)) return;
  const parts = [
    "#+title: Capy Club acceptance review",
    "",
    "* Overall result",
    "Status: evaluation incomplete",
    "",
    "* Evidence and findings",
    "Record each failure and unverified requirement with its evidence path.",
    "Passing submission tests does not establish acceptance. Do not repair the submission before judging it.",
    "",
  ];
  for (const name of ["TASKS.md", "SCENARIO.md"]) {
    parts.push(
      `* Frozen ${name}`,
      (await readFile(join(run, "baseline", name), "utf8"))
        .replace(/^(#{1,6})\s+/gm, (_, marks) => `${"*".repeat(marks.length + 1)} `)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[[$2][$1]]"),
    );
  }
  await writeFile(target, `${parts.join("\n")}\n`, { flag: "wx", mode: 0o600 });
}

async function inspect(run, manifest, action) {
  if (!["checks", "seed", "serve"].includes(action)) fail("inspect actions: checks, seed, serve");
  if (!(await exists(join(run, "artifacts/completion.json"))))
    fail("No completed attempt to inspect.");
  await verifyInputs(run, manifest);
  const archive = join(run, "artifacts/results/source.tar.gz");
  if ((await hash(archive)) !== (await json(join(run, "artifacts/results/snapshot.json"))).sha256) {
    fail("Source archive changed after capture.");
  }
  const evaluation = join(run, "evaluation");
  if (!(await exists(evaluation))) {
    if (action !== "checks") fail("Run inspect checks first to create the evaluation copy.");
    await mkdir(evaluation, { mode: 0o700 });
    await must("tar", ["-xzf", archive, "-C", evaluation]);
  } else if ((await lstat(evaluation)).isSymbolicLink()) {
    fail("Evaluation directory must not be a symlink.");
  }
  const directory = join(
    run,
    "artifacts/results",
    `${action}-${Date.now()}-${randomUUID().slice(0, 8)}`,
  );
  await mkdir(directory, { mode: 0o700 });
  if (action === "serve") {
    await portAvailable(manifest.evaluationPort);
    console.log(
      `Foreground server: http://127.0.0.1:${manifest.evaluationPort}. Ctrl+C stops it. No setup, migration, or seed commands run.`,
    );
    return (
      await nix(run, manifest, "mix", ["phx.server"], { evaluation: true, interactive: true })
    ).code;
  }
  if (action === "seed") {
    await access(join(evaluation, "priv/repo/scenario.exs"));
    return check(
      run,
      manifest,
      directory,
      "scenario",
      "mix",
      ["run", "priv/repo/scenario.exs"],
      true,
    );
  }
  if (await exists(join(run, "artifacts/evaluation-checked.json"))) {
    fail("Evaluation checks already ran. Existing evidence and database were not reset.");
  }
  const commands = [
    ["setup", ["setup"]],
    ["format", ["format", "--check-formatted"]],
    ["compile", ["compile", "--warnings-as-errors"]],
    ["tests", ["test"]],
    ["assets", ["assets.build"]],
  ];
  let failed = false;
  for (const [name, args] of commands) {
    const code = await check(run, manifest, directory, name, "mix", args, true);
    failed ||= code !== 0;
    if (name === "setup" && code !== 0) break;
  }
  await save(join(run, "artifacts/evaluation-checked.json"), { directory, passed: !failed });
  console.log(`Checks recorded in ${directory}. Independent acceptance remains incomplete.`);
  return failed ? 1 : 0;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(
      [
        "source",
        "baseline",
        "provider",
        "model",
        "thinking",
        "billing",
        "seconds",
        "port",
        "evaluation-port",
        "pi",
      ]
        .map((name) => [name, { type: "string" }])
        .concat([["help", { type: "boolean" }]]),
    ),
  });
  const [action, id, subcommand] = positionals;
  if (values.help) {
    console.log(`Usage:
  prepare.sh RUN_ID --provider PROVIDER --model MODEL [--source PATH] [--baseline COMMIT]
    [--thinking high] [--billing subscription|api|unknown] [--seconds 3600]
    [--port 4100] [--evaluation-port 4101] [--pi PATH]
  auth.sh RUN_ID [login|models|check]
  run.sh RUN_ID
  inspect.sh RUN_ID [checks|seed|serve]
  summarize.sh RUN_ID

CAPY_PILOT_ROOT defaults to ~/capy-pilots. No paid run starts until run.sh.
See scripts/pilot/README.md for the complete workflow and limitations.`);
    return;
  }
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id))
    fail(
      "Invalid run ID. Use 1-80 letters, digits, underscores, or hyphens, starting with a letter or digit.",
    );
  const root = await canonical(
    resolve(process.env.CAPY_PILOT_ROOT ?? join(homedir(), "capy-pilots")),
  );
  const run = join(root, id);
  if (action !== "prepare" && Object.keys(values).length)
    fail("Configure the run through prepare.sh, not per-command overrides.");
  if (action === "prepare") return prepare(id, values, run);
  const manifest = await load(run);
  if (action === "auth") process.exitCode = await auth(run, manifest, subcommand ?? "login");
  else if (action === "run") process.exitCode = await runAttempt(run, manifest);
  else if (action === "inspect")
    process.exitCode = await inspect(run, manifest, subcommand ?? "checks");
  else if (action === "summarize") {
    await summarize(run);
    console.log(join(run, "artifacts/results/usage.json"));
  } else fail("Unknown pilot command");
}

process.umask(0o077);
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
