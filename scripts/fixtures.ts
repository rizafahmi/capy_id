import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fixedChallenge, importRun, initializeContent, jsonBytes } from "./content.ts";

export const animationHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Development capybara</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#142b28;display:grid;place-items:center;height:100vh;overflow:hidden}
.scene{position:relative;width:300px;height:220px;animation:float 2.4s ease-in-out infinite}
.capy{position:absolute;width:175px;height:95px;background:#b28b63;border-radius:65% 48% 40% 45%;left:52px;top:55px;box-shadow:inset 0 -15px #8e694b}
.head{position:absolute;width:90px;height:78px;background:#c29a70;border-radius:45% 50% 35% 40%;left:160px;top:38px}
.ear{position:absolute;width:22px;height:22px;background:#977151;border:5px solid #c29a70;border-radius:50%;left:171px;top:30px}
.eye{position:absolute;width:7px;height:7px;background:#211b18;border-radius:50%;left:220px;top:60px}
.nose{position:absolute;width:8px;height:7px;background:#382a20;border-radius:50%;left:242px;top:84px}
.leg{position:absolute;width:25px;height:35px;background:#a57d57;border-radius:0 0 12px 12px;top:127px;left:90px}.leg.back{left:178px}
.board{position:absolute;width:240px;height:19px;background:#d3fb85;border-radius:50%;left:31px;top:159px;box-shadow:0 7px 25px #c6ff7180}
.shadow{width:210px;height:15px;background:#0005;border-radius:50%;position:absolute;top:205px;left:45px;animation:shadow 2.4s ease-in-out infinite}
@keyframes float{50%{transform:translateY(-12px) rotate(-2deg)}}@keyframes shadow{50%{transform:scale(.85)}}
</style></head><body><div class="scene" aria-label="An animated capybara riding a glowing hoverboard"><div class="shadow"></div><div class="capy"></div><div class="leg"></div><div class="leg back"></div><div class="head"></div><div class="ear"></div><div class="eye"></div><div class="nose"></div><div class="board"></div></div></body></html>\n`;

export function fixtureMetadata(id: string, generatedAt: string | null = "2026-10-08T12:00:00Z") {
  return {
    schema_version: 1,
    id,
    challenge_id: fixedChallenge,
    series_id: `${id}-series`,
    attempt_number: 1,
    provider: "Development fixture",
    model: {
      display_name: id.replace("fixture-", "").replaceAll("-", " "),
      identifier: id,
      identifier_kind: "display-only",
    },
    generated_at: generatedAt,
    generation: {
      mode: "one-shot",
      interface: "other",
      tools_used: "no",
      settings: { temperature: null, top_p: null, max_output_tokens: null, seed: null },
      system_instruction_known: false,
    },
  };
}
async function add(
  root: string,
  id: string,
  response: string,
  allowed: boolean,
  generatedAt: string | null = "2026-10-08T12:00:00Z",
) {
  const run = await importRun({
    root,
    metadata: fixtureMetadata(id, generatedAt),
    response: Buffer.from(response),
  });
  await writeFile(
    join(root, `curation/${id}.json`),
    jsonBytes({
      schema_version: 1,
      run_id: run.id,
      published_at: "2026-10-09T00:00:00Z",
      visible: true,
      preview_allowed: allowed && run.artifacts.html !== null,
      preview_disabled_reason:
        allowed && run.artifacts.html
          ? null
          : run.artifacts.html
            ? "Execution disabled for this development fixture."
            : "No runnable HTML returned.",
      observations: [
        "Development fixture authored for application testing. Not a genuine model experiment.",
      ],
      series_publication_complete: true,
      series_incomplete_reason: null,
      thumbnail: null,
    }),
  );
}
export async function createFixtures(root: string): Promise<void> {
  await initializeContent(root);
  await add(root, "fixture-animation", animationHtml, true);
  await add(
    root,
    "fixture-broken",
    "<!doctype html><html><body><script>throw new Error('Deliberately broken development fixture');</script></body></html>\n",
    true,
    "2026-10-07T00:00:00Z",
  );
  await add(root, "fixture-no-html", "I did not return runnable HTML.\n", false);
  await add(root, "fixture-unknown", animationHtml, true, null);
  await add(
    root,
    "fixture-disabled",
    "<!doctype html><html><body>Evidence remains available even when execution is disabled.</body></html>\n",
    false,
  );
}
export async function createContainmentFixtures(root: string, trapOrigin: string): Promise<void> {
  await add(
    root,
    "fixture-containment",
    `<!doctype html><html><body>
<form action="${trapOrigin}/form" method="post"><input name="example" value="blocked"></form>
<img src="${trapOrigin}/image"><script src="${trapOrigin}/remote.js"></script>
<script>
const results = {};
try { parent.document.body.dataset.compromised = 'yes'; results.parent = 'escaped'; } catch { results.parent = 'blocked'; }
try { top.location.href = '${trapOrigin}/top'; results.top = 'attempted'; } catch { results.top = 'blocked'; }
try { results.popup = window.open('${trapOrigin}/popup') ? 'opened' : 'blocked'; } catch { results.popup = 'blocked'; }
fetch('${trapOrigin}/fetch').catch(() => {});
document.querySelector('form').submit();
document.body.dataset.results = JSON.stringify(results);
</script></body></html>`,
    true,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(process.argv[2] ?? ".fixture-content");
  await mkdir(root, { recursive: true });
  await createFixtures(root);
  process.stdout.write(`Created labelled development content in ${root}\n`);
}
