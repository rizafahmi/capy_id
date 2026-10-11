import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { chromium, expect, firefox, webkit } from "@playwright/test";
import { curationSchema } from "../../scripts/schema.ts";
import { serveStatic } from "../../scripts/server.ts";

const execute = promisify(execFile);

test("managed Astro development reloads source edits in every browser and stops both origins", {
  timeout: 180000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "capyboard-astro-dev-"));
  const root = join(directory, "project with spaces");
  await mkdir(root);
  for (const path of [
    "scripts",
    "src",
    "astro.config.mjs",
    "package.json",
    "tsconfig.json",
    "tsconfig.astro.json",
  ])
    await cp(path, join(root, path), { recursive: true });
  await symlink(resolve("node_modules"), join(root, "node_modules"), "dir");
  const command = (action: string) =>
    execute(
      "bash",
      [join(root, "scripts/dev-server.sh"), action, ...(action === "stop" ? [] : ["--fixtures"])],
      { timeout: 90000 },
    );
  t.after(async () => {
    await command("stop");
    await rm(directory, { recursive: true, force: true });
  });
  await command("start");
  await execute(
    process.execPath,
    [
      join(root, "scripts/cli.ts"),
      "build",
      "--content",
      ".fixture-content",
      "--out",
      ".static-site",
      "--development",
      "--gallery-origin",
      "http://127.0.0.1:4173",
      "--preview-origin",
      "http://127.0.0.1:4174",
    ],
    { cwd: root, timeout: 90000 },
  );
  const baselineServer = await serveStatic(join(root, ".static-site/gallery"), 0);
  t.after(async () => {
    await new Promise<void>((done, reject) => {
      baselineServer.close((error) => (error ? reject(error) : done()));
      baselineServer.closeAllConnections();
    });
  });
  const address = baselineServer.address();
  assert.ok(address && typeof address !== "string");
  const baselineOrigin = `http://127.0.0.1:${address.port}`;
  const firstPid = await readFile(join(root, ".dev/server.pid"), "utf8");
  const template = join(root, "src/astro/layouts/Shell.astro");
  const css = join(root, "src/site.css");
  const script = join(root, "src/app.js");
  const originals = await Promise.all(
    [template, css, script].map((path) => readFile(path, "utf8")),
  );
  const [originalTemplate, originalCss, originalScript] = originals;
  assert.ok(originalTemplate && originalCss && originalScript);
  for (const [name, browserType] of [
    ["chromium", chromium],
    ["firefox", firefox],
    ["webkit", webkit],
  ] as const) {
    const browser = await browserType.launch();
    try {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      const violations: string[] = [];
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          document.documentElement.dataset.cspViolation = JSON.stringify({
            directive: event.violatedDirective,
            source: event.sourceFile,
            line: event.lineNumber,
            sample: event.sample,
          });
        });
      });
      page.on("console", (message) => {
        if (message.type() === "error" && message.text().includes("Content Security Policy"))
          violations.push(message.text());
      });
      await page.goto(baselineOrigin);
      await expect(page.locator("[data-card]")).toHaveCount(5);
      const baselineViolation = await page.locator("html").getAttribute("data-csp-violation");
      if (baselineViolation !== null) {
        assert.equal(name, "webkit");
        assert.deepEqual(JSON.parse(baselineViolation), {
          directive: "style-src-attr",
          source: "",
          line: 1,
          sample: "",
        });
      }
      const baselineMessages = [...new Set(violations)];
      violations.length = 0;
      if (name === "chromium") {
        for (const path of [
          "/",
          "/challenge/",
          "/compare/",
          "/runs/fixture-animation/",
          "/runs/missing/",
        ]) {
          await page.goto(`${baselineOrigin}${path}`);
          await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
          const before = await page.screenshot({ animations: "disabled" });
          await page.goto(`http://127.0.0.1:4173${path}`);
          await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
          assert.deepEqual(
            await page.screenshot({ animations: "disabled" }),
            before,
            `Native dev differs from static ${path}`,
          );
        }
      }
      const response = await page.goto("http://127.0.0.1:4173/");
      assert.equal(response?.status(), 200);
      assert.equal(response?.headers()["x-content-type-options"], "nosniff");
      const policy = response?.headers()["content-security-policy"] ?? "";
      assert.match(policy, /connect-src 'self' ws:\/\/127\.0\.0\.1:4173/);
      assert.match(policy, /script-src 'self'; style-src 'self'/);
      assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
      await expect(page.locator('script[src="/@vite/client"]')).toHaveCount(1);
      await expect(page.locator("astro-dev-toolbar")).toHaveCount(0);
      await expect(page.locator("[data-card]")).toHaveCount(5);
      await writeFile(
        template,
        originalTemplate.replace(
          "Showcase first. Inspect everything.",
          `Live templates in ${name}.`,
        ),
      );
      await expect(page.locator(".site-footer")).toContainText(`Live templates in ${name}.`, {
        timeout: 15000,
      });
      await writeFile(css, `${originalCss}\nbody { --dev-reload-probe: ${name}; }\n`);
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.body).getPropertyValue("--dev-reload-probe").trim(),
          ),
        )
        .toBe(name);
      await writeFile(
        script,
        `${originalScript}\ndocument.body.dataset.devReloadProbe = "${name}";\n`,
      );
      await expect(page.locator("body")).toHaveAttribute("data-dev-reload-probe", name);
      await writeFile(join(root, "src/assets/dev-reload-probe.txt"), `asset ${name}`);
      await expect
        .poll(
          async () =>
            await (await fetch("http://127.0.0.1:4173/assets/dev-reload-probe.txt")).text(),
        )
        .toBe(`asset ${name}`);
      await rm(join(root, "src/assets/dev-reload-probe.txt"));
      await expect
        .poll(async () => (await fetch("http://127.0.0.1:4173/assets/dev-reload-probe.txt")).status)
        .toBe(404);
      assert.equal(
        await page.locator("html").getAttribute("data-csp-violation"),
        baselineViolation,
        `${name}: ${violations.join("\n")}`,
      );
      assert.deepEqual([...new Set(violations)], baselineMessages);
      const preview = await fetch("http://127.0.0.1:4174/runs/not-found/");
      assert.match(preview.headers.get("content-security-policy") ?? "", /connect-src 'none'/);
      assert.doesNotMatch(await preview.text(), /@vite|astro-dev-toolbar/);
      await Promise.all([
        writeFile(template, originalTemplate),
        writeFile(css, originalCss),
        writeFile(script, originalScript),
      ]);
      await expect(page.locator(".site-footer")).toContainText(
        "Showcase first. Inspect everything.",
      );
    } finally {
      await browser.close();
    }
  }
  const originalHtml = await readFile(
    join(root, ".fixture-content/runs/fixture-animation/output.html.txt"),
  );
  const previewHtml = await fetch("http://127.0.0.1:4174/runs/fixture-animation/");
  assert.deepEqual(Buffer.from(await previewHtml.arrayBuffer()), originalHtml);
  const evidence = await fetch(
    "http://127.0.0.1:4173/evidence/runs/fixture-animation/output.html.txt",
  );
  assert.match(evidence.headers.get("content-type") ?? "", /^text\/plain/);
  assert.equal(evidence.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await evidence.arrayBuffer()), originalHtml);
  const privatePath = join(root, ".fixture-content/private.txt");
  await writeFile(privatePath, "private unpublished content");
  for (const path of [
    "/.fixture-content/private.txt",
    `/@fs${privatePath}`,
    `/@fs${privatePath}?raw`,
    "/.dev/server.pid",
    `/@fs${join(root, ".dev/server.pid")}`,
  ]) {
    const response = await fetch(`http://127.0.0.1:4173${path}`);
    assert.ok([403, 404].includes(response.status), `${path}: ${response.status}`);
    assert.doesNotMatch(await response.text(), /private unpublished content/);
  }
  assert.equal((await fetch("http://127.0.0.1:4174/@vite/client")).status, 404);
  const curationPath = join(root, ".fixture-content/curation/fixture-disabled.json");
  const curation = curationSchema.parse(JSON.parse(await readFile(curationPath, "utf8")));
  await writeFile(
    curationPath,
    JSON.stringify({
      ...curation,
      visible: false,
      series_publication_complete: false,
      series_incomplete_reason: "Withheld during the development snapshot check.",
    }),
  );
  assert.equal((await fetch("http://127.0.0.1:4173/runs/fixture-disabled/")).status, 200);
  await command("restart");
  assert.notEqual(await readFile(join(root, ".dev/server.pid"), "utf8"), firstPid);
  assert.equal((await fetch("http://127.0.0.1:4173/")).status, 200);
  assert.equal((await fetch("http://127.0.0.1:4173/runs/fixture-disabled/")).status, 404);
  assert.equal(
    (await fetch("http://127.0.0.1:4173/evidence/runs/fixture-disabled/output.html.txt")).status,
    404,
  );
  assert.equal((await fetch("http://127.0.0.1:4174/runs/not-found/")).status, 404);
  await command("stop");
  await assert.rejects(fetch("http://127.0.0.1:4173/"));
  await assert.rejects(fetch("http://127.0.0.1:4174/"));
  for (const port of [4173, 4174]) {
    const unmanaged = createServer((_request, response) => response.end("unmanaged listener"));
    await new Promise<void>((done, reject) => {
      unmanaged.once("error", reject);
      unmanaged.listen(port, "127.0.0.1", done);
    });
    try {
      await assert.rejects(command("start"), /already in use|EADDRINUSE/);
      assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), "unmanaged listener");
      await assert.rejects(fetch(`http://127.0.0.1:${port === 4173 ? 4174 : 4173}/`));
      await assert.rejects(readFile(join(root, ".dev/server.pid")), { code: "ENOENT" });
    } finally {
      await new Promise<void>((done, reject) => {
        unmanaged.close((error) => (error ? reject(error) : done()));
        unmanaged.closeAllConnections();
      });
    }
  }
  await writeFile(
    join(root, ".fixture-content/runs/fixture-animation/output.html.txt"),
    "tampered historical evidence",
  );
  await assert.rejects(command("start"), /hash|integrity|SHA/i);
  await assert.rejects(fetch("http://127.0.0.1:4173/"));
  await assert.rejects(fetch("http://127.0.0.1:4174/"));
});
