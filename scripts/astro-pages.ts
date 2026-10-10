import { execFile } from "node:child_process";
import { cp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { MeasurementRows } from "./presentation.ts";
import type { Challenge, Entry, Preview } from "./schema.ts";

export type PublishedEntry = Entry & { preview: Preview; measurementRows: MeasurementRows };
type GalleryPage = { entries: PublishedEntry[]; fixtures: boolean };

export type RunPage = {
  entry: Entry;
  preview: Preview;
  correction: Entry | null;
  fixtures: boolean;
};

export type ChallengePrompt = Challenge & { prompt: string };
type ChallengePage = { challenges: ChallengePrompt[]; fixtures: boolean };

export type AstroPages = {
  gallery: GalleryPage;
  challenge: ChallengePage;
  runs: RunPage[];
};

const execute = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const astroCli = join(
  dirname(fileURLToPath(import.meta.resolve("astro/package.json"))),
  "bin/astro.mjs",
);

export async function buildAstroPages(options: {
  pages: AstroPages;
  staging: string;
}): Promise<void> {
  const directory = join(options.staging, ".astro");
  await mkdir(directory);
  const workspace = await realpath(directory);
  try {
    await writeFile(join(workspace, "pages.json"), JSON.stringify(options.pages));
    await symlink(join(projectRoot, "node_modules"), join(workspace, "node_modules"), "dir");
    await execute(
      process.execPath,
      [astroCli, "build", "--config", relative(workspace, join(projectRoot, "astro.config.mjs"))],
      {
        cwd: workspace,
        env: {
          ...process.env,
          CAPYBOARD_ASTRO_WORKSPACE: workspace,
          ASTRO_TELEMETRY_DISABLED: "1",
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    await cp(join(workspace, "site"), join(options.staging, "gallery"), { recursive: true });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
