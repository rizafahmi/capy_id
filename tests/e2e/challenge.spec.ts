import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const promptPath = "content/challenges/capybara-hoverboard-v1/prompt.txt";
const evidenceUrl = "/evidence/challenges/capybara-hoverboard-v1/prompt.txt";

test("challenge prompt, protocol, and limitations remain readable across viewports", async ({
  page,
  request,
}, info) => {
  const prompt = await readFile(promptPath, "utf8");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [360, 768, 1366]) {
      await page.setViewportSize({ width, height: 768 });
      await page.goto("/challenge/");
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveTitle("The challenge · Capyboard");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("The challenge");
      expect(await page.locator("#capybara-hoverboard-v1 code").textContent()).toBe(prompt);
      await expect(page.locator("nav [aria-current='page']")).toHaveText("The challenge ↗");
      await expect(page.locator(".prose p").first()).toHaveText(
        "Simon Willison's pelican-riding-a-bicycle experiments inspired this challenge. Our version asks models to animate a capybara on a hoverboard in a single HTML file.",
      );
      await expect(page.locator(".prose ol > li")).toHaveCount(6);
      await expect(page.locator(".prose ul > li")).toHaveCount(5);
      await expect(
        page.getByRole("heading", { name: "Preview policy restricted-html-v1" }),
      ).toBeVisible();
      await expect(page.locator("iframe")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`challenge-${colorScheme}-${width}.png`),
        fullPage: true,
      });
    }
  }
  const response = await request.get(evidenceUrl);
  expect(response.ok()).toBe(true);
  expect(await response.body()).toEqual(Buffer.from(prompt));
  expect(errors).toEqual([]);
});

test("challenge instructions work without JavaScript and copy exact text with a fallback", async ({
  page,
  browser,
}) => {
  const prompt = await readFile(promptPath, "utf8");
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const staticPage = await context.newPage();
    await staticPage.goto("http://127.0.0.1:4173/challenge/");
    expect(await staticPage.locator("#capybara-hoverboard-v1 code").textContent()).toBe(prompt);
    await expect(staticPage.getByRole("button", { name: "Copy prompt" })).toBeHidden();
    await staticPage.locator("pre").focus();
    await expect(staticPage.locator("pre")).toBeFocused();
    await staticPage.getByRole("link", { name: "Interpretation and limitations" }).click();
    await expect(staticPage).toHaveURL(/\/challenge\/#limits$/);
    await expect(
      staticPage.getByRole("heading", { name: "What this gallery cannot tell you" }),
    ).toBeInViewport();
    await staticPage.getByRole("link", { name: "Gallery", exact: true }).click();
    await expect(staticPage.locator("[data-card]")).toHaveCount(6);
  } finally {
    await context.close();
  }
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
  await page.goto("/challenge/");
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  await expect(page.locator("#artifact-status")).toContainText("Copied preserved text");
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
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  await expect(page.locator("#artifact-status")).toContainText("Clipboard unavailable");
  const fallback = page.getByRole("textbox", { name: "Preserved text for manual copying" });
  await expect(fallback).toHaveValue(prompt);
  await expect(fallback).toBeFocused();
  expect(
    await fallback.evaluate(
      (node) =>
        node instanceof HTMLTextAreaElement &&
        node.selectionStart === 0 &&
        node.selectionEnd === node.value.length,
    ),
  ).toBe(true);
});
