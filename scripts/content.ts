import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { z } from "zod";
import type { Collection, Ledger, Run, Transcript } from "./schema.ts";
import {
  challengeSchema,
  contentPath,
  curationSchema,
  ledgerSchema,
  metadataSchema,
  runId,
  runSchema,
  transcriptSchema,
} from "./schema.ts";

export const fixedPrompt =
  "Build an animated capybara riding a hoverboard using only HTML, CSS, and JavaScript.\n\nDeliver a single self-contained HTML file with all CSS and JavaScript inline. Do not use external libraries, external image assets, external fonts, or network requests. Inline SVG, CSS drawing, and canvas are allowed.\n\nThe result should visibly show a capybara riding a hoverboard, with animation that makes the scene feel alive. Do not include audio.\n\nReturn only the HTML source, without explanations or Markdown code fences.\n";
export const fixedChallenge = "capybara-hoverboard-v1";
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function utf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}
export const jsonBytes = (data: unknown) => Buffer.from(`${JSON.stringify(data, null, 2)}\n`);

export async function safePath(root: string, path: string): Promise<string> {
  contentPath.parse(path);
  const base = await realpath(root);
  const absolute = resolve(base, path);
  if (!absolute.startsWith(`${base}${sep}`)) throw new Error(`Path outside content: ${path}`);
  let cursor = base;
  for (const part of path.split("/")) {
    cursor = join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink())
      throw new Error(`Symlink is not permitted in content: ${path}`);
  }
  return absolute;
}
export async function readArtifact(root: string, path: string): Promise<Buffer> {
  return readFile(await safePath(root, path));
}
async function readJson<T>(root: string, path: string, schema: z.ZodType<T>): Promise<T> {
  try {
    return schema.parse(JSON.parse(utf8(await readArtifact(root, path))));
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function folders(root: string, folder: string): Promise<string[]> {
  const path = await safePath(root, folder);
  const entries = (await readdir(path, { withFileTypes: true })).filter(
    (entry) => !(entry.isFile() && entry.name === ".gitkeep"),
  );
  for (const entry of entries) {
    if (!entry.isDirectory())
      throw new Error(`Expected content directory: ${folder}/${entry.name}`);
    contentPath.parse(entry.name);
  }
  return entries.map((entry) => entry.name).sort();
}
async function digestFiles(root: string, paths: string[]): Promise<Ledger["files"]> {
  const result: Ledger["files"] = {};
  for (const path of paths) {
    const bytes = await readArtifact(root, path);
    result[path] = { sha256: sha256(bytes), size_bytes: bytes.length };
  }
  return result;
}
export async function initializeContent(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  if ((await readdir(root)).length)
    throw new Error(`Content initialization requires an empty directory: ${root}`);
  const challengePath = `challenges/${fixedChallenge}`;
  for (const directory of [challengePath, "runs", "curation", "thumbnails"])
    await mkdir(join(root, directory), { recursive: true });
  const promptPath = `${challengePath}/prompt.txt`;
  await writeFile(join(root, promptPath), fixedPrompt);
  await writeFile(
    join(root, `${challengePath}/challenge.json`),
    jsonBytes({
      schema_version: 1,
      id: fixedChallenge,
      title: "Capybara on a hoverboard",
      prompt_path: promptPath,
      prompt_sha256: sha256(Buffer.from(fixedPrompt)),
    }),
  );
  await writeFile(
    join(root, "integrity.json"),
    jsonBytes({
      schema_version: 1,
      files: await digestFiles(root, [promptPath, `${challengePath}/challenge.json`]),
    }),
  );
}

export function extractHtml(
  response: Buffer,
): { bytes: Buffer; start_byte: number; end_byte_exclusive: number } | null {
  const text = utf8(response);
  const fences = [...text.matchAll(/^```(?:html)?[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```[^\S\r\n]*$/gm)];
  const starts = [...text.matchAll(/<!doctype\s+html\b[^>]*>|<html\b[^>]*>/gi)];
  if (fences.length > 1)
    throw new Error("HTML extraction is ambiguous. Supply a selected verbatim HTML file.");
  const fence = fences[0];
  let start = 0;
  let end = text.length;
  if (fence?.[1] !== undefined) {
    const prefix = fence[0].indexOf("\n") + 1;
    start = fence.index + prefix;
    end = start + fence[1].length;
  } else {
    if (!starts.length) return null;
    const doctype = starts.find((match) => match[0].toLowerCase().startsWith("<!doctype"));
    start = (doctype ?? starts[0])?.index ?? 0;
    const endings = [...text.matchAll(/<\/html\s*>/gi)];
    if (
      endings.length > 1 ||
      starts.filter((match) => match[0].toLowerCase().startsWith("<!doctype")).length > 1 ||
      starts.filter((match) => match[0].toLowerCase().startsWith("<html")).length > 1
    )
      throw new Error("HTML extraction is ambiguous. Supply a selected verbatim HTML file.");
    const ending = endings[0];
    if (ending) end = ending.index + ending[0].length;
    if (text.slice(0, start).trim() === "" && text.slice(end).trim() === "") {
      start = 0;
      end = text.length;
    }
  }
  const selected = text.slice(start, end);
  if (!/<!doctype\s+html\b|<html\b/i.test(selected)) return null;
  const start_byte = Buffer.byteLength(text.slice(0, start));
  const end_byte_exclusive = Buffer.byteLength(text.slice(0, end));
  return {
    bytes: response.subarray(start_byte, end_byte_exclusive),
    start_byte,
    end_byte_exclusive,
  };
}

const execute = promisify(execFile);
async function committedLedger(root: string): Promise<Ledger | null> {
  try {
    const { stdout: repo } = await execute("git", ["rev-parse", "--show-toplevel"], { cwd: root });
    const path = relative(repo.trim(), join(resolve(root), "integrity.json"))
      .split(sep)
      .join("/");
    const { stdout } = await execute("git", ["show", `HEAD:${path}`], {
      cwd: root,
      maxBuffer: 10 * 1024 * 1024,
    });
    return ledgerSchema.parse(JSON.parse(stdout));
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === 128 || error.code === "ENOENT")
    )
      return null;
    throw new Error("Cannot read the committed integrity ledger", { cause: error });
  }
}
export async function validateContent(root: string, priorIntegrity?: unknown): Promise<Collection> {
  const ledger = await readJson(root, "integrity.json", ledgerSchema);
  const prior =
    priorIntegrity === undefined ? await committedLedger(root) : ledgerSchema.parse(priorIntegrity);
  if (prior) {
    for (const [path, expected] of Object.entries(prior.files)) {
      const current = ledger.files[path];
      if (
        !current ||
        current.sha256 !== expected.sha256 ||
        current.size_bytes !== expected.size_bytes
      )
        throw new Error(`Historical ledger change: ${path}. Create a replacement record instead.`);
    }
  }
  await safePath(root, "curation");
  await safePath(root, "thumbnails");
  for (const [path, expected] of Object.entries(ledger.files)) {
    const bytes = await readArtifact(root, path);
    if (sha256(bytes) !== expected.sha256 || bytes.length !== expected.size_bytes)
      throw new Error(`Historical integrity mismatch: ${path}`);
  }
  const collection: Collection = {
    root: await realpath(root),
    challenges: new Map(),
    prompts: new Map(),
    runs: [],
  };
  const required = new Set<string>();
  for (const id of await folders(root, "challenges")) {
    const path = `challenges/${id}/challenge.json`;
    const challenge = await readJson(root, path, challengeSchema);
    if (challenge.id !== id || collection.challenges.has(id))
      throw new Error(`Duplicate or mismatched challenge ID: ${id}`);
    const prompt = await readArtifact(root, challenge.prompt_path);
    if (sha256(prompt) !== challenge.prompt_sha256)
      throw new Error(`Prompt checksum mismatch: ${id}`);
    if (challenge.prompt_path !== `challenges/${id}/prompt.txt`)
      throw new Error(`Challenge prompt path mismatch: ${id}`);
    if (id === fixedChallenge && utf8(prompt) !== fixedPrompt)
      throw new Error("The fixed v1 prompt cannot change. Create a new challenge version.");
    collection.challenges.set(id, challenge);
    collection.prompts.set(id, utf8(prompt));
    required.add(path);
    required.add(challenge.prompt_path);
  }
  const ids = new Set<string>();
  const attempts = new Set<string>();
  for (const folder of await folders(root, "runs")) {
    const path = `runs/${folder}/run.json`;
    const run = await readJson(root, path, runSchema);
    if (run.id !== folder || ids.has(run.id))
      throw new Error(`Duplicate or mismatched run ID: ${run.id}`);
    ids.add(run.id);
    const attemptKey = `${run.series_id}/${run.attempt_number}`;
    if (!run.supersedes_run_id) {
      if (attempts.has(attemptKey)) throw new Error(`Duplicate series attempt: ${attemptKey}`);
      attempts.add(attemptKey);
    }
    const challenge = collection.challenges.get(run.challenge_id);
    if (!challenge) throw new Error(`Unknown challenge: ${run.challenge_id}`);
    if (
      run.instructions.prompt_path !== challenge.prompt_path ||
      run.instructions.prompt_sha256 !== challenge.prompt_sha256
    )
      throw new Error(`Run prompt mismatch: ${run.id}`);
    if (
      run.instructions.transcript_path !== `runs/${run.id}/transcript.json` ||
      run.artifacts.response.path !== `runs/${run.id}/response.txt` ||
      (run.artifacts.html && run.artifacts.html.path !== `runs/${run.id}/output.html.txt`)
    )
      throw new Error(`Artifact path does not belong to run: ${run.id}`);
    const transcript = await readJson(root, run.instructions.transcript_path, transcriptSchema);
    const users = transcript.turns.filter((turn) => turn.role === "user");
    if (!users.length) throw new Error(`Transcript requires user instructions: ${run.id}`);
    if (
      run.generation.mode === "one-shot" &&
      (users.length !== 1 || users[0]?.content !== collection.prompts.get(run.challenge_id))
    )
      throw new Error(`One-shot instructions differ from the exact challenge: ${run.id}`);
    if (
      run.generation.system_instruction_known !==
      transcript.turns.some((turn) => turn.role === "system")
    )
      throw new Error(`System instruction provenance disagrees with transcript: ${run.id}`);
    const response = await readArtifact(root, run.artifacts.response.path);
    utf8(response);
    for (const artifact of [run.artifacts.response, run.artifacts.html]) {
      if (!artifact) continue;
      const bytes = await readArtifact(root, artifact.path);
      utf8(bytes);
      if (sha256(bytes) !== artifact.sha256 || bytes.length !== artifact.size_bytes)
        throw new Error(`Artifact checksum mismatch: ${artifact.path}`);
      required.add(artifact.path);
    }
    if (run.artifacts.html) {
      const html = await readArtifact(root, run.artifacts.html.path);
      const range = run.artifacts.html.extraction;
      if (
        range.end_byte_exclusive < range.start_byte ||
        range.end_byte_exclusive > response.length ||
        !response.subarray(range.start_byte, range.end_byte_exclusive).equals(html)
      )
        throw new Error(`HTML extraction is not a verbatim response range: ${run.id}`);
    }
    const curation = await readJson(root, `curation/${run.id}.json`, curationSchema);
    if (curation.run_id !== run.id) throw new Error(`Curation run ID mismatch: ${run.id}`);
    if (curation.preview_allowed && !run.artifacts.html)
      throw new Error(`Cannot enable a preview without HTML: ${run.id}`);
    if (curation.thumbnail) {
      if (
        !curation.thumbnail.path.startsWith("thumbnails/") ||
        !/\.(webp|png)$/.test(curation.thumbnail.path)
      )
        throw new Error(`Invalid thumbnail path: ${run.id}`);
      const bytes = await readArtifact(root, curation.thumbnail.path);
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const webp =
        bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
      if (!png && !webp) throw new Error(`Thumbnail is not PNG or WebP: ${run.id}`);
    }
    required.add(path);
    required.add(run.instructions.transcript_path);
    collection.runs.push({ run, curation, transcript });
  }
  for (const file of await readdir(await safePath(root, "curation"), { withFileTypes: true })) {
    if (file.isFile() && file.name === ".gitkeep") continue;
    if (!file.isFile() || !file.name.endsWith(".json") || !ids.has(file.name.slice(0, -5))) {
      throw new Error(`Orphan curation record references an unknown run: ${file.name}`);
    }
  }
  for (const path of required)
    if (!ledger.files[path])
      throw new Error(`Immutable file missing from integrity ledger: ${path}`);
  for (const entry of collection.runs) {
    if (
      entry.run.supersedes_run_id &&
      (!ids.has(entry.run.supersedes_run_id) || entry.run.supersedes_run_id === entry.run.id)
    )
      throw new Error(`Invalid superseded run reference: ${entry.run.id}`);
    const series = collection.runs.filter(
      (other) => other.run.series_id === entry.run.series_id && !other.run.supersedes_run_id,
    );
    if (
      entry.curation.series_publication_complete &&
      series.some((other) => !other.curation.visible)
    )
      throw new Error(
        `Series marked complete contains unpublished attempts: ${entry.run.series_id}`,
      );
  }
  return collection;
}

export async function importRun(options: {
  root: string;
  metadata: unknown;
  response: Buffer;
  html?: Buffer;
  transcript?: unknown;
}): Promise<Run> {
  const { root, response } = options;
  const input = metadataSchema.parse(options.metadata);
  const metadata = {
    ...input,
    id: input.id ?? runId.parse(`run-${randomUUID()}`),
    series_id: input.series_id ?? `series-${randomUUID()}`,
    attempt_number: input.attempt_number ?? 1,
  };
  const lock = join(root, ".import-lock");
  await mkdir(lock).catch(() => {
    throw new Error(
      "Another import is running, or a prior import left .import-lock. Inspect it before retrying.",
    );
  });
  let created = false;
  let curationCreated = false;
  const runPath = join(root, "runs", metadata.id);
  const curationPath = join(root, "curation", `${metadata.id}.json`);
  try {
    const collection = await validateContent(root);
    if (collection.runs.some((entry) => entry.run.id === metadata.id))
      throw new Error(`Run ID already exists: ${metadata.id}`);
    const challenge = collection.challenges.get(metadata.challenge_id);
    if (!challenge) throw new Error(`Unknown challenge: ${metadata.challenge_id}`);
    utf8(response);
    let extracted = options.html ? null : extractHtml(response);
    if (options.html) {
      utf8(options.html);
      const start_byte = response.indexOf(options.html);
      if (start_byte < 0)
        throw new Error("Selected HTML must be a verbatim UTF-8 substring of the response");
      extracted = {
        bytes: options.html,
        start_byte,
        end_byte_exclusive: start_byte + options.html.length,
      };
    }
    if (
      !options.transcript &&
      (metadata.generation.mode === "revised" ||
        metadata.generation.mode === "tool-assisted" ||
        metadata.generation.system_instruction_known)
    )
      throw new Error(
        "Supply the full transcript for revised, tool-assisted, or known-system runs",
      );
    const transcript: Transcript = transcriptSchema.parse(
      options.transcript ?? {
        schema_version: 1,
        turns: [{ role: "user", content: collection.prompts.get(metadata.challenge_id) }],
      },
    );
    const prefix = `runs/${metadata.id}`;
    const run = runSchema.parse({
      ...metadata,
      instructions: {
        prompt_path: challenge.prompt_path,
        prompt_sha256: challenge.prompt_sha256,
        transcript_path: `${prefix}/transcript.json`,
      },
      artifacts: {
        response: {
          path: `${prefix}/response.txt`,
          sha256: sha256(response),
          size_bytes: response.length,
        },
        html: extracted
          ? {
              path: `${prefix}/output.html.txt`,
              sha256: sha256(extracted.bytes),
              size_bytes: extracted.bytes.length,
              extraction: {
                start_byte: extracted.start_byte,
                end_byte_exclusive: extracted.end_byte_exclusive,
              },
            }
          : null,
      },
    });
    await mkdir(runPath);
    created = true;
    await writeFile(join(runPath, "response.txt"), response, { flag: "wx" });
    if (extracted)
      await writeFile(join(runPath, "output.html.txt"), extracted.bytes, { flag: "wx" });
    await writeFile(join(runPath, "run.json"), jsonBytes(run), { flag: "wx" });
    await writeFile(join(runPath, "transcript.json"), jsonBytes(transcript), { flag: "wx" });
    await writeFile(
      curationPath,
      jsonBytes({
        schema_version: 1,
        run_id: run.id,
        published_at: null,
        visible: false,
        preview_allowed: false,
        preview_disabled_reason: "Not yet reviewed for execution.",
        observations: [],
        series_publication_complete: false,
        series_incomplete_reason: null,
        thumbnail: null,
      }),
      { flag: "wx" },
    );
    curationCreated = true;
    const ledger = await readJson(root, "integrity.json", ledgerSchema);
    const paths = [
      `${prefix}/run.json`,
      `${prefix}/response.txt`,
      `${prefix}/transcript.json`,
      ...(extracted ? [`${prefix}/output.html.txt`] : []),
    ];
    const newLedger = {
      ...ledger,
      files: { ...ledger.files, ...(await digestFiles(root, paths)) },
    };
    const ledgerPath = join(root, "integrity.json");
    const priorLedger = await readFile(ledgerPath);
    await writeFile(join(lock, "integrity.json"), jsonBytes(newLedger));
    await rename(join(lock, "integrity.json"), ledgerPath);
    try {
      await validateContent(root);
    } catch (error) {
      await writeFile(ledgerPath, priorLedger);
      throw error;
    }
    return run;
  } catch (error) {
    if (created) {
      await rm(runPath, { recursive: true, force: true });
    }
    if (curationCreated) {
      await rm(curationPath, { force: true });
    }
    throw error;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
