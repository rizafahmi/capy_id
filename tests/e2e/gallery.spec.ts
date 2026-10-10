import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { buildSite } from "../../scripts/build.ts";
import { importRun, initializeContent, jsonBytes } from "../../scripts/content.ts";
import { animationHtml, fixtureMetadata } from "../../scripts/fixtures.ts";
import { curationSchema } from "../../scripts/schema.ts";
import { serveStatic } from "../../scripts/server.ts";

test("one attempt stays visible without unusable controls and links to complete evidence", async ({
  page,
}, info) => {
  const root = await mkdtemp(join(tmpdir(), "capyboard-single-gallery-"));
  const content = join(root, "content");
  try {
    await initializeContent(content);
    const run = await importRun({
      root: content,
      metadata: fixtureMetadata("fixture-animation"),
      response: Buffer.from(animationHtml),
    });
    const path = join(content, `curation/${run.id}.json`);
    const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
    await writeFile(
      path,
      jsonBytes({ ...curation, visible: true, published_at: "2026-10-09T00:00:00Z" }),
    );
    const out = join(root, "site");
    await buildSite({
      root: content,
      out,
      galleryOrigin: "http://127.0.0.1:4173",
      previewOrigin: "http://127.0.0.1:4174",
      development: true,
    });
    const server = await serveStatic(join(out, "gallery"), 0);
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Gallery server has no TCP address");
      const url = `http://127.0.0.1:${address.port}`;
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(url);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("[data-card]")).toHaveCount(1);
        await expect(page.locator(".filters, [data-select], .comparison-tray")).toHaveCount(0);
        const image = await page.locator(".card-image").boundingBox();
        expect((image?.y ?? 844) + 120).toBeLessThan(844);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const card = await page.locator(".card").boundingBox();
        const grid = await page.locator(".gallery-grid").boundingBox();
        expect(card?.width).toBe(grid?.width);
        await page.getByRole("link", { name: "Browse attempts" }).click();
        await expect(page.locator("#attempts")).toBeFocused();
        await page.screenshot({ path: info.outputPath(`single-${width}.png`), fullPage: true });
      }
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(audit.violations).toEqual([]);
      expect(errors).toEqual([]);
      await page.getByRole("link", { name: "Inspect attempt from animation", exact: true }).click();
      await expect(page).toHaveURL(/\/runs\/fixture-animation\//);
      await expect(page.locator(".token-breakdown")).toContainText("1,262");
      await expect(page.locator(".run-context")).toContainText("Development harness");
      await page.getByText("Run provenance", { exact: true }).click();
      await expect(page.locator(".run-provenance")).toContainText("2026-10-08T12:00:00Z");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
