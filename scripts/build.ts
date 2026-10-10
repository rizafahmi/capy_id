import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { buildAstroPages, type PublishedEntry, type RunPage } from "./astro-pages.ts";
import { readArtifact, utf8, validateContent } from "./content.ts";
import { prepareCodeView } from "./highlight.ts";
import { measurementRows } from "./presentation.ts";
import type { Collection, Entry, Ledger, Preview } from "./schema.ts";
import { headerFile, previewPolicyVersion } from "./security.ts";

export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const e = escapeHtml;
const evidenceUrl = (path: string) => `/evidence/${path}`;
const inspirationLink =
  '<a href="https://simonwillison.net/tags/pelican-riding-a-bicycle/">Simon Willison\'s pelican-riding-a-bicycle experiments</a>';
function page(title: string, body: string, fixtures: boolean, section: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="A curated, inspectable gallery of model responses to one creative coding challenge. Not a model leaderboard."><title>${e(title)} · Capyboard</title><link rel="icon" href="/assets/favicon.png" type="image/png"><link rel="preload" href="/assets/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/app.js"></script></head><body data-page="${e(section)}"><a class="skip" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">cb</span>capyboard<span class="brand-tag">/ experiments</span></a><nav aria-label="Main navigation"><a href="/" ${section === "gallery" ? 'aria-current="page"' : ""}>Gallery</a><a href="/challenge/" ${section === "challenge" ? 'aria-current="page"' : ""}>The challenge <span aria-hidden="true">↗</span></a></nav></header>${fixtures ? '<div class="development-banner" role="note">Development fixtures. These are test examples, not genuine model experiments.</div>' : ""}<main id="main">${body}</main><footer class="site-footer"><span>Showcase first. Inspect everything.</span><a href="/challenge/#limits">Interpretation and limitations</a></footer><div id="global-status" class="sr-only" role="status"></div></body></html>`;
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
    await buildAstroPages({
      pages: {
        gallery: { entries: views.filter((entry) => !corrections.has(entry.run.id)), fixtures },
        runs: runPages,
      },
      staging,
    });
    for (const challenge of content.challenges.values())
      await put(
        `gallery/evidence/${challenge.prompt_path}`,
        await readArtifact(content.root, challenge.prompt_path),
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
