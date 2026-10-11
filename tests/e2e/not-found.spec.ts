import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("unknown gallery routes return accessible 404s and recover without JavaScript", async ({
  browser,
}, info) => {
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        for (const width of [360, 768, 1366]) {
          await page.setViewportSize({ width, height: 768 });
          const response = await page.goto("http://127.0.0.1:4173/runs/not-a-run/");
          expect(response?.status()).toBe(404);
          expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
          expect(response?.headers()["content-security-policy"]).toContain("script-src 'self'");
          await expect(page).toHaveTitle("Run not found · Capyboard");
          await expect(page.getByRole("heading", { level: 1 })).toHaveText("Run not found");
          await expect(page.locator(".empty-state p")).toHaveText(
            "This run is unknown or is no longer published. Its original evidence may remain in the curator's repository.",
          );
          await expect(page.getByRole("note")).toContainText("Development fixtures");
          await expect(page.locator("body")).toHaveAttribute("data-page", "not-found");
          await expect(page.locator("nav [aria-current]")).toHaveCount(0);
          await expect(
            page.getByRole("link", { name: "Return to the gallery", exact: true }),
          ).toHaveAttribute("href", "/");
          await expect(page.locator("iframe")).toHaveCount(0);
          await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          if (javaScriptEnabled || info.project.name === "chromium")
            await page.screenshot({
              path: info.outputPath(
                `not-found-${javaScriptEnabled ? "js" : "no-js"}-${colorScheme}-${width}.png`,
              ),
              fullPage: true,
            });
        }
      }
      if (javaScriptEnabled) {
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(audit.violations).toEqual([]);
      }
      const response = await page.goto("http://127.0.0.1:4173/does-not-exist/");
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Run not found");
      const recovery = page.getByRole("link", { name: "Return to the gallery", exact: true });
      await recovery.focus();
      await expect(recovery).toBeFocused();
      await recovery.press("Enter");
      await expect(page).toHaveURL("http://127.0.0.1:4173/");
      await expect(page.locator("[data-card]")).toHaveCount(6);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test("missing preview routes retain their isolated plain fallback and response policy", async ({
  request,
}) => {
  const response = await request.get("http://127.0.0.1:4174/runs/not-a-preview/");
  expect(response.status()).toBe(404);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  const policy = response.headers()["content-security-policy"];
  expect(policy).toContain("sandbox allow-scripts");
  expect(policy).toContain("connect-src 'none'");
  expect(policy).toContain("font-src 'none'");
  expect(policy).toContain("frame-src 'none'");
  expect(await response.text()).toBe(
    '<!doctype html><html lang="en"><title>Preview unavailable</title><body><h1>Preview unavailable</h1><p>Return to the gallery to inspect the preserved evidence.</p></body></html>',
  );
});
