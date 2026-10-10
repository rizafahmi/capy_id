import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { extractHtml, importRun, sha256, validateContent } from "../scripts/content.ts";
import { createFixtures } from "../scripts/fixtures.ts";

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "capyboard-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtures(root);
  return root;
}

test("tracked empty-directory markers do not become content records", async (t) => {
  const root = await fixture(t);
  for (const directory of ["runs", "curation", "thumbnails"])
    await writeFile(join(root, directory, ".gitkeep"), "");
  assert.equal((await validateContent(root)).runs.length, 5);
});

test("UTF-8 HTML extraction records byte offsets without rewriting", () => {
  const html = "<!doctype html><html><body>水 🦫\r\n</body></html>";
  const response = Buffer.from(`Explanation 🦫\n\n\`\`\`html\n${html}\n\`\`\`\n`);
  const extracted = extractHtml(response);
  assert.ok(extracted);
  assert.deepEqual(extracted.bytes, Buffer.from(html));
  assert.deepEqual(
    response.subarray(extracted.start_byte, extracted.end_byte_exclusive),
    Buffer.from(html),
  );
});

test("plain HTML keeps its leading whitespace, BOM, and trailing newlines", () => {
  const response = Buffer.from("\uFEFF \r\n<!doctype html><html><body>🦫</body></html>\r\n");
  assert.deepEqual(extractHtml(response)?.bytes, response);
});

test("ambiguous responses require explicit curator selection", () => {
  const response = Buffer.from(
    "```html\n<html>First</html>\n```\n```html\n<html>Second</html>\n```",
  );
  assert.throws(() => extractHtml(response), /ambiguous/i);
});

test("a response without HTML remains a publishable attempt", async (t) => {
  const root = await fixture(t);
  const collection = await validateContent(root);
  const run = collection.runs.find((entry) => entry.run.id === "fixture-no-html");
  assert.equal(run?.run.artifacts.html, null);
  assert.equal(collection.runs.length, 5);
});

test("historical metadata and artifact changes fail validation", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "runs/fixture-animation/response.txt"), "changed");
  await assert.rejects(validateContent(root), /integrity|checksum/i);
});

test("deleting a previously recorded attempt fails validation", async (t) => {
  const root = await fixture(t);
  await rm(join(root, "runs/fixture-animation"), { recursive: true });
  await assert.rejects(validateContent(root), /missing|integrity|ENOENT/i);
});

test("metadata corruption is detected even if artifact hashes still match", async (t) => {
  const root = await fixture(t);
  const path = join(root, "runs/fixture-animation/run.json");
  const json = JSON.parse(await readFile(path, "utf8"));
  json.provider = "Rewritten provider";
  await writeFile(path, JSON.stringify(json));
  await assert.rejects(validateContent(root), /integrity/i);
});

test("import refuses an existing ID without altering its bytes", async (t) => {
  const root = await fixture(t);
  const runPath = join(root, "runs/fixture-animation/run.json");
  const before = await readFile(runPath);
  const run = JSON.parse(before.toString());
  await assert.rejects(
    importRun({ root, metadata: run, response: Buffer.from("new") }),
    /already exists/i,
  );
  assert.deepEqual(await readFile(runPath), before);
});

test("invalid enums, timestamps, hashes, and path traversal fail at import", async (t) => {
  const root = await fixture(t);
  const original = JSON.parse(
    await readFile(join(root, "runs/fixture-animation/run.json"), "utf8"),
  );
  for (const [field, value] of [
    ["mode", "winner"],
    ["generated_at", "2026-02-30T00:00:00Z"],
    ["challenge_id", "../outside"],
  ] satisfies [string, string][]) {
    const metadata = structuredClone(original);
    metadata.id = "new-attempt";
    if (field === "mode") metadata.generation.mode = value;
    else metadata[field] = value;
    await assert.rejects(importRun({ root, metadata, response: Buffer.from("<html></html>") }));
  }
});

test("content cannot follow symlinks outside its root", async (t) => {
  const root = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), "capyboard-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await cp(join(root, "runs/fixture-animation/response.txt"), join(outside, "response.txt"));
  await rm(join(root, "runs/fixture-animation/response.txt"));
  await symlink(join(outside, "response.txt"), join(root, "runs/fixture-animation/response.txt"));
  await assert.rejects(validateContent(root), /symlink|outside/i);
});

test("an explicitly supplied HTML file must be a verbatim response substring", async (t) => {
  const root = await fixture(t);
  const metadata = JSON.parse(
    await readFile(join(root, "runs/fixture-animation/run.json"), "utf8"),
  );
  metadata.id = "new-attempt";
  await assert.rejects(
    importRun({
      root,
      metadata,
      response: Buffer.from("<html>original</html>"),
      html: Buffer.from("<html>repaired</html>"),
    }),
    /verbatim/i,
  );
});

test("imports append integrity entries and preserve every artifact byte", async (t) => {
  const root = await fixture(t);
  const metadata = JSON.parse(
    await readFile(join(root, "runs/fixture-animation/run.json"), "utf8"),
  );
  metadata.id = "new-attempt";
  metadata.series_id = "new-series";
  const response = Buffer.from("<!doctype html><html><body>🦫\r\n</body></html>\n");
  const run = await importRun({ root, metadata, response });
  assert.equal(run.artifacts.response.sha256, sha256(response));
  assert.deepEqual(await readFile(join(root, run.artifacts.response.path)), response);
  assert.deepEqual(await readFile(join(root, run.artifacts.html?.path ?? "")), response);
  assert.equal((await validateContent(root)).runs.length, 6);
});

test("import supplies fresh attempt and series IDs when metadata omits them", async (t) => {
  const root = await fixture(t);
  const metadata: Record<string, unknown> = JSON.parse(
    await readFile(join(root, "runs/fixture-animation/run.json"), "utf8"),
  );
  delete metadata.id;
  delete metadata.series_id;
  delete metadata.attempt_number;
  const run = await importRun({ root, metadata, response: Buffer.from("No HTML.") });
  assert.match(run.id, /^run-[a-f0-9-]+$/);
  assert.match(run.series_id, /^series-[a-f0-9-]+$/);
  assert.equal(run.attempt_number, 1);
  assert.equal((await validateContent(root)).runs.length, 6);
});

test("Pi imports record harness and effort without sampling controls", async (t) => {
  const root = await fixture(t);
  const response = Buffer.from("<!doctype html><html><body>Pi attempt</body></html>\n");
  const run = await importRun({
    root,
    metadata: {
      schema_version: 1,
      id: "pi-attempt",
      challenge_id: "capybara-hoverboard-v1",
      provider: "Example provider",
      model: {
        display_name: "Example model",
        identifier: "example-model",
        identifier_kind: "display-only",
      },
      generated_at: null,
      generation: {
        mode: "tool-assisted",
        interface: "coding-agent",
        tools_used: "yes",
        harness: { name: "Pi", version: "1.1.0", effort: "low" },
      },
    },
    response,
    transcript: {
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
    },
  });
  const collection = await validateContent(root);
  const stored = collection.runs.find((entry) => entry.run.id === "pi-attempt");
  assert.deepEqual(stored?.run.generation, {
    mode: "tool-assisted",
    interface: "coding-agent",
    tools_used: "yes",
    harness: { name: "Pi", version: "1.1.0", effort: "low" },
  });
  assert.deepEqual(await readFile(join(root, run.artifacts.response.path)), response);
});

test("omitted settings do not bypass the tool-assisted transcript requirement", async (t) => {
  const root = await fixture(t);
  const metadata = JSON.parse(
    await readFile(join(root, "runs/fixture-animation/run.json"), "utf8"),
  );
  metadata.id = "pi-without-transcript";
  metadata.generation.mode = "tool-assisted";
  delete metadata.generation.settings;
  delete metadata.generation.system_instruction_known;
  await assert.rejects(
    importRun({ root, metadata, response: Buffer.from("No HTML.") }),
    /Supply the full transcript/,
  );
});

test("new imports discard legacy controls but preserve supplied instruction turns", async (t) => {
  const root = await fixture(t);
  const metadata = JSON.parse(
    await readFile(join(root, "runs/fixture-animation/run.json"), "utf8"),
  );
  metadata.id = "explicit-conditions";
  metadata.series_id = "explicit-conditions-series";
  metadata.generation.settings = { temperature: 0, top_p: 1, max_output_tokens: 1000, seed: 42 };
  metadata.generation.system_instruction_known = true;
  const run = await importRun({
    root,
    metadata,
    response: Buffer.from("No HTML."),
    transcript: {
      schema_version: 1,
      turns: [
        { role: "system", content: "Exact supplied system instruction." },
        {
          role: "user",
          content: await readFile(
            join(root, "challenges/capybara-hoverboard-v1/prompt.txt"),
            "utf8",
          ),
        },
      ],
    },
  });
  assert.deepEqual(run.generation, {
    mode: "one-shot",
    interface: "other",
    tools_used: "no",
    harness: { name: "Development harness", version: "test", effort: "low" },
    metrics: {
      time: { kind: "model", duration_ms: 17222 },
      tokens: { input: 1262, cached: 0, output: 2464, total: 3726 },
    },
  });
  const stored = JSON.parse(await readFile(join(root, run.instructions.transcript_path), "utf8"));
  assert.deepEqual(stored.turns[0], {
    role: "system",
    content: "Exact supplied system instruction.",
  });
  assert.equal((await validateContent(root)).runs.length, 6);
});

test("a prior ledger rejects metadata edits even when the current ledger is rewritten", async (t) => {
  const root = await fixture(t);
  const ledgerPath = join(root, "integrity.json");
  const prior: unknown = JSON.parse(await readFile(ledgerPath, "utf8"));
  const path = "runs/fixture-animation/run.json";
  const metadata = JSON.parse(await readFile(join(root, path), "utf8"));
  metadata.provider = "Rewritten provider";
  const bytes = Buffer.from(JSON.stringify(metadata));
  await writeFile(join(root, path), bytes);
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  ledger.files[path] = { sha256: sha256(bytes), size_bytes: bytes.length };
  await writeFile(ledgerPath, JSON.stringify(ledger));
  await assert.rejects(validateContent(root, prior), /historical.*ledger/i);
});

test("orphan curation records fail validation and are never deleted by import", async (t) => {
  const root = await fixture(t);
  const path = join(root, "curation/orphan-attempt.json");
  const bytes = Buffer.from('{"unrelated":"preserve this file"}');
  await writeFile(path, bytes);
  await assert.rejects(validateContent(root), /orphan|unknown run/i);
  const metadata = JSON.parse(
    await readFile(join(root, "runs/fixture-animation/run.json"), "utf8"),
  );
  metadata.id = "orphan-attempt";
  metadata.series_id = "orphan-series";
  await assert.rejects(importRun({ root, metadata, response: Buffer.from("No HTML.") }));
  assert.deepEqual(await readFile(path), bytes);
});
