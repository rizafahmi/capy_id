import { AxeBuilder } from "@axe-core/playwright";
import { type ConsoleMessage, expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`playful shell respects ${colorScheme} preference on every route`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const errors: string[] = [];
    const recordError = (message: ConsoleMessage) => {
      // WebKit emits this UA-stylesheet warning for a bare native <select>
      // under strict CSP, even without application scripts or inline styles.
      const nativeSelectWarning =
        info.project.name === "webkit" &&
        message.text() ===
          "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
      if (message.type() === "error" && !nativeSelectWarning) errors.push(message.text());
    };
    page.on("console", recordError);
    const routes = [
      "/",
      "/challenge/",
      "/runs/fixture-animation/",
      "/compare/?left=fixture-animation&right=fixture-unknown",
    ];
    for (const route of routes) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("html")).toHaveCSS("color-scheme", colorScheme);
      if (route.startsWith("/compare")) await expect(page.locator(".compare-panel")).toHaveCount(2);
    }
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const image = page.locator(".hero-visual img");
    await expect(image).toBeVisible();
    expect(
      await image.evaluate((node) => node instanceof HTMLImageElement && node.naturalWidth > 0),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        [...document.fonts].some(
          (face) => face.family.includes("Bricolage Grotesque") && face.status === "loaded",
        ),
      ),
    ).toBe(true);
    await expect(page.locator(".hero-copy")).toHaveCSS("animation-name", "none");
    expect(errors).toEqual([]);
    page.off("console", recordError);
    await page.screenshot({ path: info.outputPath(`gallery-${colorScheme}.png`), fullPage: true });
    for (const route of routes) {
      await page.goto(route);
      if (route.startsWith("/compare")) await expect(page.locator(".compare-panel")).toHaveCount(2);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
    }
  });
}

test("detail hierarchy foregrounds usage and keeps provenance accessible", async ({
  page,
}, info) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [360, 768, 1366]) {
      await page.setViewportSize({ width, height: 768 });
      await page.goto("/runs/fixture-animation/");
      await page.evaluate(() => document.fonts.ready);
      const total = page.locator(".run-highlights > div").first();
      await expect(total.locator("dt")).toHaveText("Total tokens");
      await expect(total.locator("dd")).toHaveText("3,726");
      await expect(page.locator(".run-context")).toContainText("other");
      await expect(page.locator(".token-breakdown")).toContainText("1,262");
      await expect(page.locator(".run-provenance")).not.toHaveAttribute("open", "");
      await expect(page.locator("#run-instructions")).not.toHaveAttribute("open", "");
      await expect(
        page.locator(".run-provenance dt").getByText("Generated", { exact: true }),
      ).not.toBeVisible();
      const totalBox = await total.boundingBox();
      expect(totalBox).not.toBeNull();
      expect((totalBox?.y ?? 768) + (totalBox?.height ?? 0)).toBeLessThan(768);
      const actionBox = await page
        .getByRole("button", { name: "Run preview", exact: true })
        .boundingBox();
      expect(actionBox).not.toBeNull();
      expect((actionBox?.y ?? 768) + (actionBox?.height ?? 0)).toBeLessThan(768);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await page.locator("iframe").count()).toBe(0);
      await page.screenshot({
        path: info.outputPath(`detail-${colorScheme}-${width}.png`),
        fullPage: true,
      });
      await page.getByText("Run provenance", { exact: true }).click();
      await expect(page.locator(".run-provenance")).toHaveAttribute("open", "");
      await expect(page.locator(".run-provenance")).toContainText("2026-10-08T12:00:00Z");
      const totalSize = await total
        .locator("dd")
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      const dateSize = await page
        .locator(".run-provenance dd")
        .first()
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      expect(totalSize).toBeGreaterThan(dateSize * 2);
    }
  }
  await page.setViewportSize({ width: 360, height: 768 });
  await page.goto("/runs/fixture-unknown/");
  await expect(page.locator(".run-highlights > div").first().locator("dd")).toHaveText("Unknown");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`gallery hierarchy and controls fit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const header = await page.locator(".site-header").boundingBox();
    expect(header?.height).toBeLessThanOrEqual(80);
    await expect(page.locator(".hero .button")).toHaveAttribute("href", "#attempts");
    const firstOutput = await page.locator(".card-image").first().boundingBox();
    expect(firstOutput).not.toBeNull();
    expect((firstOutput?.y ?? 844) + 120).toBeLessThan(844);
    await expect(
      page.getByRole("heading", { level: 3, name: "animation", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset", exact: true })).not.toBeVisible();
    const measurements = await page
      .locator(".card-measurements > div")
      .first()
      .evaluate((node) => {
        const label = node.querySelector("dt")?.getBoundingClientRect();
        const value = node.querySelector("dd")?.getBoundingClientRect();
        return { labelBottom: label?.bottom, valueTop: value?.top };
      });
    expect(measurements.valueTop).toBeGreaterThanOrEqual(measurements.labelBottom ?? Infinity);
    const cta = await page.locator(".hero .button").boundingBox();
    expect(cta).not.toBeNull();
    expect((cta?.y ?? 844) + (cta?.height ?? 0)).toBeLessThan(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width >= 1024) {
      const headline = await page.locator(".hero h1").boundingBox();
      const lineHeight = await page
        .locator(".hero h1")
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).lineHeight));
      expect(headline?.height).toBeLessThanOrEqual(lineHeight * 2 + 1);
    }
    if (width < 768) {
      const cards = await page
        .locator("[data-card]")
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().x));
      expect(new Set(cards).size).toBe(1);
    }
    await page.locator("[data-card='fixture-animation'] input").check();
    await page.locator("[data-card='fixture-unknown'] input").check();
    await expect(page.locator(".comparison-tray")).toBeVisible();
    await expect(page.locator("#compare-link")).toHaveAttribute("aria-disabled", "false");
    await page.getByRole("button", { name: "Remove animation from comparison" }).click();
    await expect(page.locator("[data-card='fixture-animation'] input")).not.toBeChecked();
    await page.screenshot({ path: info.outputPath(`gallery-${width}.png`), fullPage: true });
  });
}
