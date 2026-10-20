import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));

async function command(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const fake = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
if (name === 'nix') {
  const at = args.indexOf('--command');
  if (at < 0) process.exit(0);
  const result = cp.spawnSync(args[at + 1], args.slice(at + 2), {stdio:'inherit',env:process.env});
  process.exit(result.status ?? 1);
}
if (name === 'elixir') { console.log('Elixir 1.20.3'); process.exit(0); }
if (name === 'mix') {
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({tool:name,args,cwd:process.cwd()})+'\n');
  if (process.env.FAKE_MIX_FAIL === args[0]) process.exit(7);
  console.log('fixture mix ' + args.join(' '));
  process.exit(0);
}
if (args.includes('--version')) { console.log('1.2.0'); process.exit(0); }
if (args.includes('--list-models')) { console.log('fixture fixture-model'); process.exit(0); }
const profile = process.env.PI_CODING_AGENT_DIR;
if (args.includes('auth')) {
  const ready = fs.existsSync(path.join(profile,'auth.json'));
  console.log(JSON.stringify({status:ready ? 'ready' : 'not_ready'}));
  process.exit(ready ? 0 : 1);
}
if (!args.includes('--mode')) {
  fs.writeFileSync(path.join(profile,'auth.json'), 'private fixture credential');
  process.exit(0);
}
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({tool:'pi',args,profile,cwd:process.cwd(),clock:process.env.CAPY_NOW,inheritedModel:process.env.PI_MODEL})+'\n');
fs.writeFileSync('new-feature.txt','generated output');
fs.writeFileSync('README.md','implemented application\n');
fs.mkdirSync('priv/repo',{recursive:true});
fs.writeFileSync('priv/repo/scenario.exs','fixture scenario');
const usage = {input:10,cacheRead:20,cacheWrite:3,output:7,reasoning:2,totalTokens:40,cost:{total:0.125}};
console.log(JSON.stringify({type:'message_update',usage}));
console.log(JSON.stringify({type:'message_end',message:{role:'assistant',provider:'fixture',model:'fixture-model',usage,content:[{type:'text',text:'Finished'}],stopReason:'stop'}}));
if (process.env.FAKE_PI_MODE === 'timeout') setInterval(()=>{},1000);
else {
  console.log(JSON.stringify({type:'agent_settled',aborted:false}));
  if (process.env.FAKE_PI_MODE === 'error') process.exit(9);
}
`;

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "capy-pilot-test-")));
  const { mkdir, rm } = await import("node:fs/promises");
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source with spaces");
  const bins = join(root, "bin");
  await mkdir(source);
  await mkdir(bins);
  for (const name of ["pi", "nix", "mix", "elixir"]) {
    await writeFile(join(bins, name), fake);
    await chmod(join(bins, name), 0o755);
  }
  for (const name of ["AGENTS.md", "README.md", "TASKS.md", "SCENARIO.md"]) {
    await writeFile(join(source, name), `# ${name}\n\n- [ ] Required behavior\n`);
  }
  await writeFile(join(source, "flake.nix"), "fixture");
  await writeFile(join(source, "flake.lock"), "{}");
  await writeFile(join(source, "mix.lock"), "%{}");
  await writeFile(join(source, ".gitignore"), "_build/\ndeps/\n.nix-mix/\n.nix-hex/\n*.db\n");
  const git = (args) => command("git", ["-C", source, ...args]);
  assert.equal((await git(["init", "--template=", "-b", "main"])).code, 0);
  await git(["add", "."]);
  const commit = await git([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@localhost",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "-m",
    "fixture",
  ]);
  assert.equal(commit.code, 0, commit.stderr);
  await writeFile(join(source, "never-export.txt"), "uncommitted source data");
  const env = {
    ...process.env,
    PATH: `${bins}:${process.env.PATH}`,
    CAPY_PILOT_ROOT: join(root, "runs"),
    FAKE_LOG: join(root, "commands.jsonl"),
    PI_MODEL: "inherited-must-not-leak",
  };
  const run = join(env.CAPY_PILOT_ROOT, "first");
  const cli = (action, args = [], overrides = {}) =>
    command("bash", [join(scripts, `${action}.sh`), "first", ...args], {
      env: { ...env, ...overrides },
    });
  const prepare = (overrides = {}) =>
    cli(
      "prepare",
      [
        "--source",
        source,
        "--baseline",
        "HEAD",
        "--provider",
        "fixture",
        "--model",
        "fixture-model",
        "--seconds",
        "1",
        "--port",
        String(overrides.port ?? 49151),
        "--evaluation-port",
        "49152",
      ],
      overrides.env,
    );
  return { root, source, run, cli, prepare, env };
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

test("prepare exports committed source, preserves original data, and refuses reuse", async (t) => {
  const f = await fixture(t);
  const result = await f.prepare({ port: await freePort() });
  assert.equal(result.code, 0, result.stderr);
  await assert.rejects(readFile(join(f.run, "workspace/never-export.txt")), { code: "ENOENT" });
  assert.equal(
    await readFile(join(f.source, "never-export.txt"), "utf8"),
    "uncommitted source data",
  );
  const manifest = await json(join(f.run, "run.json"));
  assert.equal(manifest.model.id, "fixture-model");
  assert.equal(manifest.seconds, 1);
  assert.match(manifest.baseline, /^[a-f0-9]{40}$/);
  assert.equal((await f.prepare()).code, 1);
});

test("failed preflight and missing authentication prevent measured execution", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.prepare({ env: { FAKE_MIX_FAIL: "test" } })).code, 1);
  assert.equal((await f.cli("run")).code, 1);
  await assert.rejects(readFile(join(f.run, "artifacts/started.json")), { code: "ENOENT" });
});

test("successful run is isolated, captures new files, and cannot run twice", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.prepare({ port: await freePort() })).code, 0);
  assert.equal((await f.cli("run")).code, 1);
  assert.equal((await f.cli("auth")).code, 0);
  const result = await f.cli("run");
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await f.cli("run")).code, 1);
  const calls = (await readFile(f.env.FAKE_LOG, "utf8")).trim().split("\n").map(JSON.parse);
  const pi = calls.filter((call) => call.tool === "pi");
  assert.equal(pi.length, 1);
  assert.equal(pi[0].inheritedModel, undefined);
  assert.equal(pi[0].clock, "2030-06-15T02:00:00Z");
  assert.equal(pi[0].profile, join(f.run, "private-pi"));
  assert.ok(pi[0].args.includes("--no-context-files"));
  assert.ok(pi[0].args.includes(join(f.run, "baseline/AGENTS.md")));
  assert.ok(pi[0].args.includes("--no-extensions"));
  const archive = await command("tar", ["-tzf", join(f.run, "artifacts/results/source.tar.gz")]);
  assert.match(archive.stdout, /new-feature.txt/);
  assert.doesNotMatch(archive.stdout, /private-pi|auth.json/);
  assert.equal((await json(join(f.run, "artifacts/results/usage.json"))).reportedTokens.input, 10);
  assert.match(await readFile(join(f.source, "README.md"), "utf8"), /README.md/);
});

test("timeout preserves partial output and permanently consumes the attempt", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.prepare({ port: await freePort() })).code, 0);
  await f.cli("auth");
  const result = await f.cli("run", [], { FAKE_PI_MODE: "timeout" });
  assert.equal(result.code, 124, result.stderr);
  const completion = await json(join(f.run, "artifacts/completion.json"));
  assert.equal(completion.timedOut, true);
  assert.equal((await f.cli("run")).code, 1);
  assert.equal((await json(join(f.run, "artifacts/results/usage.json"))).reportedTokens.output, 7);
  const archive = await command("tar", ["-tzf", join(f.run, "artifacts/results/source.tar.gz")]);
  assert.match(archive.stdout, /new-feature.txt/);
});

test("occupied ports and modified workspaces are rejected before a paid attempt", async (t) => {
  const f = await fixture(t);
  const port = await freePort();
  assert.equal((await f.prepare({ port })).code, 0);
  await f.cli("auth");
  const server = createServer();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  try {
    const result = await f.cli("run");
    assert.equal(result.code, 1);
    assert.match(result.stderr, /port|Port/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  await writeFile(join(f.run, "workspace/README.md"), "changed before run");
  assert.equal((await f.cli("run")).code, 1);
  await assert.rejects(readFile(join(f.run, "artifacts/started.json")), { code: "ENOENT" });
});

test("inspection operates on a separate copy and serving never reseeds", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.prepare({ port: await freePort() })).code, 0);
  await f.cli("auth");
  assert.equal((await f.cli("run")).code, 0);
  const inspected = await f.cli("inspect", ["checks"]);
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.equal(
    await readFile(join(f.run, "evaluation/new-feature.txt"), "utf8"),
    "generated output",
  );
  assert.equal((await f.cli("inspect", ["seed"])).code, 0);
  const before = (await readFile(f.env.FAKE_LOG, "utf8")).trim().split("\n").length;
  assert.equal((await f.cli("inspect", ["serve"])).code, 0);
  const added = (await readFile(f.env.FAKE_LOG, "utf8"))
    .trim()
    .split("\n")
    .slice(before)
    .map(JSON.parse);
  assert.deepEqual(
    added.filter((c) => c.tool === "mix").map((c) => c.args),
    [["phx.server"]],
  );
  assert.match(
    await readFile(join(f.run, "artifacts/results/acceptance.org"), "utf8"),
    /evaluation incomplete/,
  );
});

test("a symlink cannot place run artifacts inside the source repository", async (t) => {
  const f = await fixture(t);
  const alias = join(f.root, "source-alias");
  await symlink(f.source, alias);
  const result = await f.prepare({ env: { CAPY_PILOT_ROOT: alias } });
  assert.equal(result.code, 1, result.stdout);
  assert.match(result.stderr, /outside/);
  await assert.rejects(readFile(join(f.source, "first/run.json")), { code: "ENOENT" });
});

test("path traversal run IDs are rejected", async () => {
  const result = await command("bash", [join(scripts, "prepare.sh"), "../escape"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /run ID/);
});
