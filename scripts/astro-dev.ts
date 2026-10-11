import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { dev } from "astro";
import { astroConfig, projectRoot } from "./astro-config.ts";
import type { AstroPages } from "./astro-pages.ts";
import { galleryCsp, responseHeaders } from "./security.ts";
import { staticHandler } from "./server.ts";

export async function serveAstro(options: { pages: AstroPages; workspace: string; out: string }) {
  const config = astroConfig(options);
  const gallery = join(options.out, "gallery");
  const serveArtifacts = await staticHandler(gallery);
  const headers = responseHeaders("gallery", "http://127.0.0.1:4174");
  headers["Content-Security-Policy"] = galleryCsp("http://127.0.0.1:4174").replace(
    "connect-src 'self'",
    "connect-src 'self' ws://127.0.0.1:4173",
  );
  const assets = join(projectRoot, "src/assets");
  await mkdir(join(options.workspace, "public"));
  return dev({
    ...config,
    root: projectRoot,
    configFile: false,
    publicDir: join(options.workspace, "public"),
    devToolbar: { enabled: false },
    server: { host: "127.0.0.1", port: 4173, headers },
    vite: {
      ...config.vite,
      server: {
        strictPort: true,
        cors: false,
        fs: {
          allow: [
            join(projectRoot, "src"),
            join(projectRoot, "scripts"),
            join(projectRoot, "node_modules"),
          ],
        },
        watch: {
          ignored: [
            "**/.audit/**",
            "**/.dev/**",
            "**/.fixture-content/**",
            "**/.test-site/**",
            "**/content/**",
            `${options.out}/**`,
            `${options.workspace}/**`,
          ],
        },
      },
      plugins: [
        {
          name: "validated-artifacts",
          configureServer(server) {
            server.middlewares.use((request, response, next) => {
              void serveArtifacts(request, response, next).catch(next);
            });
            let copying = Promise.resolve();
            server.watcher.on("all", (event, file) => {
              if (!["add", "change", "unlink"].includes(event)) return;
              const source = resolve(file);
              const path = source.startsWith(`${assets}${sep}`)
                ? source.slice(assets.length + 1)
                : ["app.js", "site.css"].find((name) => source === join(projectRoot, "src", name));
              if (!path) return;
              copying = copying
                .then(async () => {
                  const destination = join(gallery, "assets", path);
                  if (event === "unlink") await rm(destination, { force: true });
                  else {
                    await mkdir(dirname(destination), { recursive: true });
                    await cp(source, destination);
                  }
                  server.hot.send({ type: "full-reload", path: "*" });
                })
                .catch((error: unknown) => {
                  server.config.logger.error(`Cannot refresh asset ${source}: ${String(error)}`);
                });
            });
          },
        },
      ],
    },
  });
}
