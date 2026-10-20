import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { transform } from "lightningcss";
import { transformWithOxc } from "vite";
import {
  type AstroPages,
  buildAstroPages,
  type ChallengePrompt,
  type PublishedEntry,
  type RunPage,
} from "./astro-pages.ts";
import { readArtifact, utf8, validateContent } from "./content.ts";
import { prepareCodeView } from "./highlight.ts";
import { measurementRows } from "./presentation.ts";
import type { Entry, Ledger, Preview } from "./schema.ts";
import { headerFile } from "./security.ts";

const highlightUrl = (id: string, kind: string) => `/assets/highlights/${id}-${kind}.json`;
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
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
function buildSitemap(siteOrigin: string, entries: PublishedEntry[]): string {
  const latest = entries
    .map((entry) => entry.curation.published_at ?? entry.run.generated_at)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  const urls: Array<{ loc: string; lastmod?: string | undefined }> = [
    { loc: `${siteOrigin}/`, lastmod: latest },
    { loc: `${siteOrigin}/challenge/` },
    { loc: `${siteOrigin}/compare/` },
    ...entries.map((entry) => ({
      loc: `${siteOrigin}/runs/${encodeURIComponent(entry.run.id)}/`,
      lastmod: entry.curation.published_at ?? entry.run.generated_at ?? undefined,
    })),
  ];
  const body = urls
    .map(
      ({ loc, lastmod }) =>
        `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ""}\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
function buildLlmsTxt(
  siteOrigin: string,
  challenges: ChallengePrompt[],
  entries: PublishedEntry[],
): string {
  const challengeLines = challenges.map(
    (challenge) =>
      `- [${challenge.title} (${challenge.id})](${siteOrigin}/evidence/${challenge.prompt_path}): SHA-256 \`${challenge.prompt_sha256}\``,
  );
  const runLines =
    entries.length === 0
      ? ["No experiments published yet."]
      : entries.map((entry) => {
          const { run, curation, measurementRows: rows } = entry;
          const harness = run.generation.harness
            ? `${run.generation.harness.name}${run.generation.harness.effort ? ` (${run.generation.harness.effort} effort)` : ""}`
            : "Unknown harness";
          const metrics = rows.map(([label, value]) => `${label}: ${value}`).join(", ");
          const observation = curation.observations[0] ? ` — ${curation.observations[0]}` : "";
          const htmlLink = run.artifacts.html
            ? `, [HTML source](${siteOrigin}/evidence/${run.artifacts.html.path})`
            : "";
          return `- [${run.model.display_name}](${siteOrigin}/runs/${encodeURIComponent(run.id)}/) (\`${run.id}\`, ${run.provider}, ${run.generation.mode}, ${harness}; ${metrics})${observation}\n  Evidence: [run.json](${siteOrigin}/evidence/runs/${run.id}/run.json), [curation.json](${siteOrigin}/evidence/curation/${run.id}.json), [transcript.json](${siteOrigin}/evidence/${run.instructions.transcript_path}), [response.txt](${siteOrigin}/evidence/${run.artifacts.response.path})${htmlLink}`;
        });
  return [
    "# Capyboard",
    "",
    "> A curated, inspectable gallery of AI model responses to one HTML, CSS, and JavaScript coding challenge: animate a capybara on a hoverboard. Not a model leaderboard.",
    "",
    "Capyboard preserves each collected AI model attempt alongside its exact prompt, recorded generation conditions, token and timing metrics, SHA-256 artifact digests, and qualitative curator observations.",
    "",
    "## Key Pages & Machine-Readable Endpoints",
    "",
    `- [Gallery](${siteOrigin}/): Browse and filter all published model attempts.`,
    `- [The Challenge & Protocol](${siteOrigin}/challenge/): Exact prompt text, SHA-256 checksums, collection protocol, and restricted preview policy.`,
    `- [Side-by-Side Comparison](${siteOrigin}/compare/): Compare any two published runs across equal 4:3 viewports and recorded metrics.`,
    `- [Published Runs Catalogue (JSON)](${siteOrigin}/assets/runs.json): Machine-readable JSON catalogue of all published runs, measurements, curator observations, and evidence URLs.`,
    `- [Sitemap (XML)](${siteOrigin}/sitemap.xml): Canonical URL index.`,
    "",
    "## Challenge Prompts",
    "",
    ...challengeLines,
    "",
    "## Published Runs",
    "",
    ...runLines,
    "",
  ].join("\n");
}
export async function buildSite(options: {
  root: string;
  out: string;
  galleryOrigin: string;
  previewOrigin: string;
  development: boolean;
  priorIntegrity?: Ledger;
  render?: "static" | "dev";
}): Promise<AstroPages> {
  if (options.render === "dev" && !options.development)
    throw new Error("Deferred rendering is only available for local development");
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
    const directCorrections = new Map<string, Entry>();
    for (const entry of entries)
      if (entry.run.supersedes_run_id) directCorrections.set(entry.run.supersedes_run_id, entry);
    const corrections = new Map<string, Entry>();
    for (const [id, first] of directCorrections) {
      let current = first;
      const seen = new Set([id, current.run.id]);
      while (directCorrections.has(current.run.id)) {
        const next = directCorrections.get(current.run.id);
        if (!next || seen.has(next.run.id)) break;
        seen.add(next.run.id);
        current = next;
      }
      corrections.set(id, current);
    }
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
    const challenges: ChallengePrompt[] = [];
    for (const challenge of content.challenges.values()) {
      const bytes = await readArtifact(content.root, challenge.prompt_path);
      challenges.push({ ...challenge, prompt: utf8(bytes) });
      await put(`gallery/evidence/${challenge.prompt_path}`, bytes);
    }
    const activeEntries = views.filter((entry) => !corrections.has(entry.run.id));
    const pages: AstroPages = {
      origin: galleryOrigin,
      gallery: { entries: activeEntries, fixtures },
      challenge: { challenges, fixtures },
      comparison: {
        runs: entries.map(({ run }) => ({
          id: run.id,
          model: run.model,
          generation: run.generation,
          attempt_number: run.attempt_number,
          generated_at: run.generated_at,
        })),
        fixtures,
      },
      notFound: { fixtures },
      runs: runPages,
    };
    if (options.render !== "dev") await buildAstroPages({ pages, staging });
    await put("gallery/assets/runs.json", `${JSON.stringify(views)}\n`);
    await mkdir(join(staging, "gallery/assets"), { recursive: true });
    const rawCss = await readFile(new URL("../src/site.css", import.meta.url));
    const minifiedCss = transform({ filename: "site.css", code: rawCss, minify: true }).code;
    await put("gallery/assets/site.css", minifiedCss);

    const rawJs = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
    const minifiedJs = (
      await transformWithOxc(rawJs, "app.js", {
        minify: true,
      } as Parameters<typeof transformWithOxc>[2] & { minify?: boolean })
    ).code;
    await put("gallery/assets/app.js", minifiedJs);
    await cp(new URL("../src/assets/", import.meta.url), join(staging, "gallery/assets"), {
      recursive: true,
    });
    for (const rootAsset of [
      "favicon.ico",
      "favicon-32x32.png",
      "apple-touch-icon.png",
      "site.webmanifest",
    ]) {
      await cp(
        new URL(`../src/assets/${rootAsset}`, import.meta.url),
        join(staging, `gallery/${rootAsset}`),
      );
    }
    await put("gallery/_headers", headerFile("gallery", previewOrigin));
    await put(
      "gallery/robots.txt",
      fixtures
        ? "User-agent: *\nDisallow: /\n"
        : `User-agent: *\nAllow: /\nSitemap: ${galleryOrigin}/sitemap.xml\n`,
    );
    await put("gallery/sitemap.xml", buildSitemap(galleryOrigin, activeEntries));
    await put("gallery/llms.txt", buildLlmsTxt(galleryOrigin, challenges, activeEntries));
    await put("preview/_headers", headerFile("preview", previewOrigin));
    await put("preview/robots.txt", "User-agent: *\nDisallow: /\n");
    await put(
      "preview/404.html",
      '<!doctype html><html lang="en"><title>Preview unavailable</title><body><h1>Preview unavailable</h1><p>Return to the gallery to inspect the preserved evidence.</p></body></html>',
    );
    await put(".capyboard-build", "capyboard-generated-v1\n");
    if (prior) await rm(out, { recursive: true });
    await rename(staging, out);
    return pages;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
