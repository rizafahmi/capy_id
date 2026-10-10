import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const workspace = process.env.CAPYBOARD_ASTRO_WORKSPACE;

export default defineConfig({
  root: workspace ?? projectRoot,
  srcDir: join(projectRoot, "src/astro"),
  outDir: workspace ? join(workspace, "site") : "./dist/gallery",
  cacheDir: workspace ? join(workspace, "cache") : "./node_modules/.astro",
  output: "static",
  trailingSlash: "always",
  build: { inlineStylesheets: "never" },
  integrations: [
    {
      name: "validated-run-pages",
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
    define: {
      __CAPYBOARD_RUN_PAGES__: workspace
        ? readFileSync(join(workspace, "run-pages.json"), "utf8")
        : "[]",
    },
  },
});
