import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { buildSite } from "./build.ts";
import { importRun, initializeContent, jsonBytes, validateContent } from "./content.ts";
import { schemas } from "./schema.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    content: { type: "string", default: "content" },
    metadata: { type: "string" },
    response: { type: "string" },
    html: { type: "string" },
    transcript: { type: "string" },
    "prior-integrity": { type: "string" },
    out: { type: "string", default: "dist" },
    "preview-origin": { type: "string" },
    "gallery-origin": { type: "string" },
    development: { type: "boolean", default: false },
  },
});
const command = positionals[0];
const root = resolve(values.content);
async function jsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON from ${path}`, { cause: error });
  }
}
try {
  switch (command) {
    case "init":
      await initializeContent(root);
      process.stdout.write(`Initialized ${root}\n`);
      break;
    case "validate": {
      const content = await validateContent(
        root,
        values["prior-integrity"] ? await jsonFile(values["prior-integrity"]) : undefined,
      );
      process.stdout.write(
        `Valid content. ${content.runs.length} attempts, ${content.challenges.size} challenges.\n`,
      );
      break;
    }
    case "import": {
      if (!values.metadata || !values.response)
        throw new Error("Import requires --metadata <file> and --response <file>");
      const run = await importRun({
        root,
        metadata: await jsonFile(values.metadata),
        response: await readFile(values.response),
        ...(values.html ? { html: await readFile(values.html) } : {}),
        ...(values.transcript ? { transcript: await jsonFile(values.transcript) } : {}),
      });
      process.stdout.write(
        `Imported ${run.id}. Publication and execution are disabled until curator review.\n`,
      );
      break;
    }
    case "build":
      if (!values["gallery-origin"] || !values["preview-origin"])
        throw new Error("Build requires --gallery-origin and --preview-origin");
      await buildSite({
        root,
        out: resolve(values.out),
        galleryOrigin: values["gallery-origin"],
        previewOrigin: values["preview-origin"],
        development: values.development,
      });
      process.stdout.write(`Built static gallery and previews in ${values.out}\n`);
      break;
    case "schemas":
      await mkdir("schemas", { recursive: true });
      for (const [name, schema] of Object.entries(schemas))
        await writeFile(
          `schemas/${name}.json`,
          jsonBytes(z.toJSONSchema(schema, { io: name === "metadata" ? "input" : "output" })),
        );
      process.stdout.write(
        "Exported schemas. scripts/schema.ts remains authoritative for semantic checks.\n",
      );
      break;
    default:
      throw new Error(
        "Use init, import, validate, build, or schemas. See README.md for arguments.",
      );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
