import { execFile } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Entry, Preview } from "./schema.ts";

export type RunPage = {
  entry: Entry;
  preview: Preview;
  correction: Entry | null;
  fixtures: boolean;
};

const execute = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const astroCli = join(
  dirname(fileURLToPath(import.meta.resolve("astro/package.json"))),
  "bin/astro.mjs",
);

export async function buildRunPages(options: { pages: RunPage[]; staging: string }): Promise<void> {
  const workspace = join(options.staging, ".astro");
  await mkdir(workspace);
  await writeFile(join(workspace, "run-pages.json"), JSON.stringify(options.pages));
  try {
    await execute(process.execPath, [astroCli, "build", "--config", "astro.config.mjs"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        CAPYBOARD_ASTRO_WORKSPACE: workspace,
        ASTRO_TELEMETRY_DISABLED: "1",
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    await cp(join(workspace, "site"), join(options.staging, "gallery"), { recursive: true });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
