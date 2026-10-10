import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
const serverFixture = `
import { createServer } from "node:http";
const args = process.argv.slice(2);
if (args.includes("--fail")) throw new Error("Requested startup failure");
const portIndex = args.indexOf("--port");
const port = portIndex === -1 ? 0 : Number(args[portIndex + 1]);
const server = createServer((_request, response) => {
  response.end(JSON.stringify({ pid: process.pid, args }));
});
server.listen(port, "127.0.0.1", () => {
  process.stdout.write("Gallery http://127.0.0.1:" + server.address().port + "\\n");
});
process.on("SIGTERM", () => {
  setTimeout(() => server.close(), args.includes("--delay-stop") ? 250 : 0);
});
`;

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "capyboard-dev-server-"));
  const root = join(directory, "project with spaces");
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, ".dev"));
  await writeFile(join(root, "scripts/dev.ts"), serverFixture);
  const script = join(root, "scripts/dev-server.sh");
  await writeFile(script, await readFile("scripts/dev-server.sh"));
  const command = (action: string, ...args: string[]) =>
    execute("bash", [script, action, ...args], { cwd: tmpdir(), timeout: 15000 });
  t.after(async () => {
    await command("stop");
    await rm(directory, { recursive: true, force: true });
  });
  const pidFile = join(root, ".dev/server.pid");
  const pid = async () => Number((await readFile(pidFile, "utf8")).split("\n")[0]);
  const url = async () => {
    const log = await readFile(join(root, ".dev/server.log"), "utf8");
    const match = log.match(/^Gallery (http:\/\/127\.0\.0\.1:\d+)$/m);
    assert.ok(match?.[1], log);
    return match[1];
  };
  return { root, command, pidFile, pid, url };
}

test("background dev server survives its launcher, restarts after shutdown, and stops cleanly", async (t) => {
  const { command, pidFile, pid, url } = await fixture(t);
  assert.match((await command("start", "--delay-stop")).stdout, /Started/);
  const firstPid = await pid();
  const firstUrl = await url();
  assert.equal(
    await (await fetch(firstUrl)).text(),
    JSON.stringify({ pid: firstPid, args: ["--delay-stop"] }),
  );
  assert.match((await command("start")).stdout, /Already running/);
  assert.equal(await pid(), firstPid);

  const port = new URL(firstUrl).port;
  assert.match((await command("restart", "--port", port, "--delay-stop")).stdout, /Started/);
  const secondPid = await pid();
  assert.notEqual(secondPid, firstPid);
  assert.equal(
    await (await fetch(firstUrl)).text(),
    JSON.stringify({ pid: secondPid, args: ["--port", port, "--delay-stop"] }),
  );
  assert.match((await command("stop")).stdout, /Stopped/);
  await assert.rejects(readFile(pidFile), { code: "ENOENT" });
  await assert.rejects(fetch(firstUrl));
  assert.match((await command("stop")).stdout, /Not running/);
});

test("stale and malformed PID records never signal unrelated processes", async (t) => {
  const { command, pidFile } = await fixture(t);
  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  t.after(() => unrelated.kill());
  assert.ok(unrelated.pid);
  const { stdout: started } = await execute("ps", ["-p", String(unrelated.pid), "-o", "lstart="]);
  await writeFile(pidFile, `${unrelated.pid}\n${started.trim()}\n`);
  await command("stop");
  process.kill(unrelated.pid, 0);
  await assert.rejects(readFile(pidFile), { code: "ENOENT" });

  for (const invalid of ["0", "-1", "not-a-pid", "99999999"]) {
    await writeFile(pidFile, `${invalid}\nold start time\n`);
    await command("stop");
    process.kill(unrelated.pid, 0);
    await assert.rejects(readFile(pidFile), { code: "ENOENT" });
  }
});

test("a reused PID with the right command but a different start time is not stopped", async (t) => {
  const { command, pidFile, url } = await fixture(t);
  await command("start");
  const record = await readFile(pidFile, "utf8");
  const serverUrl = await url();
  const [pid] = record.split("\n");
  await writeFile(pidFile, `${pid}\nincorrect start time\n`);
  try {
    await command("stop");
    assert.equal((await fetch(serverUrl)).status, 200);
  } finally {
    await writeFile(pidFile, record);
  }
});

test("concurrent lifecycle commands cannot overwrite the PID record", async (t) => {
  const { root, command, pidFile } = await fixture(t);
  const lock = join(root, ".dev/lock");
  await mkdir(lock);
  try {
    await assert.rejects(command("start"), /Another dev-server command is running/);
    await assert.rejects(readFile(pidFile), { code: "ENOENT" });
  } finally {
    await rm(lock, { recursive: true });
  }
});

test("occupied ports and failed starts leave the unmanaged server alone and keep diagnostics", async (t) => {
  const { root, command, pidFile } = await fixture(t);
  const unmanaged = spawn(process.execPath, [join(root, "scripts/dev.ts")]);
  t.after(() => unmanaged.kill());
  const [output] = await once(unmanaged.stdout, "data");
  const match = String(output).match(/Gallery (http:\/\/127\.0\.0\.1:\d+)/);
  assert.ok(match?.[1]);
  const serverUrl = match[1];
  await assert.rejects(command("start", "--port", new URL(serverUrl).port), /EADDRINUSE/);
  assert.equal((await fetch(serverUrl)).status, 200);
  await assert.rejects(readFile(pidFile), { code: "ENOENT" });
  await assert.rejects(command("start", "--fail"), /Requested startup failure/);
  assert.match(await readFile(join(root, ".dev/server.log"), "utf8"), /Requested startup failure/);
  await assert.rejects(readFile(pidFile), { code: "ENOENT" });
});
