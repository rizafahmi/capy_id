import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { readArtifact, utf8, validateContent } from "./content.ts";
import { prepareCodeView } from "./highlight.ts";
import { type MeasurementRows, type MetadataPair, measurementRows } from "./presentation.ts";
import { buildRunPages, type RunPage } from "./run-pages.ts";
import type { Collection, Entry, Ledger, Preview } from "./schema.ts";
import { headerFile, previewPolicyVersion } from "./security.ts";

export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
type PublishedEntry = Entry & { preview: Preview; measurementRows: MeasurementRows };
const e = escapeHtml;
const evidenceUrl = (path: string) => `/evidence/${path}`;
const inspirationLink =
  '<a href="https://simonwillison.net/tags/pelican-riding-a-bicycle/">Simon Willison\'s pelican-riding-a-bicycle experiments</a>';
const screenshot = (entry: Entry) =>
  entry.curation.thumbnail
    ? `<img src="/${e(entry.curation.thumbnail.path)}" width="640" height="480" loading="lazy" alt="Screenshot of ${e(entry.run.model.display_name)} output">`
    : `<div class="placeholder" role="img" aria-label="Screenshot not captured"><span class="placeholder-mark" aria-hidden="true">?</span><span aria-hidden="true">Screenshot not captured</span></div>`;

function page(title: string, body: string, fixtures: boolean, section: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="A curated, inspectable gallery of model responses to one creative coding challenge. Not a model leaderboard."><title>${e(title)} · Capyboard</title><link rel="icon" href="/assets/favicon.png" type="image/png"><link rel="preload" href="/assets/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/app.js"></script></head><body data-page="${e(section)}"><a class="skip" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">cb</span>capyboard<span class="brand-tag">/ experiments</span></a><nav aria-label="Main navigation"><a href="/" ${section === "gallery" ? 'aria-current="page"' : ""}>Gallery</a><a href="/challenge/" ${section === "challenge" ? 'aria-current="page"' : ""}>The challenge <span aria-hidden="true">↗</span></a></nav></header>${fixtures ? '<div class="development-banner" role="note">Development fixtures. These are test examples, not genuine model experiments.</div>' : ""}<main id="main">${body}</main><footer class="site-footer"><span>Showcase first. Inspect everything.</span><a href="/challenge/#limits">Interpretation and limitations</a></footer><div id="global-status" class="sr-only" role="status"></div></body></html>`;
}
function card(entry: PublishedEntry, comparable: boolean): string {
  const run = entry.run;
  const harness = run.generation.harness?.name ?? "Unknown harness";
  const effort = run.generation.harness?.effort;
  const effortLabel =
    effort == null
      ? "Effort unknown"
      : `${effort.charAt(0).toUpperCase()}${effort.slice(1)} effort`;
  const [time, , , , total] = entry.measurementRows;
  const generated = run.generated_at
    ? `<time datetime="${e(run.generated_at)}">${e(new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(run.generated_at)))}</time>`
    : "Unknown date";
  const state = !run.artifacts.html
    ? "No runnable HTML returned"
    : entry.preview.kind === "unavailable"
      ? "Live preview unavailable"
      : "Opt-in live preview";
  return `<article class="card" data-card="${e(run.id)}" data-provider="${e(run.provider)}" data-name="${e(run.model.display_name)}" data-identifier="${e(run.model.identifier)}" data-date="${e(run.generated_at ?? "")}"><a class="card-image" href="/runs/${e(run.id)}/"><span class="sr-only">Inspect ${e(run.model.display_name)}</span>${screenshot(entry)}</a><div class="card-body"><div class="card-meta"><p class="eyebrow">${e(harness)}</p><span class="mode-badge">${e(run.generation.mode)}</span></div><div class="card-title"><h3><a href="/runs/${e(run.id)}/">${e(run.model.display_name)}</a></h3><p class="card-effort">${e(effortLabel)}</p></div><p class="card-date">${generated}</p>${metadata([time, total], "card-measurements")}<p class="card-state">${e(state)}</p><div class="card-bottom"><a class="text-link inspect-link" href="/runs/${e(run.id)}/">Inspect attempt<span class="sr-only"> from ${e(run.model.display_name)}</span> <span aria-hidden="true">↗</span></a>${comparable ? `<label class="selection" hidden><input type="checkbox" value="${e(run.id)}" data-select> Compare</label>` : ""}</div></div></article>`;
}
function gallery(entries: PublishedEntry[]): string {
  const providers = [...new Set(entries.map((entry) => entry.run.provider))].sort();
  const comparable = entries.length > 1;
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow">One fixed creative coding challenge</p><h1>One prompt.<br><span>Many capybaras.</span></h1><p class="hero-description">Each model gets the same prompt: animate a capybara on a hoverboard. Browse the outputs, then inspect the evidence.</p><div class="hero-actions"><a class="button hero-cta" href="#attempts">Browse attempts <span aria-hidden="true">↓</span></a><a class="text-link" href="/challenge/">Read the exact prompt</a></div></div><figure class="hero-visual"><div class="hero-photo"><img src="/assets/capybara.webp" srcset="/assets/capybara-small.webp 640w, /assets/capybara.webp 960w" sizes="240px" width="960" height="640" fetchpriority="high" alt="A capybara resting beside a river, the real-life subject of our coding challenge"></div><figcaption>Photo by <a href="https://commons.wikimedia.org/wiki/File:Capybaracropped.jpg">Giles Laurent</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a></figcaption></figure></section><section id="attempts" aria-labelledby="attempts-title" tabindex="-1"><div class="collection-heading"><h2 id="attempts-title">Collected attempts <span class="count">${entries.length}</span></h2><p id="about" class="interpretation">One task, not an overall model ranking. Original evidence is preserved.</p></div>${comparable ? `<details class="gallery-controls" hidden><summary>Filter and sort</summary><form class="filters"><label>Search models<input name="search" type="search" placeholder="Name, identifier, or provider" autocomplete="off" spellcheck="false" autocapitalize="none"></label><label>Provider<select name="provider"><option value="">All providers</option>${providers.map((provider) => `<option>${e(provider)}</option>`).join("")}</select></label><label>Sort by<select name="sort"><option value="newest">Newest first</option><option value="name">Model name</option></select></label><button type="reset" class="secondary" hidden>Reset</button></form></details><p id="results-status" class="results-status" role="status" hidden>${entries.length} attempts</p>` : ""}<div class="gallery-grid${entries.length === 1 ? " single-attempt" : ""}">${entries.map((entry) => card(entry, comparable)).join("")}</div><div id="empty-state" class="empty-state" ${entries.length ? "hidden" : ""}><h2>${entries.length ? "No matching attempts" : "No experiments published yet"}</h2><p>${entries.length ? "Try another search or reset your filters." : "Genuine experiments will appear here after curator review."}</p><button type="button" data-reset hidden>Reset filters</button></div></section>${comparable ? '<aside class="comparison-tray" hidden aria-label="Selected comparison"><p id="selection-count" role="status">0 of 2 selected</p><ul id="selected-runs"></ul><a id="compare-link" class="button" aria-disabled="true">Compare two</a></aside>' : ""}<p class="hero-inspiration">Inspired by ${inspirationLink}.</p>`;
}
function metadata(pairs: MetadataPair[], className = ""): string {
  return `<dl class="metadata${className ? ` ${e(className)}` : ""}">${pairs.map(([key, value]) => `<div><dt>${e(key)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl>`;
}
const highlightUrl = (id: string, kind: string) => `/assets/highlights/${id}-${kind}.json`;
function challengePage(collection: Collection): string {
  return `<header class="run-heading"><p class="eyebrow">Instructions and interpretation</p><h1>The challenge</h1><p class="hero-description">One deliberately narrow task. Every experiment keeps its instructions and generation history.</p></header>${[...collection.challenges.values()].map((challenge) => `<section id="${e(challenge.id)}"><h2>${e(challenge.title)}</h2><p class="eyebrow">${e(challenge.id)}</p><pre tabindex="0"><code>${e(collection.prompts.get(challenge.id))}</code></pre><button type="button" data-copy-url="${e(evidenceUrl(challenge.prompt_path))}" data-sha256="${e(challenge.prompt_sha256)}" hidden>Copy prompt</button><p class="checksum">SHA-256 ${e(challenge.prompt_sha256)}</p></section>`).join("")}<section class="prose"><h2 id="inspiration">From pelicans to capybaras</h2><p>${inspirationLink} inspired this challenge. Our version asks models to animate a capybara on a hoverboard in a single HTML file.</p><h2>Collection protocol</h2><ol><li>Start a fresh conversation or request with no previous user conversation.</li><li>Send the fixed prompt exactly once. Record known system instructions separately.</li><li>Do not edit, retry, or repair a canonical one-shot output.</li><li>Record provider, identifier, interface, timestamp, exposed settings, and known tool use. Leave unknown conditions unknown.</li><li>Save the full response and extracted HTML before publication.</li><li>Keep additional attempts as separate records in the same series. Publish all collected attempts or disclose incomplete publication.</li></ol><p>Revised and tool-assisted examples require prominent labels and their full user-turn transcript. A changed instruction creates a new challenge version.</p><h2 id="limits">What this gallery cannot tell you</h2><ul><li>One task cannot establish overall model quality.</li><li>Individual runs can vary.</li><li>Model aliases and chat products can change.</li><li>Publication may not represent all possible attempts.</li><li>Preview restrictions may affect behavior.</li></ul><h2>Preview policy ${previewPolicyVersion}</h2><p>Derived previews are byte-for-byte copies of extracted UTF-8 HTML. They are served on a separate origin under an enforced HTTP Content Security Policy and an iframe sandbox. Originals remain downloadable plain text on the gallery origin.</p><p>Inline scripts and styles can run. External resources, fetch requests, nested frames, forms, popups, and top navigation are restricted. No frame messages are trusted.</p><p>Sandboxing is not absolute network or CPU isolation. Scripts may navigate their own frame or block a browser. Curator-reviewed execution is opt-in, and suspect outputs remain evidence with execution disabled.</p><p>SHA-256 protects recorded integrity. It does not prove authorship or scientific validity.</p></section><p id="artifact-status" role="status"></p>`;
}
function comparePage(entries: Entry[]): string {
  return `<a class="back-link" href="/">← All attempts</a><header class="run-heading"><p class="eyebrow">Two attempts, one shared viewport</p><h1>Compare outputs</h1><p class="hero-description">Inspect the differences. No scores, no automatic winners.</p></header><form id="compare-form" action="/compare/" method="get"><div class="compare-selectors">${["left", "right"].map((side) => `<label>${side === "left" ? "Left" : "Right"} run<select name="${side}" required><option value="">Select a run</option>${entries.map((entry) => `<option value="${e(entry.run.id)}">${e(entry.run.model.display_name)} · ${e(entry.run.id)}</option>`).join("")}</select></label>`).join("")}<button type="submit">Compare</button></div></form><noscript><p>Comparison controls and previews require JavaScript. Open the individual run pages to inspect their evidence.</p></noscript><p id="compare-status" role="status">Choose two distinct runs.</p><div id="condition-notices"></div><button type="button" id="run-both" hidden>Run both</button><div id="compare-panels" class="compare-panels"></div>`;
}
function origin(value: string, development: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid origin: ${value}`);
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error(`Expected an origin without credentials or a path: ${value}`);
  if (
    url.protocol !== "https:" &&
    !(
      development &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error(
      "Production origins require HTTPS. HTTP is allowed only for local development.",
    );
  return url.origin;
}
export async function buildSite(options: {
  root: string;
  out: string;
  galleryOrigin: string;
  previewOrigin: string;
  development: boolean;
  priorIntegrity?: Ledger;
}): Promise<void> {
  const galleryOrigin = origin(options.galleryOrigin, options.development);
  const previewOrigin = origin(options.previewOrigin, options.development);
  if (galleryOrigin === previewOrigin)
    throw new Error("Gallery and preview require separate origins");
  const content = await validateContent(options.root, options.priorIntegrity);
  if (
    !options.development &&
    content.runs.some((entry) => entry.run.provider.startsWith("Development fixture"))
  )
    throw new Error(
      "Development fixtures cannot enter a production build. Use --development explicitly.",
    );
  const fixtures = content.runs.some((entry) =>
    entry.run.provider.startsWith("Development fixture"),
  );
  const out = resolve(options.out);
  if (
    out === content.root ||
    content.root.startsWith(`${out}${sep}`) ||
    out.startsWith(`${content.root}${sep}`)
  )
    throw new Error("Build output must not overlap content");
  let prior = false;
  try {
    const stats = await lstat(out);
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new Error("Output must be a real directory");
    if ((await readFile(join(out, ".capyboard-build"), "utf8")) !== "capyboard-generated-v1\n")
      throw new Error("Refusing to replace an unmarked output directory");
    prior = true;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    try {
      await lstat(out);
      throw new Error("Refusing to replace an unmarked output directory");
    } catch (missing) {
      if (!(missing instanceof Error && "code" in missing && missing.code === "ENOENT"))
        throw missing;
    }
  }
  await mkdir(dirname(out), { recursive: true });
  const staging = await mkdtemp(join(dirname(out), ".capyboard-build-"));
  const put = async (path: string, data: string | Uint8Array) => {
    await mkdir(dirname(join(staging, path)), { recursive: true });
    await writeFile(join(staging, path), data);
  };
  try {
    const entries = content.runs
      .filter((entry) => entry.curation.visible)
      .sort(
        (a, b) =>
          (b.run.generated_at ? Date.parse(b.run.generated_at) : -Infinity) -
            (a.run.generated_at ? Date.parse(a.run.generated_at) : -Infinity) ||
          a.run.id.localeCompare(b.run.id, "en"),
      );
    const corrections = new Map<string, Entry>();
    for (const entry of entries)
      if (entry.run.supersedes_run_id) corrections.set(entry.run.supersedes_run_id, entry);
    const views: PublishedEntry[] = [];
    const runPages: RunPage[] = [];
    for (const entry of entries) {
      const { run, curation } = entry;
      let preview: Preview = {
        kind: "unavailable",
        reason: !run.artifacts.html
          ? "No runnable HTML returned"
          : `Live preview unavailable. ${curation.preview_disabled_reason ?? "Curator review has not enabled execution."}`,
      };
      if (curation.preview_allowed && run.artifacts.html) {
        const bytes = await readArtifact(content.root, run.artifacts.html.path);
        if (utf8(bytes).includes("\0"))
          preview = {
            kind: "unavailable",
            reason:
              "Live preview unavailable. Preview preparation cannot represent null characters safely.",
          };
        else {
          await put(`preview/runs/${run.id}/index.html`, bytes);
          preview = { kind: "ready", url: `${previewOrigin}/runs/${run.id}/` };
        }
      }
      for (const [kind, artifact] of [
        ["response", run.artifacts.response],
        ["html", run.artifacts.html],
      ] as const) {
        if (!artifact) continue;
        const source = utf8(await readArtifact(content.root, artifact.path));
        await put(
          `gallery${highlightUrl(run.id, kind)}`,
          JSON.stringify(
            await prepareCodeView(source, kind === "html" ? "html" : "markdown", artifact.sha256),
          ),
        );
      }
      views.push({
        ...entry,
        transcript: {
          ...entry.transcript,
          turns: entry.transcript.turns.filter((turn) => turn.role !== "assistant"),
        },
        preview,
        measurementRows: measurementRows(run),
      });
      runPages.push({ entry, preview, correction: corrections.get(run.id) ?? null, fixtures });
      for (const path of [
        run.artifacts.response.path,
        run.artifacts.html?.path,
        run.instructions.transcript_path,
        `runs/${run.id}/run.json`,
        `curation/${run.id}.json`,
      ])
        if (path) await put(`gallery/evidence/${path}`, await readArtifact(content.root, path));
      if (curation.thumbnail)
        await put(
          `gallery/${curation.thumbnail.path}`,
          await readArtifact(content.root, curation.thumbnail.path),
        );
    }
    await buildRunPages({ pages: runPages, staging });
    for (const challenge of content.challenges.values())
      await put(
        `gallery/evidence/${challenge.prompt_path}`,
        await readArtifact(content.root, challenge.prompt_path),
      );
    await put(
      "gallery/index.html",
      page(
        "Gallery",
        gallery(views.filter((entry) => !corrections.has(entry.run.id))),
        fixtures,
        "gallery",
      ),
    );
    await put(
      "gallery/challenge/index.html",
      page("The challenge", challengePage(content), fixtures, "challenge"),
    );
    await put(
      "gallery/compare/index.html",
      page("Compare", comparePage(entries), fixtures, "compare"),
    );
    await put(
      "gallery/404.html",
      page(
        "Run not found",
        '<section class="empty-state"><h1>Run not found</h1><p>This run is unknown or is no longer published. Its original evidence may remain in the curator\'s repository.</p><a class="button" href="/">Return to the gallery</a></section>',
        fixtures,
        "not-found",
      ),
    );
    await put("gallery/assets/runs.json", `${JSON.stringify(views)}\n`);
    await mkdir(join(staging, "gallery/assets"), { recursive: true });
    for (const file of ["app.js", "site.css"])
      await cp(new URL(`../src/${file}`, import.meta.url), join(staging, "gallery/assets", file));
    await cp(new URL("../src/assets/", import.meta.url), join(staging, "gallery/assets"), {
      recursive: true,
    });
    await put("gallery/_headers", headerFile("gallery", previewOrigin));
    await put("preview/_headers", headerFile("preview", previewOrigin));
    await put(
      "preview/404.html",
      '<!doctype html><html lang="en"><title>Preview unavailable</title><body><h1>Preview unavailable</h1><p>Return to the gallery to inspect the preserved evidence.</p></body></html>',
    );
    await put(".capyboard-build", "capyboard-generated-v1\n");
    if (prior) await rm(out, { recursive: true });
    await rename(staging, out);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
