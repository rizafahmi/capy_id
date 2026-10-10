import { access, mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildSite } from "./build.ts";
import { createContainmentFixtures, createFixtures } from "./fixtures.ts";
import { serveStatic } from "./server.ts";

const { values } = parseArgs({
  options: {
    fixtures: { type: "boolean", default: false },
    "test-fixtures": { type: "boolean", default: false },
    content: { type: "string", default: "content" },
    out: { type: "string", default: "dist" },
  },
});
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
await buildSite({
  root,
  out,
  galleryOrigin: "http://127.0.0.1:4173",
  previewOrigin: "http://127.0.0.1:4174",
  development: true,
});
const servers = [
  await serveStatic(join(out, "gallery"), 4173),
  await serveStatic(join(out, "preview"), 4174),
];
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
for (const signal of ["SIGINT", "SIGTERM"] satisfies NodeJS.Signals[])
  process.on(signal, () => {
    for (const server of servers) server.close();
  });
