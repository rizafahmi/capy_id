import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroInlineConfig } from "astro";
import type { AstroPages } from "./astro-pages.ts";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function astroConfig(
  input: { workspace: string; pages: AstroPages } | null,
): AstroInlineConfig {
  return {
    srcDir: join(projectRoot, "src/astro"),
    outDir: input ? join(input.workspace, "site") : "./dist/gallery",
    cacheDir: input ? join(input.workspace, "cache") : "./node_modules/.astro",
    output: "static",
    trailingSlash: "always",
    build: { inlineStylesheets: "never" },
    integrations: [
      {
        name: "validated-pages",
        hooks: {
          "astro:config:setup": ({ command }) => {
            if ((command === "build" || command === "dev") && !input)
              throw new Error(
                "Use npm run build or npm run dev so content validation and preview isolation run first.",
              );
          },
        },
      },
    ],
    vite: {
      cacheDir: input ? join(input.workspace, "vite-cache") : "./node_modules/.astro-vite",
      define: {
        __CAPYBOARD_ASTRO_PAGES__: JSON.stringify(
          input?.pages ??
            ({
              gallery: { entries: [], fixtures: false },
              challenge: { challenges: [], fixtures: false },
              comparison: { runs: [], fixtures: false },
              notFound: { fixtures: false },
              runs: [],
            } satisfies AstroPages),
        ),
      },
    },
  };
}
