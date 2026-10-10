import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Locator, test } from "@playwright/test";
import { animationHtml, createFixtures } from "../../scripts/fixtures.ts";

test("inspiration credit is visible and linked on gallery and challenge", async ({ page }) => {
  for (const url of ["/", "/challenge/"]) {
    await page.goto(url);
    const credit = page.getByRole("link", {
      name: "Simon Willison's pelican-riding-a-bicycle experiments",
      exact: true,
    });
    await expect(credit).toBeVisible();
    await expect(credit).toHaveAttribute(
      "href",
      "https://simonwillison.net/tags/pelican-riding-a-bicycle/",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await expect(page.getByRole("heading", { name: "From pelicans to capybaras" })).toBeVisible();
});

test("gallery browsing combines controls without loading experiment artifacts", async ({
  page,
}) => {
  const artifacts: string[] = [];
  page.on("request", (request) => {
    if (
      /\/evidence\/.*(?:response|output)/.test(request.url()) ||
      request.url().startsWith("http://127.0.0.1:4174")
    )
      artifacts.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("[data-card]:visible")).toHaveCount(6);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset", exact: true })).not.toBeVisible();
  await page.getByText("Filter and sort", { exact: true }).click();
  await page.getByLabel("Search models").fill("FIXTURE-ANIMATION");
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Provider", exact: true })
    .selectOption("Development fixture");
  await expect(page.locator("[data-card]:visible")).toHaveCount(1);
  await page.getByLabel("Search models").fill("not a model");
  await expect(page.getByText("No matching attempts", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator("[data-card]:visible")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Reset", exact: true })).not.toBeVisible();
  await expect(page.locator("#results-status")).not.toBeVisible();
  await expect(page.locator("[data-card]").last()).toHaveAttribute("data-card", "fixture-unknown");
  await page.getByRole("combobox", { name: "Sort by", exact: true }).selectOption("name");
  await expect(page.locator("[data-card]").first()).toHaveAttribute(
    "data-card",
    "fixture-animation",
  );
  expect(artifacts).toEqual([]);
});

test("run inspection preserves downloads, starts only on request, and unloads on Stop", async ({
  page,
}) => {
  await page.goto("/runs/fixture-animation/");
  await page.reload();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Run preview", exact: true }).click();
  const originalFrame = await page.locator("iframe").elementHandle();
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.locator(".preview-status")).toContainText("Preview started");
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  expect(await originalFrame?.evaluate((node) => node.isConnected)).toBe(false);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByText("Extracted HTML", { exact: true }).click();
  const source = page.locator("[data-evidence-url$='output.html.txt'] code");
  await expect(page.getByRole("button", { name: "Formatted", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Formatted", exact: true }).click();
  await expect(source).toHaveText(animationHtml);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML", exact: true }).click();
  const file = await (await download).path();
  expect(await readFile(file)).toEqual(Buffer.from(animationHtml));
  const responseDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download original response" }).click();
  expect(await readFile(await (await responseDownload).path())).toEqual(Buffer.from(animationHtml));
});

test("gallery defers harness details to inspection and comparison without sampling controls", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const card = page.locator("[data-card='fixture-animation']");
  await expect(card.getByText("Harness", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Version", { exact: true })).toHaveCount(0);
  await expect(card.locator(".card-effort")).toHaveText("Low effort");
  await expect(card.locator(".card-effort")).toBeVisible();
  await expect(page.locator("[data-card='fixture-unknown'] .card-effort")).toHaveText(
    "Effort unknown",
  );
  await card.getByRole("link", { name: "Inspect attempt from animation", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/fixture-animation\//);
  await expect(
    page.locator(".metadata").getByText("Development harness", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".metadata").getByText("low", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Recorded settings");
  await expect(page.locator("main")).not.toContainText("temperature");
  await expect(page.locator("main")).not.toContainText("top_p");
  const response = await request.get("/evidence/runs/fixture-animation/run.json");
  const run = await response.json();
  expect(run.generation).toEqual({
    mode: "one-shot",
    interface: "other",
    tools_used: "no",
    harness: { name: "Development harness", version: "test", effort: "low" },
    metrics: {
      time: { kind: "model", duration_ms: 17222 },
      tokens: { input: 1262, cached: 0, output: 2464, total: 3726 },
    },
  });
  await page.goto("/compare/?left=fixture-animation&right=fixture-unknown");
  await expect(page.locator(".compare-panel")).toHaveCount(2);
  await expect(page.locator(".compare-panel").first().locator("dl")).toContainText("low");
  await expect(page.locator(".compare-panel").last().locator("dl")).toContainText("Unknown");
  await expect(page.locator("#condition-notices")).toContainText("Effort: low versus Unknown");
  await expect(page.locator("main")).not.toContainText("temperature");
  await expect(page.locator("main")).not.toContainText("top_p");
});

test("gallery effort stays readable without JavaScript on narrow and wide screens", async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) throw new Error("Gallery tests require a base URL");
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.locator("[data-card='fixture-animation'] .card-effort")).toHaveText(
        "Low effort",
      );
      await expect(page.locator("[data-card='fixture-animation'] .card-effort")).toBeVisible();
      await expect(page.locator("[data-card='fixture-unknown'] .card-effort")).toHaveText(
        "Effort unknown",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  } finally {
    await context.close();
  }
});

test("time and token measurements are readable in gallery, detail and comparison", async ({
  page,
  browser,
}) => {
  const expected: [string, string][] = [
    ["Model time", "17.222 s"],
    ["Input tokens", "1,262"],
    ["Cached tokens", "0"],
    ["Output tokens", "2,464"],
    ["Total tokens", "3,726"],
  ];
  for (const [url, selector] of [
    ["/", "[data-card='fixture-animation'] .metadata"],
    ["/runs/fixture-animation/", ".metadata"],
    [
      "/compare/?left=fixture-animation&right=fixture-unknown",
      ".compare-panel:first-child .metadata",
    ],
  ] satisfies [string, string][]) {
    await page.goto(url);
    const metadata = page.locator(selector);
    const visibleMeasurements =
      url === "/"
        ? expected.filter(([label]) => label === "Model time" || label === "Total tokens")
        : expected;
    for (const [label, value] of visibleMeasurements) {
      const row = metadata
        .locator("div")
        .filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) });
      await expect(row.locator("dd")).toHaveText(value);
    }
    await expect(page.locator("iframe")).toHaveCount(0);
  }
  const unknown = page.locator(".compare-panel").last().locator(".metadata");
  for (const label of ["Time", "Input tokens", "Cached tokens", "Output tokens", "Total tokens"]) {
    const row = unknown
      .locator("div")
      .filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) });
    await expect(row.locator("dd")).toHaveText("Unknown");
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const staticPage = await context.newPage();
    for (const url of ["/", "/runs/fixture-animation/"]) {
      await staticPage.goto(`http://127.0.0.1:4173${url}`);
      await expect(staticPage.getByText("3,726", { exact: true }).first()).toBeVisible();
      await expect(staticPage.getByText("17.222 s", { exact: true }).first()).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("copy succeeds or leaves selectable exact text with an explanatory fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copied = text;
        },
      },
    });
  });
  await page.goto("/runs/fixture-animation/");
  await page.getByText("Exact user instructions", { exact: true }).click();
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  await expect(page.locator("#artifact-status")).toContainText("Copied preserved text");
  const prompt = await page.locator("#run-instructions code").first().textContent();
  expect(await page.locator("html").getAttribute("data-copied")).toBe(prompt);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    }),
  );
  await page.getByText("Extracted HTML", { exact: true }).click();
  await page.getByRole("button", { name: "Copy original HTML", exact: true }).click();
  await expect(
    page.locator("[data-evidence-url$='output.html.txt'] .evidence-status"),
  ).toContainText("Clipboard unavailable");
  const fallback = page.getByRole("textbox", { name: "Preserved text for manual copying" });
  await expect(fallback).toHaveValue(animationHtml);
  expect(
    await fallback.evaluate(
      (node) =>
        node instanceof HTMLTextAreaElement &&
        node.selectionStart === 0 &&
        node.selectionEnd === node.value.length,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Formatted", exact: true }).click();
  expect(await page.locator("[data-evidence-url$='output.html.txt'] code").textContent()).toBe(
    animationHtml,
  );
});

test("missing HTML, disabled execution, failed retrieval, and unknown IDs stay honest", async ({
  page,
}) => {
  await page.goto("/runs/fixture-no-html/");
  await expect(page.locator(".preview-controls .notice")).toHaveText("No runnable HTML returned");
  await expect(page.getByRole("button", { name: "Run preview" })).toHaveCount(0);
  await page.goto("/runs/fixture-disabled/");
  await expect(page.getByText(/Live preview unavailable\./)).toBeVisible();
  await page.getByText("Extracted HTML", { exact: true }).click();
  await expect(page.locator("[data-evidence-url$='output.html.txt'] code")).toContainText(
    "Evidence remains available",
  );
  await page.goto("/runs/fixture-animation/");
  await page.route("**/response.txt", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.getByText("Original response", { exact: true }).click();
  await expect(page.locator("[data-evidence-url$='response.txt'] .evidence-status")).toContainText(
    "Artifact retrieval failed (404)",
  );
  const response = await page.goto("/runs/not-a-run/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Run not found" })).toBeVisible();
});

test("gallery selects exactly two runs and comparison reconstructs the URL", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-card='fixture-animation'] input").check();
  await expect(page.locator("#compare-link")).toHaveAttribute("aria-disabled", "true");
  await page.locator("[data-card='fixture-unknown'] input").check();
  await page.locator("[data-card='fixture-broken'] input").click();
  await expect(page.locator("[data-card='fixture-broken'] input")).not.toBeChecked();
  await expect(page.locator("#selection-count")).toHaveText("2 of 2 selected");
  await page.getByRole("link", { name: "Compare two" }).click();
  await expect(page).toHaveURL(/left=fixture-animation&right=fixture-unknown/);
  await page.reload();
  await expect(page.locator(".compare-panel")).toHaveCount(2);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByText("Generation conditions differ or are incomplete.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run both", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(2);
  const sizes = await page
    .locator("iframe")
    .evaluateAll((frames) =>
      frames.map((frame) => [
        frame.getBoundingClientRect().width,
        frame.getBoundingClientRect().height,
      ]),
    );
  expect(sizes[0]).toEqual(sizes[1]);
  expect(sizes[0]?.[0]).toBeLessThanOrEqual(640);
  expect((sizes[0]?.[0] ?? 0) / (sizes[0]?.[1] ?? 1)).toBe(4 / 3);
  expect(
    await page
      .locator(".preview-stage")
      .first()
      .evaluate((node) => node.clientWidth),
  ).toBe(sizes[0]?.[0]);
  await page
    .getByRole("combobox", { name: "Right run", exact: true })
    .selectOption("fixture-no-html");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator(".compare-panel").last()).toContainText("No runnable HTML returned");
  await page
    .getByRole("combobox", { name: "Right run", exact: true })
    .selectOption("fixture-animation");
  await expect(page.locator("#compare-status")).toContainText(
    "Choose two distinct published run IDs",
  );
  await page.goto("/compare/?left=unknown&right=fixture-animation");
  await expect(page.locator("#compare-status")).toContainText("Unknown or duplicate IDs");
});

test("enforced preview headers block parent access, top navigation, popups, forms, and resource requests", async ({
  page,
  request,
}) => {
  await request.get("http://127.0.0.1:4175/reset");
  await page.goto("/runs/fixture-containment/");
  await page.getByRole("button", { name: "Run preview", exact: true }).click();
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("body")).toHaveAttribute("data-results", /"parent":"blocked"/);
  await expect(frame.locator("body")).toHaveAttribute("data-results", /"top":"blocked"/);
  await expect(frame.locator("body")).toHaveAttribute("data-results", /"popup":"blocked"/);
  expect(await page.locator("body").getAttribute("data-compromised")).toBe(null);
  expect(page.context().pages().length).toBe(1);
  await expect(page).toHaveURL(/\/runs\/fixture-containment\//);
  expect(await (await request.get("http://127.0.0.1:4175/attempts")).json()).toEqual([]);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const source = await request.get("/evidence/runs/fixture-animation/output.html.txt");
  expect(source.headers()["content-type"]).toContain("text/plain");
  expect(source.headers()["x-content-type-options"]).toBe("nosniff");
  const preview = await request.get("http://127.0.0.1:4174/runs/fixture-animation/");
  expect(preview.headers()["content-security-policy"]).toContain("sandbox allow-scripts");
  await page.goto("http://127.0.0.1:4174/runs/fixture-animation/");
  expect(await page.evaluate(() => window.origin)).toBe("null");
});

for (const width of [360, 768, 1440]) {
  test(`shell has no horizontal overflow at ${width}px and comparison viewports match`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const url of [
      "/",
      "/runs/fixture-animation/",
      "/challenge/",
      "/compare/?left=fixture-animation&right=fixture-unknown",
    ]) {
      await page.goto(url);
      if (url.startsWith("/compare")) await expect(page.locator(".compare-panel")).toHaveCount(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const boxes = await page.locator(".preview-stage").evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        top: node.getBoundingClientRect().top,
      })),
    );
    expect(boxes[0]?.width).toBe(boxes[1]?.width);
    expect(boxes[0]?.height).toBe(boxes[1]?.height);
    if (width === 360) expect(boxes[1]?.top).toBeGreaterThan(boxes[0]?.top ?? 0);
    await page.screenshot({ path: info.outputPath(`compare-${width}.png`), fullPage: true });
  });
}

test("keyboard focus reaches evidence controls and host-owned Stop", async ({ page }, info) => {
  const tab = info.project.name === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
  const tabTo = async (target: Locator) => {
    for (let step = 0; step < 50; step++) {
      if (await target.evaluate((node) => node === document.activeElement)) break;
      await page.keyboard.press(tab);
    }
    await expect(target).toBeFocused();
  };
  await page.goto("/");
  await page.keyboard.press(tab);
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await tabTo(page.getByRole("link", { name: "Inspect attempt from animation", exact: true }));
  await page.keyboard.press("Enter");
  await tabTo(page.getByRole("button", { name: "Run preview", exact: true }));
  await page.keyboard.press("Enter");
  await tabTo(page.getByRole("button", { name: "Stop", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.locator("iframe")).toHaveCount(0);
  await tabTo(page.getByText("Original response", { exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-evidence-url$='response.txt'] code")).toContainText(
    "Development capybara",
  );
});

test("basic evidence remains readable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/runs/fixture-animation/");
  await expect(page.getByText("Exact user instructions", { exact: true })).toBeVisible();
  await page.getByText("Original response", { exact: true }).click();
  await page.getByText("Extracted HTML", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Open preserved text" })).toHaveCount(2);
  await expect(page.locator("iframe")).toHaveCount(0);
  await context.close();
});

test("comparison starts through Run both and keeps per-panel restart after Stop", async ({
  page,
}) => {
  await page.goto("/compare/?left=fixture-animation&right=fixture-unknown");
  await expect(page.locator(".compare-panel")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Run preview", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Run both", exact: true }).click();
  const panel = page.locator(".compare-panel").first();
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(1);
  await panel.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(2);
});

test("tampered artifacts cannot be downloaded or reported as checksum-verified", async ({
  page,
}) => {
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await page.goto("/runs/fixture-animation/");
  await page.route("**/output.html.txt", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "Changed source" }),
  );
  await page.getByRole("button", { name: "Download HTML", exact: true }).click();
  await expect(page.locator("#artifact-status")).toContainText("Artifact checksum does not match");
  await page.getByText("Extracted HTML", { exact: true }).click();
  await expect(
    page.locator("[data-evidence-url$='output.html.txt'] .evidence-status"),
  ).toContainText("Artifact checksum does not match");
  expect(downloads).toEqual([]);
});

test("application shell passes automated WCAG 2.1 AA checks and has no script errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of [
    "/",
    "/runs/fixture-animation/",
    "/challenge/",
    "/compare/?left=fixture-animation&right=fixture-unknown",
  ]) {
    await page.goto(route);
    if (route.startsWith("/compare")) await expect(page.locator(".compare-panel")).toHaveCount(2);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("curator capture records a blank broken result without altering evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "capyboard-capture-"));
  try {
    await createFixtures(root);
    const evidence = await readFile(join(root, "runs/fixture-broken/output.html.txt"));
    const ledger = await readFile(join(root, "integrity.json"));
    const result = await promisify(execFile)(
      process.execPath,
      ["scripts/capture.ts", "--content", root, "--run", "fixture-broken", "--delay", "0"],
      { timeout: 15000 },
    );
    expect(result.stdout).toContain("Captured fixture-broken through restricted-html-v1");
    const png = await readFile(join(root, "thumbnails/fixture-broken.png"));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([640, 480]);
    const curation = JSON.parse(await readFile(join(root, "curation/fixture-broken.json"), "utf8"));
    expect(curation.thumbnail).toEqual({
      path: "thumbnails/fixture-broken.png",
      viewport: { width: 640, height: 480 },
      capture_delay_ms: 0,
      browser_version: expect.stringMatching(/^\d+\./),
      preview_policy_version: "restricted-html-v1",
    });
    expect(await readFile(join(root, "runs/fixture-broken/output.html.txt"))).toEqual(evidence);
    expect(await readFile(join(root, "integrity.json"))).toEqual(ledger);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("records browser version and captures the gallery", async ({ page, browser }, info) => {
  await page.goto("/");
  await page.screenshot({ path: info.outputPath("gallery.png"), fullPage: true });
  await writeFile(
    info.outputPath("browser-version.txt"),
    `${info.project.name} ${browser.version()}\n`,
  );
});
