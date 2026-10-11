import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

type Rule = { path: string; headers: Record<string, string> };
function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  let current: Rule | undefined;
  for (const line of text.split("\n")) {
    if (line.startsWith("/")) {
      current = { path: line.trim(), headers: {} };
      rules.push(current);
    } else if (current && line.trim()) {
      const colon = line.indexOf(":");
      if (colon < 1) throw new Error("Invalid generated header configuration");
      current.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return rules;
}
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};
export async function staticHandler(root: string) {
  const base = resolve(root);
  const rules = parseHeaders(await readFile(join(base, "_headers"), "utf8"));
  return async (request: IncomingMessage, response: ServerResponse, next?: () => void) => {
    let path = "/";
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405);
        response.end("Method not allowed");
        return;
      }
      path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      if (
        path.includes("\\") ||
        path.includes("\0") ||
        path.split("/").includes("..") ||
        path.split("/").some((part) => part.startsWith("."))
      )
        throw new Error("Invalid path");
      let file = resolve(base, `.${path}`);
      if (file !== base && !file.startsWith(`${base}${sep}`)) throw new Error("Invalid path");
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const bytes = await readFile(file);
      const headers: Record<string, string> = {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      };
      for (const rule of rules)
        if (rule.path.endsWith("*") ? path.startsWith(rule.path.slice(0, -1)) : path === rule.path)
          Object.assign(headers, rule.headers);
      response.writeHead(200, headers);
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch {
      if (next) return next();
      const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
      for (const rule of rules) if (rule.path === "/*") Object.assign(headers, rule.headers);
      response.writeHead(404, headers);
      response.end(await readFile(join(base, "404.html")));
    }
  };
}
export async function serveStatic(root: string, port: number) {
  const handler = await staticHandler(root);
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolvePromise);
  });
  return server;
}
