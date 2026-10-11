import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { buildSite } from "../scripts/build.ts";
import { importRun, initializeContent, jsonBytes, sha256 } from "../scripts/content.ts";
import { createFixtures, fixtureMetadata } from "../scripts/fixtures.ts";
import { challengeSchema, curationSchema, ledgerSchema } from "../scripts/schema.ts";

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

test("challenge versions preserve prompt bytes, escape text, and keep scripts external", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "capyboard-challenges-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const content = join(root, "content");
  await initializeContent(content);
  const prompt = Buffer.from(
    '\nDraw <canvas> & keep "quotes".\n<script>alert("prompt")</script>\n',
  );
  const challenge = challengeSchema.parse({
    schema_version: 1,
    id: "challenge-v2",
    title: '<script>alert("title")</script>',
    prompt_path: "challenges/challenge-v2/prompt.txt",
    prompt_sha256: sha256(prompt),
  });
  const metadataPath = "challenges/challenge-v2/challenge.json";
  const metadata = jsonBytes(challenge);
  await mkdir(join(content, "challenges/challenge-v2"));
  await writeFile(join(content, challenge.prompt_path), prompt);
  await writeFile(join(content, metadataPath), metadata);
  const ledger = ledgerSchema.parse(
    JSON.parse(await readFile(join(content, "integrity.json"), "utf8")),
  );
  for (const [path, bytes] of [
    [challenge.prompt_path, prompt],
    [metadataPath, metadata],
  ] as const)
    ledger.files[path] = { sha256: sha256(bytes), size_bytes: bytes.length };
  await writeFile(join(content, "integrity.json"), jsonBytes(ledger));
  const out = join(root, "site");
  await buildSite({
    root: content,
    out,
    galleryOrigin: "https://gallery.example",
    previewOrigin: "https://preview.example",
    development: false,
  });
  const html = await readFile(join(out, "gallery/challenge/index.html"), "utf8");
  assert.match(html, /<section id="capybara-hoverboard-v1">/);
  assert.match(html, /<section id="challenge-v2">/);
  assert.match(html, /<h2>&lt;script&gt;alert\([^<]*title[^<]*\)&lt;\/script&gt;<\/h2>/);
  assert.match(
    html,
    /<pre tabindex="0"><code>\nDraw &lt;canvas&gt; &amp; keep [^\n]+\n&lt;script&gt;alert\([^<]*prompt[^<]*\)&lt;\/script&gt;\n<\/code><\/pre>/,
  );
  assert.match(html, /data-copy-url="\/evidence\/challenges\/challenge-v2\/prompt.txt"/);
  assert.ok(html.includes(`data-sha256="${challenge.prompt_sha256}"`));
  assert.match(html, /aria-current="page">The challenge/);
  assert.doesNotMatch(html, /Development fixtures|<iframe|<style|astro-island/);
  assert.equal((html.match(/<script\b/g) ?? []).length, 1);
  assert.match(html, /<script type="module" src="\/assets\/app.js"><\/script>/);
  for (const path of ["challenges/capybara-hoverboard-v1/prompt.txt", challenge.prompt_path])
    assert.deepEqual(
      await readFile(join(out, "gallery/evidence", path)),
      await readFile(join(content, path)),
    );
});

test("gallery is static, contains all attempts, and contains no experiment execution", async (t) => {
  const { out } = await buildFixture(t);
  const html = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.equal((html.match(/data-card=/g) ?? []).length, 5);
  assert.doesNotMatch(html, /<iframe|Deliberately broken development fixture/);
  assert.match(html, /Development fixtures/);
  assert.match(html, /fixture-no-html/);
  assert.match(html, /class="card-effort">Low effort<\/p>/);
  assert.match(html, /class="card-effort">Effort unknown<\/p>/);
});
test("gallery and comparison escape untrusted labels and keep scripts external", async (t) => {
  const { content, out } = await buildFixture(t);
  const injected = '<img src=x onerror="alert(1)">';
  const run = await importRun({
    root: content,
    metadata: {
      ...fixtureMetadata("fixture-gallery-escaping"),
      provider: injected,
      model: { display_name: injected, identifier: injected, identifier_kind: "display-only" },
      generation: {
        mode: "one-shot",
        interface: "other",
        tools_used: "no",
        harness: { name: injected, version: "test", effort: null },
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
  const html = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.doesNotMatch(html, /<iframe|<style|astro-island/);
  assert.equal((html.match(/<script\b/g) ?? []).length, 1);
  assert.match(html, /<script type="module" src="\/assets\/app.js"><\/script>/);
  assert.match(html, /<h3><a[^>]*>&lt;img src=x onerror=/);
  assert.match(html, /<option>&lt;img src=x onerror=/);
  assert.match(html, /<p class="eyebrow">&lt;img src=x onerror=/);
  const comparison = await readFile(join(out, "gallery/compare/index.html"), "utf8");
  assert.equal(
    (comparison.match(/<option value="fixture-gallery-escaping">&lt;img src=x onerror=/g) ?? [])
      .length,
    2,
  );
  assert.doesNotMatch(comparison, /<img|<iframe|<style|astro-island/);
  assert.equal((comparison.match(/<script\b/g) ?? []).length, 1);
  assert.match(comparison, /<script type="module" src="\/assets\/app.js"><\/script>/);
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
  const comparison = await readFile(join(out, "gallery/compare/index.html"), "utf8");
  assert.equal((comparison.match(/<option value="fixture-animation">/g) ?? []).length, 2);
  assert.doesNotMatch(comparison, /<option value="fixture-(unknown|broken|disabled|no-html)">/);
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
  const emptyComparison = await readFile(join(out, "gallery/compare/index.html"), "utf8");
  assert.equal((emptyComparison.match(/<option value="">Select a run<\/option>/g) ?? []).length, 2);
  assert.equal((emptyComparison.match(/<option\b/g) ?? []).length, 2);
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
  assert.match(
    html,
    /<a class="button preview-open" href="http:\/\/127\.0\.0\.1:4174\/runs\/fixture-animation\/" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open preview in new tab<\/a>/,
  );
  assert.match(html, /Exact user instructions/);
  assert.doesNotMatch(html, /<iframe/);
  assert.match(
    await readFile(join(out, "gallery/challenge/index.html"), "utf8"),
    /Return only the HTML source/,
  );
  const notFound = await readFile(join(out, "gallery/404.html"), "utf8");
  assert.match(notFound, /<title>Run not found · Capyboard<\/title>/);
  assert.match(notFound, /<body data-page="not-found">/);
  assert.match(notFound, /<h1>Run not found<\/h1>/);
  assert.match(notFound, /class="button" href="\/">Return to the gallery<\/a>/);
  assert.match(notFound, /Development fixtures/);
  assert.doesNotMatch(notFound, /<iframe|<style|astro-island/);
  assert.equal((notFound.match(/<script\b/g) ?? []).length, 1);
  assert.match(notFound, /<script type="module" src="\/assets\/app.js"><\/script>/);
});
test("run detail escapes content and keeps scripts external under the existing CSP", async (t) => {
  const { content, out } = await buildFixture(t);
  const injected = '<script>alert("untrusted")</script>';
  const run = await importRun({
    root: content,
    metadata: {
      ...fixtureMetadata("fixture-escaping"),
      model: { display_name: injected, identifier: "escaping", identifier_kind: "snapshot" },
      generation: { mode: "revised", interface: "other", tools_used: "no" },
    },
    response: Buffer.from("No HTML returned."),
    transcript: {
      schema_version: 1,
      turns: [
        {
          role: "user",
          content: await readFile(
            join(content, "challenges/capybara-hoverboard-v1/prompt.txt"),
            "utf8",
          ),
        },
        { role: "user", content: injected },
      ],
    },
  });
  const path = join(content, `curation/${run.id}.json`);
  const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await writeFile(
    path,
    jsonBytes({
      ...curation,
      visible: true,
      published_at: "2026-10-10T00:00:00Z",
      observations: [injected],
    }),
  );
  await buildSite({
    root: content,
    out,
    galleryOrigin: "http://127.0.0.1:4173",
    previewOrigin: "http://127.0.0.1:4174",
    development: true,
  });
  const html = await readFile(join(out, `gallery/runs/${run.id}/index.html`), "utf8");
  assert.doesNotMatch(html, /<script>alert|<style|style=|astro-island/);
  assert.equal((html.match(/<script\b/g) ?? []).length, 1);
  assert.match(html, /<script type="module" src="\/assets\/app.js"><\/script>/);
  assert.match(html, /&lt;script&gt;alert\(/);
  assert.match(html, /<title>&lt;script&gt;/);
  assert.match(html, /<h1>&lt;script&gt;/);
  assert.match(html, /<li>&lt;script&gt;/);
  assert.match(html, /<code>&lt;script&gt;/);
});

test("rebuilding removes withheld run routes without publishing build inputs", async (t) => {
  const { content, out } = await buildFixture(t);
  const path = join(content, "curation/fixture-animation.json");
  const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await writeFile(
    path,
    jsonBytes({
      ...curation,
      visible: false,
      series_publication_complete: false,
      series_incomplete_reason: "Withheld for rebuild test.",
    }),
  );
  await buildSite({
    root: content,
    out,
    galleryOrigin: "http://127.0.0.1:4173",
    previewOrigin: "http://127.0.0.1:4174",
    development: true,
  });
  for (const path of [
    "gallery/runs/fixture-animation/index.html",
    "preview/runs/fixture-animation/index.html",
    "gallery/pages.json",
  ]) {
    await assert.rejects(readFile(join(out, path)), { code: "ENOENT" });
  }
  assert.match(
    await readFile(join(out, "gallery/runs/fixture-unknown/index.html"), "utf8"),
    /<h1>unknown<\/h1>/,
  );
});

test("concurrent builds keep their run-page data and preview origins separate", async (t) => {
  const first = await buildFixture(t);
  const second = await buildFixture(t);
  const path = join(second.content, "curation/fixture-broken.json");
  const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await writeFile(
    path,
    jsonBytes({
      ...curation,
      visible: false,
      series_publication_complete: false,
      series_incomplete_reason: "Withheld in the second concurrent build.",
    }),
  );
  const builds = [
    { ...first, previewOrigin: "http://127.0.0.1:4174", expectedCards: 5 },
    { ...second, previewOrigin: "http://127.0.0.1:5174", expectedCards: 4 },
  ];
  await Promise.all(
    builds.map(({ content, out, previewOrigin }) =>
      buildSite({
        root: content,
        out,
        galleryOrigin: "http://127.0.0.1:4173",
        previewOrigin,
        development: true,
      }),
    ),
  );
  for (const { out, previewOrigin, expectedCards } of builds) {
    const gallery = await readFile(join(out, "gallery/index.html"), "utf8");
    assert.equal((gallery.match(/data-card=/g) ?? []).length, expectedCards);
    const html = await readFile(join(out, "gallery/runs/fixture-animation/index.html"), "utf8");
    assert.ok(html.includes(`data-preview-url="${previewOrigin}/runs/fixture-animation/"`));
    assert.ok(html.includes(`href="${previewOrigin}/runs/fixture-animation/"`));
    await assert.rejects(readFile(join(out, ".astro/pages.json")), { code: "ENOENT" });
  }
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
  assert.match(gallery, /class="card-effort">Low effort<\/p>/);
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
  const gallery = await readFile(join(out, "gallery/index.html"), "utf8");
  assert.match(
    gallery,
    /data-card="fixture-legacy"[\s\S]*?class="card-effort">Effort unknown<\/p>/,
  );
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
  const comparison = await readFile(join(out, "gallery/compare/index.html"), "utf8");
  for (const id of ["fixture-animation", "fixture-animation-provenance"])
    assert.equal((comparison.match(new RegExp(`<option value="${id}">`, "g")) ?? []).length, 2);
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
  assert.doesNotMatch(
    await readFile(join(out, "gallery/404.html"), "utf8"),
    /Development fixtures/,
  );
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
  assert.match(gallery.toString(), /<h3><a[^>]*>&lt;img src=x onerror=alert\(1\)&gt;<\/a><\/h3>/);
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

test("development preparation returns validated pages and original artifacts without static gallery HTML", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "capyboard-dev-preparation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const content = join(root, "content");
  await createFixtures(content);
  const options = {
    root: content,
    out: join(root, "site"),
    galleryOrigin: "http://127.0.0.1:4173",
    previewOrigin: "http://127.0.0.1:4174",
    development: true,
    render: "dev",
  } satisfies Parameters<typeof buildSite>[0];
  await assert.rejects(
    buildSite({ ...options, development: false }),
    /Deferred rendering is only available for local development/,
  );
  const pages = await buildSite(options);
  assert.equal(pages.gallery.entries.length, 5);
  assert.equal(pages.runs.length, 5);
  assert.equal(pages.challenge.challenges.length, 1);
  assert.equal(pages.notFound.fixtures, true);
  for (const path of [
    "index.html",
    "challenge/index.html",
    "compare/index.html",
    "404.html",
    "runs/fixture-animation/index.html",
  ])
    await assert.rejects(readFile(join(options.out, "gallery", path)), { code: "ENOENT" });
  const original = await readFile(join(content, "runs/fixture-animation/output.html.txt"));
  assert.deepEqual(
    await readFile(join(options.out, "gallery/evidence/runs/fixture-animation/output.html.txt")),
    original,
  );
  assert.deepEqual(
    await readFile(join(options.out, "preview/runs/fixture-animation/index.html")),
    original,
  );
  assert.doesNotMatch(
    await readFile(join(options.out, "gallery/_headers"), "utf8"),
    /ws:\/\/|unsafe-inline/,
  );
  const ledger = ledgerSchema.parse(
    JSON.parse(await readFile(join(content, "integrity.json"), "utf8")),
  );
  await writeFile(join(content, "runs/fixture-animation/output.html.txt"), "changed evidence");
  await assert.rejects(buildSite({ ...options, priorIntegrity: ledger }), /hash|integrity|SHA/i);
  assert.deepEqual(
    await readFile(join(options.out, "preview/runs/fixture-animation/index.html")),
    original,
  );
});
