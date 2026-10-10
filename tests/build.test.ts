import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { buildSite } from "../scripts/build.ts";
import { importRun, initializeContent, jsonBytes } from "../scripts/content.ts";
import { createFixtures, fixtureMetadata } from "../scripts/fixtures.ts";
import { curationSchema } from "../scripts/schema.ts";

async function buildFixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "capyboard-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const content = join(root, "content");
  await createFixtures(content);
  const out = join(root, "site");
  await buildSite({
    root: content,
    out,
    galleryOrigin: "http://127.0.0.1:4173",
    previewOrigin: "http://127.0.0.1:4174",
    development: true,
  });
  return { root, content, out };
}
test("redesign ships local imagery and fonts without widening preview permissions", async (t) => {
  const { out } = await buildFixture(t);
  const html = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.match(html, /class="hero-visual"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /color-scheme" content="light dark"/);
  assert.match(html, /Giles Laurent/);
  for (const file of [
    "capybara.webp",
    "capybara-small.webp",
    "favicon.png",
    "bricolage-grotesque-latin.woff2",
    "BricolageGrotesque-OFL.txt",
  ])
    assert.ok((await readFile(join(out, "gallery/assets", file))).length > 0);
  assert.match(await readFile(join(out, "gallery/_headers"), "utf8"), /font-src 'self'/);
  assert.match(await readFile(join(out, "preview/_headers"), "utf8"), /font-src 'none'/);
});

test("gallery is static, contains all attempts, and contains no experiment execution", async (t) => {
  const { out } = await buildFixture(t);
  const html = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.equal((html.match(/data-card=/g) ?? []).length, 5);
  assert.doesNotMatch(html, /<iframe|Deliberately broken development fixture/);
  assert.match(html, /Development fixtures/);
  assert.match(html, /fixture-no-html/);
});
test("run pages and challenge evidence exist without a SPA fallback", async (t) => {
  const { out } = await buildFixture(t);
  const html = await readFile(join(out, "gallery/runs/fixture-animation/index.html"), "utf8");
  assert.match(html, /Run preview/);
  assert.match(html, /Exact user instructions/);
  assert.doesNotMatch(html, /<iframe/);
  assert.match(
    await readFile(join(out, "gallery/challenge/index.html"), "utf8"),
    /Return only the HTML source/,
  );
  assert.match(await readFile(join(out, "gallery/404.html"), "utf8"), /Run not found/);
});
test("detail puts preview controls before output and defers provenance and instructions", async (t) => {
  const { out } = await buildFixture(t);
  const html = await readFile(join(out, "gallery/runs/fixture-animation/index.html"), "utf8");
  assert.ok(html.indexOf('class="preview-controls"') < html.indexOf('class="preview-stage"'));
  assert.match(
    html,
    /<details class="evidence run-provenance" id="run-provenance"><summary>Run provenance<\/summary>/,
  );
  assert.match(html, /<dt>Run ID<\/dt><dd>fixture-animation<\/dd>/);
  assert.match(html, /<dt>Generated<\/dt><dd>2026-10-08T12:00:00Z<\/dd>/);
  assert.match(html, /id="run-instructions"><summary>Exact user instructions<\/summary>/);
  assert.doesNotMatch(html, /id="run-instructions" open|id="run-provenance" open/);
});

test("download artifacts and derived previews preserve the extracted bytes", async (t) => {
  const { out, content } = await buildFixture(t);
  const original = await readFile(join(content, "runs/fixture-animation/output.html.txt"));
  assert.deepEqual(
    await readFile(join(out, "gallery/evidence/runs/fixture-animation/output.html.txt")),
    original,
  );
  assert.deepEqual(
    await readFile(join(out, "preview/runs/fixture-animation/index.html")),
    original,
  );
  const headers = await readFile(join(out, "preview/_headers"), "utf8");
  assert.match(headers, /sandbox allow-scripts/);
  assert.match(headers, /connect-src 'none'/);
});
test("a production build refuses same-origin previews and insecure origins", async (t) => {
  const { content, out } = await buildFixture(t);
  await assert.rejects(
    buildSite({
      root: content,
      out,
      galleryOrigin: "https://gallery.example",
      previewOrigin: "https://gallery.example",
      development: false,
    }),
    /separate/i,
  );
  await assert.rejects(
    buildSite({
      root: content,
      out,
      galleryOrigin: "http://gallery.example",
      previewOrigin: "https://preview.example",
      development: false,
    }),
    /HTTPS/i,
  );
});

test("an empty collection builds honest production and local galleries", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "capyboard-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const content = join(root, "content");
  await initializeContent(content);
  const out = join(root, "site");
  await buildSite({
    root: content,
    out,
    galleryOrigin: "https://gallery.example",
    previewOrigin: "https://preview.example",
    development: false,
  });
  const html = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.match(html, /No experiments published yet/);
  assert.doesNotMatch(html, /Development fixtures|<iframe/);
  await buildSite({
    root: content,
    out,
    galleryOrigin: "http://127.0.0.1:4173",
    previewOrigin: "http://127.0.0.1:4174",
    development: true,
  });
  assert.doesNotMatch(
    await readFile(join(out, "gallery/index.html"), "utf8"),
    /Development fixtures/,
  );
});

test("unsafe preview preparation stays labelled unavailable on its gallery card", async (t) => {
  const { content, out } = await buildFixture(t);
  const run = await importRun({
    root: content,
    metadata: fixtureMetadata("fixture-null-html"),
    response: Buffer.from("<html><body>\u0000</body></html>"),
  });
  const path = join(content, `curation/${run.id}.json`);
  const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await writeFile(
    path,
    jsonBytes({
      ...curation,
      visible: true,
      published_at: "2026-10-09T00:00:00Z",
      preview_allowed: true,
      preview_disabled_reason: null,
    }),
  );
  await buildSite({
    root: content,
    out,
    galleryOrigin: "http://127.0.0.1:4173",
    previewOrigin: "http://127.0.0.1:4174",
    development: true,
  });
  const html = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.match(
    html,
    /<article[^>]+data-card="fixture-null-html"[\s\S]*?<span class="card-state">Live preview unavailable<\/span>/,
  );
});

test("100 imported attempts fit the compressed shell budget and preserve model text", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "capyboard-capacity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const content = join(root, "content");
  await initializeContent(content);
  for (let index = 0; index < 100; index++) {
    const metadata = fixtureMetadata(`fixture-${String(index).padStart(3, "0")}`);
    if (index === 0) metadata.model.display_name = "<img src=x onerror=alert(1)>";
    const run = await importRun({
      root: content,
      metadata,
      response: Buffer.from("No HTML returned."),
    });
    const path = join(content, `curation/${run.id}.json`);
    const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
    await writeFile(
      path,
      jsonBytes({ ...curation, visible: true, published_at: "2026-10-09T00:00:00Z" }),
    );
  }
  const out = join(root, "site");
  await buildSite({
    root: content,
    out,
    galleryOrigin: "http://127.0.0.1:4173",
    previewOrigin: "http://127.0.0.1:4174",
    development: true,
  });
  const gallery = await readFile(join(out, "gallery/index.html"));
  assert.equal((gallery.toString().match(/data-card=/g) ?? []).length, 100);
  assert.match(gallery.toString(), /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(gallery.toString(), /<img src=x/);
  const bytes = (
    await Promise.all(
      ["index.html", "assets/site.css", "assets/app.js"].map(
        async (path) => gzipSync(await readFile(join(out, "gallery", path))).length,
      ),
    )
  ).reduce((sum, length) => sum + length, 0);
  assert.ok(bytes <= 200 * 1024, `Shell exceeds 200 KiB compressed: ${bytes}`);
  t.diagnostic(`100-run gallery HTML, CSS, and JS total ${bytes} bytes with gzip.`);
});
