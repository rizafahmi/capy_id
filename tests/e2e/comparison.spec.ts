import { expect, test } from "@playwright/test";

test("comparison restores shared choices and keeps preview state through history", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [360, 768, 1366]) {
      await page.setViewportSize({ width, height: 768 });
      await page.goto("/compare/?left=fixture-animation&right=fixture-unknown");
      await page.reload();
      await expect(page).toHaveTitle("Compare · Capyboard");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compare outputs");
      await expect(page.locator(".compare-panel")).toHaveCount(2);
      await expect(page.getByRole("combobox", { name: "Left run", exact: true })).toHaveValue(
        "fixture-animation",
      );
      await expect(page.getByRole("combobox", { name: "Right run", exact: true })).toHaveValue(
        "fixture-unknown",
      );
      await expect(page.locator(".compare-panel h2")).toHaveText(["animation", "unknown"]);
      await expect(page.locator("#compare-status")).toHaveText(
        "Two attempts selected. Previews do not start automatically.",
      );
      await expect(page.locator("#condition-notices")).toContainText(
        "Generation conditions differ or are incomplete.",
      );
      await expect(page.getByRole("button", { name: "Run both", exact: true })).toBeEnabled();
      await expect(page.locator("iframe")).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`comparison-${colorScheme}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.getByRole("button", { name: "Run both", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Right run", exact: true })
    .selectOption("fixture-no-html");
  await expect(page).toHaveURL(/left=fixture-animation&right=fixture-no-html$/);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator(".compare-panel").last()).toContainText("No runnable HTML returned");
  await page.goBack();
  await expect(page.getByRole("combobox", { name: "Right run", exact: true })).toHaveValue(
    "fixture-unknown",
  );
  await expect(page.locator(".compare-panel h2")).toHaveText(["animation", "unknown"]);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole("combobox", { name: "Right run", exact: true })).toHaveValue(
    "fixture-no-html",
  );
  await expect(page.locator(".compare-panel").last()).toContainText("No runnable HTML returned");
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("comparison has labeled required selectors and a native GET fallback without JavaScript", async ({
  browser,
}, info) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const width of [360, 768, 1366]) {
        await page.setViewportSize({ width, height: 768 });
        await page.goto("http://127.0.0.1:4173/compare/");
        await expect(page.locator("#compare-form")).toHaveAttribute("method", "get");
        await expect(page.locator("#compare-form")).toHaveAttribute("action", "/compare/");
        for (const side of ["Left", "Right"]) {
          const select = page.getByRole("combobox", { name: `${side} run`, exact: true });
          await expect(select).toBeVisible();
          await expect(select).toHaveAttribute("required", "");
          await expect(select.getByRole("option")).toHaveCount(7);
          await expect(select).toHaveValue("");
        }
        await expect(
          page.getByText(
            "Comparison controls and previews require JavaScript. Open the individual run pages to inspect their evidence.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(page.locator("#compare-status")).toHaveText("Choose two distinct runs.");
        await expect(page.getByRole("button", { name: "Run both", exact: true })).toBeHidden();
        await expect(page.locator("iframe")).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (info.project.name === "chromium")
          await page.screenshot({
            path: info.outputPath(`comparison-no-js-${colorScheme}-${width}.png`),
            fullPage: true,
          });
      }
    }
    await page
      .getByRole("combobox", { name: "Left run", exact: true })
      .selectOption("fixture-animation");
    await page
      .getByRole("combobox", { name: "Right run", exact: true })
      .selectOption("fixture-unknown");
    const navigation = page.waitForRequest(
      (request) => request.isNavigationRequest() && request.url().includes("/compare/?"),
    );
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    expect((await navigation).method()).toBe("GET");
    await expect(page).toHaveURL(
      "http://127.0.0.1:4173/compare/?left=fixture-animation&right=fixture-unknown",
    );
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByRole("link", { name: "← All attempts", exact: true }).click();
    await expect(page.locator("[data-card]")).toHaveCount(6);
  } finally {
    await context.close();
  }
});
