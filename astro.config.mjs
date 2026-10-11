import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "astro/config";
import { astroConfig } from "./scripts/astro-config.ts";

const workspace = process.env.CAPYBOARD_ASTRO_WORKSPACE;

export default defineConfig(
  astroConfig(
    workspace
      ? {
          workspace,
          pages: JSON.parse(readFileSync(join(workspace, "pages.json"), "utf8")),
        }
      : null,
  ),
);
