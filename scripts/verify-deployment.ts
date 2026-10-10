import { parseArgs } from "node:util";
import { z } from "zod";
import { sha256 } from "./content.ts";
import { curationSchema, runSchema, transcriptSchema } from "./schema.ts";
import { galleryCsp, permissionsPolicy, previewCsp } from "./security.ts";

const entrySchema = z.object({
  run: runSchema,
  curation: curationSchema,
  transcript: transcriptSchema,
  preview: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("ready"), url: z.url() }),
    z.object({ kind: z.literal("unavailable"), reason: z.string() }),
  ]),
});
const { values } = parseArgs({
  options: {
    "gallery-origin": { type: "string" },
    "preview-origin": { type: "string" },
    development: { type: "boolean", default: false },
    launch: { type: "boolean", default: false },
  },
});
async function get(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), credentials: "omit" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
}
function headers(response: Response, policy: string): void {
  if (response.headers.get("content-security-policy") !== policy)
    throw new Error(`Unexpected enforced CSP on ${response.url}`);
  if (response.headers.get("x-content-type-options") !== "nosniff")
    throw new Error(`Missing nosniff on ${response.url}`);
  if (response.headers.get("permissions-policy") !== permissionsPolicy)
    throw new Error(`Missing permissions restrictions on ${response.url}`);
  if (response.headers.get("referrer-policy") !== "no-referrer")
    throw new Error(`Missing no-referrer on ${response.url}`);
  if (!values.development && !response.headers.get("strict-transport-security"))
    throw new Error(`Missing HSTS on ${response.url}`);
}
try {
  if (!values["gallery-origin"] || !values["preview-origin"])
    throw new Error("Supply --gallery-origin and --preview-origin");
  const gallery = new URL(values["gallery-origin"]);
  const preview = new URL(values["preview-origin"]);
  for (const url of [gallery, preview]) {
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      throw new Error("Supply origins without credentials, paths, or query strings");
    if (
      url.protocol !== "https:" &&
      !(
        values.development &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
    )
      throw new Error("Remote deployments require HTTPS");
  }
  if (gallery.origin === preview.origin) throw new Error("Separate origins are required");
  const hostPolicy = galleryCsp(preview.origin);
  for (const path of ["/", "/challenge/", "/compare/"])
    headers(await get(`${gallery.origin}${path}`), hostPolicy);
  const catalogueResponse = await get(`${gallery.origin}/assets/runs.json`);
  const raw: unknown = await catalogueResponse.json();
  const entries = z.array(entrySchema).parse(raw);
  let artifacts = 0;
  let previews = 0;
  for (const entry of entries) {
    const { run } = entry;
    headers(await get(`${gallery.origin}/runs/${run.id}/`), hostPolicy);
    for (const artifact of [run.artifacts.response, run.artifacts.html]) {
      if (!artifact) continue;
      const response = await get(`${gallery.origin}/evidence/${artifact.path}`);
      headers(response, hostPolicy);
      if (!response.headers.get("content-type")?.startsWith("text/plain"))
        throw new Error(`Evidence is not plain text: ${artifact.path}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (sha256(bytes) !== artifact.sha256 || bytes.length !== artifact.size_bytes)
        throw new Error(`Deployed artifact checksum mismatch: ${artifact.path}`);
      artifacts++;
    }
    if (entry.preview.kind === "ready") {
      if (!entry.preview.url.startsWith(`${preview.origin}/runs/`))
        throw new Error("Catalogue references an unexpected preview origin");
      const response = await get(entry.preview.url);
      headers(response, previewCsp);
      if (!response.headers.get("content-type")?.startsWith("text/html"))
        throw new Error("Preview must be served as HTML");
      if (sha256(new Uint8Array(await response.arrayBuffer())) !== run.artifacts.html?.sha256)
        throw new Error(`Preview bytes differ from preserved source: ${run.id}`);
      previews++;
    }
  }
  const missing = await fetch(`${gallery.origin}/runs/capyboard-verification-unknown-id/`, {
    signal: AbortSignal.timeout(10000),
  });
  if (missing.status !== 404)
    throw new Error("Unknown run routes must return a useful 404, not an empty success");
  if (values.launch) {
    const models = new Set(
      entries
        .filter(
          ({ run }) =>
            run.challenge_id === "capybara-hoverboard-v1" &&
            !run.provider.startsWith("Development fixture") &&
            run.model.identifier_kind !== "unknown",
        )
        .map(({ run }) => `${run.provider}/${run.model.identifier}`),
    );
    if (models.size < 3)
      throw new Error(
        "Public launch requires genuine attempts from at least three identified models. Provenance still requires human review.",
      );
  }
  process.stdout.write(
    `${JSON.stringify({ status: "verified", scope: "HTTP routes, headers, and artifact bytes", runs: entries.length, artifacts, previews, launch_content_check: values.launch, provenance: "Human review required" }, null, 2)}\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
