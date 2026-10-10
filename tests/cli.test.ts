import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { jsonBytes, sha256 } from "../scripts/content.ts";

const execute = promisify(execFile);

test("CLI schema export excludes legacy controls from new metadata", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "capyboard-schema-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await execute(process.execPath, [join(process.cwd(), "scripts/cli.ts"), "schemas"], {
    cwd: directory,
  });
  const metadata = JSON.parse(await readFile(join(directory, "schemas/metadata.json"), "utf8"));
  const run = JSON.parse(await readFile(join(directory, "schemas/run.json"), "utf8"));
  assert.deepEqual(metadata.properties.generation.required, ["mode", "interface", "tools_used"]);
  assert.deepEqual(Object.keys(metadata.properties.generation.properties), [
    "mode",
    "interface",
    "tools_used",
    "harness",
    "metrics",
  ]);
  assert.deepEqual(run.properties.generation.required, ["mode", "interface", "tools_used"]);
});

test("CLI imports the Pi metadata example without generation controls", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "capyboard-pi-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "content");
  const cli = (command: string, args: string[] = []) =>
    execute(process.execPath, ["scripts/cli.ts", command, "--content", root, ...args]);
  await cli("init");
  const response = join(directory, "response.txt");
  const bytes = Buffer.from("<!doctype html><html><body>CLI Pi evidence</body></html>\r\n");
  await writeFile(response, bytes);
  const transcript = join(directory, "transcript.json");
  await writeFile(
    transcript,
    jsonBytes({
      schema_version: 1,
      turns: [
        {
          role: "user",
          content: await readFile(
            join(root, "challenges/capybara-hoverboard-v1/prompt.txt"),
            "utf8",
          ),
        },
      ],
    }),
  );
  const result = await cli("import", [
    "--metadata",
    "examples/pi-import-metadata.json",
    "--response",
    response,
    "--transcript",
    transcript,
  ]);
  assert.match(result.stdout, /Imported example-pi-attempt-001/);
  const run = JSON.parse(
    await readFile(join(root, "runs/example-pi-attempt-001/run.json"), "utf8"),
  );
  assert.deepEqual(run.generation, {
    mode: "tool-assisted",
    interface: "coding-agent",
    tools_used: "unknown",
    harness: { name: "Pi", version: null, effort: null },
    metrics: {
      time: null,
      tokens: { input: null, cached: null, output: null, total: null },
    },
  });
  assert.deepEqual(await readFile(join(root, run.artifacts.response.path)), bytes);
  assert.deepEqual(await readFile(join(root, run.artifacts.html.path)), bytes);
  assert.match((await cli("validate")).stdout, /1 attempts/);
});

test("CLI import, publication, build, and prior-ledger validation work end to end", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "capyboard-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "content");
  const cli = (command: string, args: string[] = []) =>
    execute(process.execPath, ["scripts/cli.ts", command, "--content", root, ...args]);
  await cli("init");
  const baseline = join(directory, "prior-integrity.json");
  await writeFile(baseline, await readFile(join(root, "integrity.json")));
  const metadata = join(directory, "metadata.json");
  await writeFile(metadata, await readFile("examples/import-metadata.json"));
  const response = join(directory, "response.txt");
  const source = Buffer.from("<!doctype html><html><body>Exact CLI evidence 🦫</body></html>\r\n");
  await writeFile(response, source);
  const args = ["--metadata", metadata, "--response", response];
  assert.match((await cli("import", args)).stdout, /Imported example-attempt-001/);
  await assert.rejects(cli("import", args), /Run ID already exists/);
  const curationPath = join(root, "curation/example-attempt-001.json");
  const curation = JSON.parse(await readFile(curationPath, "utf8"));
  assert.equal(curation.visible, false);
  assert.equal(curation.preview_allowed, false);
  await writeFile(
    curationPath,
    jsonBytes({
      ...curation,
      visible: true,
      published_at: "2026-10-09T00:00:00Z",
      series_publication_complete: true,
    }),
  );
  assert.match((await cli("validate", ["--prior-integrity", baseline])).stdout, /1 attempts/);
  const out = join(directory, "site");
  await cli("build", [
    "--out",
    out,
    "--gallery-origin",
    "https://gallery.example",
    "--preview-origin",
    "https://preview.example",
  ]);
  assert.deepEqual(
    await readFile(join(out, "gallery/evidence/runs/example-attempt-001/output.html.txt")),
    source,
  );
  assert.match(
    await readFile(join(out, "gallery/runs/example-attempt-001/index.html"), "utf8"),
    /Live preview unavailable/,
  );
  await writeFile(baseline, await readFile(join(root, "integrity.json")));
  const runPath = "runs/example-attempt-001/run.json";
  const run = JSON.parse(await readFile(join(root, runPath), "utf8"));
  const altered = jsonBytes({ ...run, provider: "Silently rewritten identity" });
  await writeFile(join(root, runPath), altered);
  const ledger = JSON.parse(await readFile(join(root, "integrity.json"), "utf8"));
  ledger.files[runPath] = { sha256: sha256(altered), size_bytes: altered.length };
  await writeFile(join(root, "integrity.json"), jsonBytes(ledger));
  await assert.rejects(
    cli("validate", ["--prior-integrity", baseline]),
    /Historical ledger change/,
  );
});
