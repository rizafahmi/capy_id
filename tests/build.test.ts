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

test("gallery and challenge credit Simon Willison with a linked explanation", async (t) => {
  const { out } = await buildFixture(t);
  const gallery = await readFile(join(out, "gallery/index.html"), "utf8");
  const challenge = await readFile(join(out, "gallery/challenge/index.html"), "utf8");
  for (const html of [gallery, challenge])
    assert.match(
      html,
      /href="https:\/\/simonwillison\.net\/tags\/pelican-riding-a-bicycle\/">Simon Willison's pelican-riding-a-bicycle experiments<\/a>/,
    );
  assert.match(gallery, /class="hero-inspiration">Inspired by /);
  assert.match(challenge, /From pelicans to capybaras/);
  assert.match(
    challenge,
    /Our version asks models to animate a capybara on a hoverboard in a single HTML file\./,
  );
});

test("gallery is static, contains all attempts, and contains no experiment execution", async (t) => {
  const { out } = await buildFixture(t);
  const html = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.equal((html.match(/data-card=/g) ?? []).length, 5);
  assert.doesNotMatch(html, /<iframe|Deliberately broken development fixture/);
  assert.match(html, /Development fixtures/);
  assert.match(html, /fixture-no-html/);
});
test("small collections omit filtering and comparison and give one attempt a full row", async (t) => {
  const { content, out } = await buildFixture(t);
  for (const id of ["fixture-unknown", "fixture-broken", "fixture-disabled", "fixture-no-html"]) {
    const path = join(content, `curation/${id}.json`);
    const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
    await writeFile(
      path,
      jsonBytes({
        ...curation,
        visible: false,
        series_publication_complete: false,
        series_incomplete_reason: "Withheld for small-collection test.",
      }),
    );
  }
  const build = () =>
    buildSite({
      root: content,
      out,
      galleryOrigin: "http://127.0.0.1:4173",
      previewOrigin: "http://127.0.0.1:4174",
      development: true,
    });
  await build();
  const html = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.equal((html.match(/data-card=/g) ?? []).length, 1);
  assert.match(html, /class="gallery-grid single-attempt"/);
  assert.doesNotMatch(html, /class="filters"|data-select|comparison-tray/);
  assert.match(html, /href="#attempts"/);
  assert.match(html, /<h3><a[^>]*>animation<\/a><\/h3>/);
  assert.match(html, /<time datetime="2026-10-08T12:00:00Z">Oct 8, 2026<\/time>/);
  assert.match(html, /Inspect attempt/);
  const path = join(content, "curation/fixture-animation.json");
  const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await writeFile(
    path,
    jsonBytes({
      ...curation,
      visible: false,
      series_publication_complete: false,
      series_incomplete_reason: "Withheld for empty-collection test.",
    }),
  );
  await build();
  const empty = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.match(empty, /No experiments published yet/);
  assert.doesNotMatch(empty, /class="filters"|data-select|comparison-tray/);
});

test("build emits lazy Shiki ranges tied to preserved artifacts without a browser highlighter", async (t) => {
  const { out } = await buildFixture(t);
  const html = await readFile(join(out, "gallery/runs/fixture-animation/index.html"), "utf8");
  assert.match(html, /data-highlight-url="\/assets\/highlights\/fixture-animation-html.json"/);
  assert.match(html, /data-wrap aria-pressed="true"/);
  assert.doesNotMatch(html, /class="syntax-token"/);
  const run = JSON.parse(
    await readFile(join(out, "gallery/evidence/runs/fixture-animation/run.json"), "utf8"),
  );
  for (const kind of ["html", "response"]) {
    const highlight = JSON.parse(
      await readFile(join(out, `gallery/assets/highlights/fixture-animation-${kind}.json`), "utf8"),
    );
    assert.equal(highlight.sha256, run.artifacts[kind].sha256);
    assert.ok(highlight.tokens.length > 0);
    if (kind === "html") {
      assert.match(highlight.formatted.source, /body \{\n/);
      assert.ok(highlight.formatted.tokens.length > 0);
    } else assert.equal(highlight.formatted, null);
  }
  const app = await readFile(join(out, "gallery/assets/app.js"), "utf8");
  assert.doesNotMatch(app, /from ["']shiki|WebAssembly|innerHTML/);
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
test("detail hierarchy puts total tokens first and defers dates and identifiers to provenance", async (t) => {
  const { out } = await buildFixture(t);
  const html = await readFile(join(out, "gallery/runs/fixture-animation/index.html"), "utf8");
  assert.match(
    html,
    /class="metadata run-highlights"><div><dt>Total tokens<\/dt><dd>3,726<\/dd><\/div><div><dt>Model time<\/dt><dd>17\.222 s<\/dd>/,
  );
  assert.match(html, /class="metadata token-breakdown"/);
  assert.match(html, /class="metadata run-context"/);
  assert.match(
    html,
    /<details class="evidence run-provenance" id="run-provenance"><summary>Run provenance<\/summary>/,
  );
  assert.ok(html.indexOf("Total tokens") < html.indexOf("<dt>Generated</dt>"));
  assert.ok(html.indexOf("Token breakdown") < html.indexOf("<dt>Published</dt>"));
  assert.match(html, /<dt>Run ID<\/dt><dd>fixture-animation<\/dd>/);
  assert.match(html, /<dt>Generated<\/dt><dd>2026-10-08T12:00:00Z<\/dd>/);
  assert.match(html, /id="run-instructions"><summary>Exact user instructions<\/summary>/);
  assert.doesNotMatch(html, /id="run-instructions" open|id="run-provenance" open/);
});

test("run conditions expose harness and effort without sampling controls", async (t) => {
  const { content, out } = await buildFixture(t);
  const run = await importRun({
    root: content,
    metadata: {
      ...fixtureMetadata("fixture-pi"),
      generation: {
        mode: "one-shot",
        interface: "coding-agent",
        tools_used: "no",
        harness: { name: "Pi", version: "1.1.0", effort: "low" },
        metrics: {
          time: { kind: "model", duration_ms: 17222 },
          tokens: { input: 1262, cached: 100, output: 2464, total: 3926 },
        },
      },
    },
    response: Buffer.from("No HTML returned."),
  });
  const path = join(content, `curation/${run.id}.json`);
  const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await writeFile(
    path,
    jsonBytes({ ...curation, visible: true, published_at: "2026-10-10T00:00:00Z" }),
  );
  await buildSite({
    root: content,
    out,
    galleryOrigin: "http://127.0.0.1:4173",
    previewOrigin: "http://127.0.0.1:4174",
    development: true,
  });
  const html = await readFile(join(out, "gallery/runs/fixture-pi/index.html"), "utf8");
  const gallery = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.match(gallery, /<dl class="metadata card-measurements">/);
  assert.match(gallery, /<div class="card-meta"><p class="eyebrow">Pi<\/p>/);
  assert.doesNotMatch(gallery, /<div class="card-meta"><p class="eyebrow">openai-codex<\/p>/);
  assert.doesNotMatch(gallery, /<dt>Harness<\/dt>|<dt>Version<\/dt>|<dt>Effort<\/dt>/);
  assert.match(html, /<dt>Harness<\/dt><dd>Pi<\/dd>/);
  assert.match(html, /<dt>Version<\/dt><dd>1\.1\.0<\/dd>/);
  assert.match(html, /<dt>Effort<\/dt><dd>low<\/dd>/);
  for (const page of [gallery, html]) {
    assert.match(page, /<dt>Model time<\/dt><dd>17\.222 s<\/dd>/);
    assert.match(page, /<dt>Total tokens<\/dt><dd>3,926<\/dd>/);
  }
  assert.doesNotMatch(
    gallery,
    /<dt>Input tokens<\/dt>|<dt>Cached tokens<\/dt>|<dt>Output tokens<\/dt>/,
  );
  assert.match(html, /<dt>Input tokens<\/dt><dd>1,262<\/dd>/);
  assert.match(html, /<dt>Cached tokens<\/dt><dd>100<\/dd>/);
  assert.match(html, /<dt>Output tokens<\/dt><dd>2,464<\/dd>/);
  const catalogue = JSON.parse(await readFile(join(out, "gallery/assets/runs.json"), "utf8"));
  assert.deepEqual(
    catalogue.find((entry: { run: { id: string } }) => entry.run.id === run.id).measurementRows,
    [
      ["Model time", "17.222 s"],
      ["Input tokens", "1,262"],
      ["Cached tokens", "100"],
      ["Output tokens", "2,464"],
      ["Total tokens", "3,926"],
    ],
  );
  assert.doesNotMatch(
    html,
    /Recorded settings|temperature|top_p|max_output_tokens|<summary>Known system instruction/,
  );
});

test("elapsed zero and missing historical measurements render without invented values", async (t) => {
  const { content, out } = await buildFixture(t);
  for (const [id, metrics] of [
    [
      "fixture-zero",
      {
        time: { kind: "elapsed", duration_ms: 0 },
        tokens: { input: 0, cached: 0, output: 0, total: 0 },
      },
    ],
    ["fixture-legacy", undefined],
  ] satisfies [string, unknown][]) {
    const run = await importRun({
      root: content,
      metadata: {
        ...fixtureMetadata(id),
        generation: {
          mode: "one-shot",
          interface: "other",
          tools_used: "no",
          ...(metrics === undefined ? {} : { metrics }),
        },
      },
      response: Buffer.from("No HTML returned."),
    });
    const path = join(content, `curation/${run.id}.json`);
    const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
    await writeFile(
      path,
      jsonBytes({ ...curation, visible: true, published_at: "2026-10-10T00:00:00Z" }),
    );
  }
  await buildSite({
    root: content,
    out,
    galleryOrigin: "http://127.0.0.1:4173",
    previewOrigin: "http://127.0.0.1:4174",
    development: true,
  });
  const zero = await readFile(join(out, "gallery/runs/fixture-zero/index.html"), "utf8");
  assert.match(zero, /<dt>Elapsed time<\/dt><dd>0 s<\/dd>/);
  for (const label of ["Input tokens", "Cached tokens", "Output tokens", "Total tokens"])
    assert.match(zero, new RegExp(`<dt>${label}</dt><dd>0</dd>`));
  const legacy = await readFile(join(out, "gallery/runs/fixture-legacy/index.html"), "utf8");
  for (const label of ["Time", "Input tokens", "Cached tokens", "Output tokens", "Total tokens"])
    assert.match(legacy, new RegExp(`<dt>${label}</dt><dd>Unknown</dd>`));
});

test("a provenance correction preserves the old route and replaces its gallery card", async (t) => {
  const { content, out } = await buildFixture(t);
  const oldPath = join(content, "runs/fixture-animation/run.json");
  const oldBytes = await readFile(oldPath);
  const original = JSON.parse(oldBytes.toString());
  const run = await importRun({
    root: content,
    metadata: {
      ...original,
      id: "fixture-animation-provenance",
      supersedes_run_id: "fixture-animation",
      correction_reason: "Add observed harness and effort.",
      generation: {
        mode: "one-shot",
        interface: "coding-agent",
        tools_used: "no",
        harness: { name: "Pi", version: "1.1.0", effort: "low" },
      },
    },
    response: await readFile(join(content, original.artifacts.response.path)),
  });
  const path = join(content, `curation/${run.id}.json`);
  const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await writeFile(
    path,
    jsonBytes({ ...curation, visible: true, published_at: "2026-10-10T00:00:00Z" }),
  );
  await buildSite({
    root: content,
    out,
    galleryOrigin: "http://127.0.0.1:4173",
    previewOrigin: "http://127.0.0.1:4174",
    development: true,
  });
  const gallery = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.match(gallery, /data-card="fixture-animation-provenance"/);
  assert.doesNotMatch(gallery, /data-card="fixture-animation"/);
  const oldPage = await readFile(join(out, "gallery/runs/fixture-animation/index.html"), "utf8");
  assert.match(oldPage, /href="\/runs\/fixture-animation-provenance\/"/);
  assert.match(oldPage, /View corrected run/);
  assert.deepEqual(await readFile(oldPath), oldBytes);
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
    /<article[^>]+data-card="fixture-null-html"[\s\S]*?<p class="card-state">Live preview unavailable<\/p>/,
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
