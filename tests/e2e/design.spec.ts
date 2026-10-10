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

test("detail keeps the preview action visible and defers provenance", async ({ page }, info) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [360, 768, 1366]) {
      await page.setViewportSize({ width, height: 768 });
      await page.goto("/runs/fixture-animation/");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator(".run-provenance")).not.toHaveAttribute("open", "");
      await expect(page.locator("#run-instructions")).not.toHaveAttribute("open", "");
      await expect(
        page.locator(".run-provenance dt").getByText("Generated", { exact: true }),
      ).not.toBeVisible();
      const action = await page
        .getByRole("button", { name: "Run preview", exact: true })
        .boundingBox();
      const stage = await page.locator(".preview-stage").boundingBox();
      expect(action).not.toBeNull();
      expect((action?.y ?? 768) + (action?.height ?? 0)).toBeLessThan(768);
      expect(action?.y).toBeLessThan(stage?.y ?? 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(page.locator("iframe")).toHaveCount(0);
      await page.getByText("Run provenance", { exact: true }).click();
      await expect(page.locator(".run-provenance")).toContainText("2026-10-08T12:00:00Z");
      await expect(page.locator(".run-provenance")).toContainText("fixture-animation");
      await page.screenshot({
        path: info.outputPath(`detail-${colorScheme}-${width}.png`),
        fullPage: true,
      });
    }
  }
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`gallery hierarchy and controls fit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const header = await page.locator(".site-header").boundingBox();
    expect(header?.height).toBeLessThanOrEqual(80);
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
