import { readFile } from "node:fs/promises";
import { AxeBuilder } from "@axe-core/playwright";
import { type ConsoleMessage, expect, test } from "@playwright/test";
import { animationHtml } from "../../scripts/fixtures.ts";

for (const colorScheme of ["light", "dark"] as const) {
  test(`code inspection wraps and highlights in ${colorScheme} mode`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const recordConsole = (message: ConsoleMessage) => {
      if (message.type() === "error") errors.push(message.text());
    };
    page.on("console", recordConsole);
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
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/highlights/")) requests.push(request.url());
    });
    await page.goto("/runs/fixture-animation/");
    expect(requests).toEqual([]);
    await page.getByText("Extracted HTML", { exact: true }).click();
    const viewer = page.locator("[data-evidence-url$='output.html.txt']");
    const pre = viewer.locator("pre");
    const code = pre.locator("code");
    await expect(viewer.locator(".evidence-status")).toContainText("SHA-256 verified");
    await expect(code.locator(".syntax-token").first()).toBeVisible();
    const formatted = await code.textContent();
    expect(formatted).not.toBe(animationHtml);
    expect(formatted).toMatch(/\n {2}<head>\n/);
    expect(formatted).toMatch(/body \{\n\s+margin: 0;/);
    const format = viewer.getByRole("button", { name: "Formatted", exact: true });
    await expect(format).toHaveAttribute("aria-pressed", "true");
    await format.click();
    expect(await code.textContent()).toBe(animationHtml);
    await expect(format).toHaveAttribute("aria-pressed", "false");
    await format.focus();
    await page.keyboard.press("Space");
    expect(await code.textContent()).toBe(formatted);
    await expect(format).toHaveAttribute("aria-pressed", "true");
    await expect(pre).toHaveCSS("white-space", "pre-wrap");
    expect(await pre.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const colors = await code
      .locator(".syntax-token")
      .evaluateAll((nodes) => [...new Set(nodes.map((node) => getComputedStyle(node).color))]);
    expect(colors.length).toBeGreaterThan(3);
    const wrap = viewer.getByRole("button", { name: "Wrap lines" });
    await expect(wrap).toHaveAttribute("aria-pressed", "true");
    await wrap.click();
    await expect(wrap).toHaveAttribute("aria-pressed", "false");
    await expect(pre).toHaveCSS("white-space", "pre");
    expect(await pre.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await wrap.focus();
    await page.keyboard.press("Space");
    await expect(pre).toHaveCSS("white-space", "pre-wrap");
    await viewer.getByRole("button", { name: "Copy original HTML" }).click();
    expect(await page.locator("html").getAttribute("data-copied")).toBe(animationHtml);
    await pre.focus();
    await page.keyboard.press("ArrowDown");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download HTML", exact: true }).click();
    expect(await readFile(await (await download).path())).toEqual(Buffer.from(animationHtml));
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
    ).toEqual([]);
    await viewer.scrollIntoViewIfNeeded();
    expect(errors).toEqual([]);
    // Playwright's screenshot stylesheet triggers a WebKit CSP warning, not an app error.
    page.off("console", recordConsole);
    await page.screenshot({ path: info.outputPath(`code-${colorScheme}-mobile.png`) });
    await page.setViewportSize({ width: 1366, height: 900 });
    await viewer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`code-${colorScheme}-desktop.png`) });
    expect(errors).toEqual([]);
  });
}

test("formatting failure still offers highlighted original source", async ({ page }) => {
  await page.route("**/highlights/*-html.json", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.formatted = null;
    await route.fulfill({ response, json: data });
  });
  await page.goto("/runs/fixture-animation/");
  await page.getByText("Extracted HTML", { exact: true }).click();
  const viewer = page.locator("[data-evidence-url$='output.html.txt']");
  await expect(viewer.locator(".syntax-token").first()).toBeVisible();
  expect(await viewer.locator("code").textContent()).toBe(animationHtml);
  await expect(viewer.getByRole("button", { name: "Formatted", exact: true })).not.toBeVisible();
  await expect(viewer.locator(".evidence-status")).toContainText("Formatting unavailable");
});

test("highlighting failure leaves verified source readable and copyable", async ({ page }) => {
  await page.route("**/highlights/**", (route) => route.abort());
  await page.goto("/runs/fixture-animation/");
  await page.getByText("Extracted HTML", { exact: true }).click();
  const viewer = page.locator("[data-evidence-url$='output.html.txt']");
  await expect(viewer.locator("code")).toHaveText(animationHtml);
  await expect(viewer.locator(".evidence-status")).toContainText("Syntax highlighting unavailable");
  await expect(viewer.locator("pre")).toHaveCSS("white-space", "pre-wrap");
  await expect(viewer.getByRole("button", { name: "Copy original HTML" })).toBeVisible();
});

for (const corruption of ["checksum", "range", "color"]) {
  test(`invalid highlight ${corruption} leaves the original intact`, async ({ page }) => {
    await page.route("**/highlights/*-html.json", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      if (corruption === "checksum") data.sha256 = "different artifact";
      else if (corruption === "range") data.tokens[0].offset = -1;
      else data.tokens[0].light = 'url("https://example.com/tracker")';
      await route.fulfill({ response, json: data });
    });
    await page.goto("/runs/fixture-animation/");
    await page.getByText("Extracted HTML", { exact: true }).click();
    const viewer = page.locator("[data-evidence-url$='output.html.txt']");
    await expect(viewer.locator(".evidence-status")).toContainText(
      "Syntax highlighting unavailable",
    );
    expect(await viewer.locator("code").textContent()).toBe(animationHtml);
    await expect(viewer.locator(".syntax-token")).toHaveCount(0);
  });
}

test("responses receive highlighting without running generated scripts", async ({
  page,
  request,
}) => {
  await page.goto("/runs/fixture-containment/");
  await page.getByText("Original response", { exact: true }).click();
  const viewer = page.locator("[data-evidence-url$='response.txt']");
  await expect(viewer.locator(".syntax-token").first()).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(viewer.locator("code script")).toHaveCount(0);
  expect(await viewer.locator("code").textContent()).toBe(
    await (await request.get("/evidence/runs/fixture-containment/response.txt")).text(),
  );
  expect(await page.locator("body").getAttribute("data-compromised")).toBeNull();
});
