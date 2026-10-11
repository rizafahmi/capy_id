import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { serveAstro } from "./astro-dev.ts";
import { buildSite } from "./build.ts";
import { createContainmentFixtures, createFixtures } from "./fixtures.ts";
import { type Ledger, ledgerSchema } from "./schema.ts";
import { serveStatic } from "./server.ts";

const { values } = parseArgs({
  options: {
    fixtures: { type: "boolean", default: false },
    "test-fixtures": { type: "boolean", default: false },
    content: { type: "string", default: "content" },
    out: { type: "string", default: "dist" },
  },
});

async function readWorkingTreeIntegrity(root: string): Promise<Ledger> {
  try {
    return ledgerSchema.parse(JSON.parse(await readFile(join(root, "integrity.json"), "utf8")));
  } catch (error) {
    throw new Error(`Cannot read the working-tree integrity ledger in ${root}`, {
      cause: error,
    });
  }
}
let root = resolve(values.content);
if (values["test-fixtures"]) {
  root = await mkdtemp(join(tmpdir(), "capyboard-browser-content-"));
  await createFixtures(root);
  await createContainmentFixtures(root, "http://127.0.0.1:4175");
} else if (values.fixtures) {
  root = resolve(".fixture-content");
  try {
    await access(join(root, "integrity.json"));
  } catch {
    await createFixtures(root);
  }
}
const out = resolve(values.out);
await mkdir(join(out, ".."), { recursive: true });
const pages = await buildSite({
  root,
  out,
  galleryOrigin: "http://127.0.0.1:4173",
  previewOrigin: "http://127.0.0.1:4174",
  development: true,
  priorIntegrity: await readWorkingTreeIntegrity(root),
  render: "dev",
});
const workspace = await mkdtemp(join(tmpdir(), "capyboard-astro-dev-"));
const servers: Server[] = [];
let gallery: Awaited<ReturnType<typeof serveAstro>> | undefined;
let stopping: Promise<void> | undefined;
function stop(): Promise<void> {
  stopping ??= (async () => {
    await Promise.all([
      gallery?.stop(),
      ...servers.map(
        (server) =>
          new Promise<void>((done, reject) => {
            server.close((error) => (error ? reject(error) : done()));
            server.closeAllConnections();
          }),
      ),
    ]);
    await rm(workspace, { recursive: true, force: true });
    if (values["test-fixtures"]) await rm(root, { recursive: true, force: true });
  })();
  return stopping;
}
try {
  servers.push(await serveStatic(join(out, "preview"), 4174));
  gallery = await serveAstro({ pages, workspace, out });
  if (values["test-fixtures"]) {
    let attempts: string[] = [];
    const trap = createServer((request, response) => {
      if (request.url === "/attempts") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(attempts));
      } else if (request.url === "/reset") {
        attempts = [];
        response.end("reset");
      } else {
        attempts.push(request.url ?? "unknown");
        response.end("A containment fixture reached this endpoint.");
      }
    });
    await new Promise<void>((done, reject) => {
      trap.once("error", reject);
      trap.listen(4175, "127.0.0.1", done);
    });
    servers.push(trap);
  }
  process.stdout.write("Gallery http://127.0.0.1:4173\nPreview origin http://127.0.0.1:4174\n");
} catch (error) {
  await stop();
  throw error;
}
for (const signal of ["SIGINT", "SIGTERM"] satisfies NodeJS.Signals[])
  process.on(signal, () => {
    void stop();
  });
