import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "astro/config";
import { astroConfig } from "./scripts/astro-config.ts";

const workspace = process.env.CAPYBOARD_ASTRO_WORKSPACE;
function readPages(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read Astro page data from ${path}`, { cause: error });
  }
}

export default defineConfig(
  astroConfig(
    workspace
      ? {
          workspace,
          pages: readPages(join(workspace, "pages.json")),
        }
      : null,
  ),
);
