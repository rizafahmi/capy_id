import { lstat, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { jsonBytes, safePath, sha256, validateContent } from "./content.ts";
import { curationSchema } from "./schema.ts";
import { previewCsp, previewPolicyVersion } from "./security.ts";

const { values } = parseArgs({
  options: {
    content: { type: "string", default: "content" },
    run: { type: "string" },
    "gallery-origin": { type: "string", default: "http://127.0.0.1:4173" },
    delay: { type: "string", default: "1000" },
  },
});
try {
  if (!values.run) throw new Error("Capture requires --run <run-id>");
  const origin = new URL(values["gallery-origin"]);
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.hash ||
    origin.search ||
    !["https:", "http:"].includes(origin.protocol)
  )
    throw new Error("Capture requires a gallery HTTP origin without credentials or a path");
  if (origin.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
    throw new Error("Remote captures require HTTPS");
  const delay = Number(values.delay);
  if (!Number.isFinite(delay) || delay < 0 || delay > 30000)
    throw new Error("Capture delay must be 0 through 30000 milliseconds");
  const root = resolve(values.content);
  const collection = await validateContent(root);
  const entry = collection.runs.find(({ run }) => run.id === values.run);
  if (!entry?.curation.visible || !entry.curation.preview_allowed || !entry.run.artifacts.html)
    throw new Error("Capture requires a published, curator-enabled run with HTML");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    await page.goto(`${origin.origin}/runs/${entry.run.id}/`);
    const url = await page.locator("[data-preview-url]").getAttribute("data-preview-url");
    if (!url) throw new Error("The built site did not enable a preview for this run");
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (
      !response.ok ||
      response.headers.get("content-security-policy") !== previewCsp ||
      response.headers.get("x-content-type-options") !== "nosniff"
    )
      throw new Error("Preview response headers do not enforce the expected restricted policy");
    if (sha256(new Uint8Array(await response.arrayBuffer())) !== entry.run.artifacts.html.sha256)
      throw new Error("Built preview differs from the preserved HTML. Rebuild before capture.");
    await page.getByRole("button", { name: "Run preview", exact: true }).click();
    const frame = page.locator("iframe");
    await frame.contentFrame().locator("body").waitFor({ state: "attached" });
    if ((await frame.getAttribute("sandbox")) !== "allow-scripts")
      throw new Error("Capture frame does not have the required sandbox");
    await page.waitForTimeout(delay);
    const width = Number(await frame.getAttribute("width"));
    const height = Number(await frame.getAttribute("height"));
    if (width !== 640 || height !== 480)
      throw new Error(`Expected a 640 by 480 capture viewport, received ${width} by ${height}`);
    await frame.scrollIntoViewIfNeeded();
    const bounds = await frame.boundingBox();
    if (!bounds || bounds.width !== width || bounds.height !== height)
      throw new Error("Capture frame dimensions differ from the recorded viewport");
    const bytes = await page.screenshot({
      type: "png",
      clip: { x: Math.round(bounds.x), y: Math.round(bounds.y), width, height },
    });
    const file = join(await safePath(root, "thumbnails"), `${entry.run.id}.png`);
    try {
      if ((await lstat(file)).isSymbolicLink())
        throw new Error("Refusing to overwrite a thumbnail symlink");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    await writeFile(file, bytes);
    const curationPath = await safePath(root, `curation/${entry.run.id}.json`);
    const curation = curationSchema.parse(JSON.parse(await readFile(curationPath, "utf8")));
    await writeFile(
      curationPath,
      jsonBytes({
        ...curation,
        thumbnail: {
          path: `thumbnails/${entry.run.id}.png`,
          viewport: { width, height },
          capture_delay_ms: delay,
          browser_version: browser.version(),
          preview_policy_version: previewPolicyVersion,
        },
      }),
    );
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await validateContent(root);
    process.stdout.write(
      `Captured ${entry.run.id} through ${previewPolicyVersion}. Rebuild to publish the thumbnail.\n`,
    );
  } finally {
    await browser.close();
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
