import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const workspace = process.env.CAPYBOARD_ASTRO_WORKSPACE;

export default defineConfig({
  srcDir: join(projectRoot, "src/astro"),
  outDir: workspace ? join(workspace, "site") : "./dist/gallery",
  cacheDir: workspace ? join(workspace, "cache") : "./node_modules/.astro",
  output: "static",
  trailingSlash: "always",
  build: { inlineStylesheets: "never" },
  integrations: [
    {
      name: "validated-pages",
      hooks: {
        "astro:config:setup": ({ command }) => {
          if ((command === "build" || command === "dev") && !workspace) {
            throw new Error(
              "Use npm run build or npm run dev so content validation and preview isolation run first.",
            );
          }
        },
      },
    },
  ],
  vite: {
    cacheDir: workspace ? join(workspace, "vite-cache") : "./node_modules/.astro-vite",
    define: {
      __CAPYBOARD_ASTRO_PAGES__: workspace
        ? readFileSync(join(workspace, "pages.json"), "utf8")
        : JSON.stringify({
            gallery: { entries: [], fixtures: false },
            challenge: { challenges: [], fixtures: false },
            comparison: { runs: [], fixtures: false },
            runs: [],
          }),
    },
  },
});
