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

test("gallery restores shareable model, harness, and effort filters and handles history", async ({
  page,
}) => {
  await page.goto(
    "/?model=fixture-animation&harness=Development%20harness&effort=low&sort=name#attempts",
  );
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toHaveValue(
    "fixture-animation",
  );
  await expect(page.getByRole("combobox", { name: "Coding harness", exact: true })).toHaveValue(
    "Development harness",
  );
  await expect(page.getByRole("combobox", { name: "Effort", exact: true })).toHaveValue("low");
  await expect(page.locator("[data-card]:visible")).toHaveCount(1);
  await expect(page.locator(".active-filters")).toContainText("Model: animation");
  await expect(page.locator(".active-filters")).toContainText("Harness: Development harness");
  await expect(page.locator(".active-filters")).toContainText("Effort: Low");
  await expect(page.locator("#results-status")).toHaveText("1 of 6 attempts");
  await page.getByRole("combobox", { name: "Effort", exact: true }).selectOption("unknown");
  await expect(page.getByText("No matching attempts", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(
    /model=fixture-animation&harness=Development\+harness&effort=unknown&sort=name#attempts$/,
  );
  await page.goBack();
  await expect(page.getByRole("combobox", { name: "Effort", exact: true })).toHaveValue("low");
  await expect(page.locator("[data-card]:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL("/#attempts");
  await expect(page.locator("[data-card]:visible")).toHaveCount(6);
  await expect(page.locator(".active-filters")).not.toBeVisible();
  await expect(page.locator("#results-status")).not.toBeVisible();
});

test("invalid URL filters are ignored and exact filters create shareable URLs", async ({
  page,
}) => {
  await page.goto(
    "/?campaign=launch&model=not-published&harness=not-installed&effort=bogus&mode=bogus&provider=bogus&sort=bogus&search=legacy",
  );
  await expect(page).toHaveURL("/?campaign=launch");
  await expect(page.locator("[data-card]:visible")).toHaveCount(6);
  await expect(page.locator('.filters [name="model"]')).toHaveValue("");
  await page.getByText("Filter and sort", { exact: true }).click();
  await page.getByLabel("Coding harness").selectOption("Development harness");
  await expect(page).toHaveURL("/?campaign=launch&harness=Development+harness");
  await page.reload();
  await expect(page.getByLabel("Coding harness")).toHaveValue("Development harness");
  await expect(page.locator("[data-card]:visible")).toHaveCount(6);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page).toHaveURL("/?campaign=launch");
});

test("model, harness, effort, and mode filters combine using published metadata", async ({
  page,
}) => {
  const root = await mkdtemp(join(tmpdir(), "capyboard-facets-"));
  const content = join(root, "content");
  try {
    await initializeContent(content);
    const prompt = await readFile(
      join(content, "challenges/capybara-hoverboard-v1/prompt.txt"),
      "utf8",
    );
    for (const [id, model, harness, effort, mode] of [
      ["fixture-a-low", "model-a", "Harness A", "low", "one-shot"],
      ["fixture-a-high", "model-a", "Harness B", "high", "tool-assisted"],
      ["fixture-b-unknown", "model-b", "Harness B", null, "tool-assisted"],
    ] as const) {
      const metadata = fixtureMetadata(id);
      const run = await importRun({
        root: content,
        metadata: {
          ...metadata,
          model: { ...metadata.model, display_name: model, identifier: model },
          generation: {
            ...metadata.generation,
            mode,
            tools_used: mode === "tool-assisted" ? "yes" : "no",
            harness: { ...metadata.generation.harness, name: harness, effort },
          },
        },
        response: Buffer.from("No HTML returned."),
        transcript: { schema_version: 1, turns: [{ role: "user", content: prompt }] },
      });
      const path = join(content, `curation/${run.id}.json`);
      const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
      await writeFile(
        path,
        jsonBytes({ ...curation, visible: true, published_at: "2026-10-10T00:00:00Z" }),
      );
    }
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
      if (!address || typeof address === "string") throw new Error("No gallery server address");
      await page.goto(
        `http://127.0.0.1:${address.port}/?model=model-a&harness=Harness%20B&effort=high&mode=tool-assisted`,
      );
      await expect(page.locator("[data-card]:visible")).toHaveCount(1);
      await expect(page.locator("[data-card='fixture-a-high']")).toBeVisible();
      await expect(page.locator(".active-filters")).toContainText("Harness: Harness B");
      await expect(page.locator(".active-filters")).toContainText("Mode: Tool-assisted");
      await expect(
        page.getByRole("combobox", { name: "Coding harness", exact: true }).locator("option"),
      ).toHaveCount(3);
      await page.getByRole("combobox", { name: "Effort", exact: true }).selectOption("unknown");
      await expect(page.getByText("No matching attempts", { exact: true })).toBeVisible();
      await page.getByRole("combobox", { name: "Model", exact: true }).selectOption("model-b");
      await expect(page.locator("[data-card='fixture-b-unknown']")).toBeVisible();
      await expect(page.locator("#results-status")).toHaveText("1 of 3 attempts");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gallery form submission applies filters without navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Filter and sort", { exact: true }).click();
  await page.locator(".filters").evaluate((form) => {
    if (!(form instanceof HTMLFormElement)) throw new Error("Expected the gallery form");
    const model = form.elements.namedItem("model");
    if (!(model instanceof HTMLSelectElement)) throw new Error("Expected the model select");
    model.value = "fixture-animation";
    form.requestSubmit();
  });
  await expect(page.locator("[data-card]:visible")).toHaveCount(1);
  await expect(page.locator("#results-status")).toHaveText("1 of 6 attempts");
  await expect(page).toHaveURL("/?model=fixture-animation");
});

test("gallery and comparison keep hostile-looking metadata as text and preserve values", async ({
  page,
}) => {
  const root = await mkdtemp(join(tmpdir(), "capyboard-gallery-escaping-"));
  const content = join(root, "content");
  const injected = '<img src=x onerror="document.documentElement.dataset.injected=1">';
  try {
    await initializeContent(content);
    for (const id of ["fixture-gallery-escaping", "fixture-other"]) {
      const metadata = fixtureMetadata(id);
      const run = await importRun({
        root: content,
        metadata:
          id === "fixture-gallery-escaping"
            ? {
                ...metadata,
                provider: injected,
                model: {
                  display_name: injected,
                  identifier: injected,
                  identifier_kind: "display-only",
                },
                generation: {
                  mode: "one-shot",
                  interface: "other",
                  tools_used: "no",
                  harness: { name: injected, version: "test", effort: null },
                },
              }
            : metadata,
        response: Buffer.from("No HTML returned."),
      });
      const path = join(content, `curation/${run.id}.json`);
      const curation = curationSchema.parse(JSON.parse(await readFile(path, "utf8")));
      await writeFile(
        path,
        jsonBytes({ ...curation, visible: true, published_at: "2026-10-10T00:00:00Z" }),
      );
    }
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
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const card = page.locator('[data-card="fixture-gallery-escaping"]');
      for (const attribute of ["data-provider", "data-name", "data-identifier", "data-harness"]) {
        await expect(card).toHaveAttribute(attribute, injected);
      }
      await expect(card.locator("h3")).toHaveText(injected);
      await expect(card.locator(".card-meta .eyebrow")).toHaveText(injected);
      await expect(page.locator("img")).toHaveCount(1);
      await expect(page.locator("html")).not.toHaveAttribute("data-injected");
      await page.getByText("Filter and sort", { exact: true }).click();
      await page
        .getByRole("combobox", { name: "Provider", exact: true })
        .selectOption({ label: injected });
      await expect(page.locator("[data-card]:visible")).toHaveCount(1);
      await expect(card).toBeVisible();
      await page
        .getByRole("combobox", { name: "Coding harness", exact: true })
        .selectOption({ label: injected });
      await expect(page.locator("[data-card]:visible")).toHaveCount(1);
      await expect(card).toBeVisible();
      await page.goto(
        `http://127.0.0.1:${address.port}/compare/?left=fixture-gallery-escaping&right=fixture-other`,
      );
      await expect(page.locator(".compare-panel")).toHaveCount(2);
      for (const side of ["Left", "Right"]) {
        const select = page.getByRole("combobox", { name: `${side} run`, exact: true });
        const option = select.locator('option[value="fixture-gallery-escaping"]');
        await expect(option).toContainText(injected);
        await expect(option).toContainText("unknown effort");
      }
      await expect(page.locator(".compare-panel h2").first()).toHaveText(injected);
      const stages = await page
        .locator(".compare-panel .preview-stage")
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
      expect(stages).toHaveLength(2);
      expect(stages[0]).toBe(stages[1]);
      await page.locator("#compare-provenance summary").click();
      const provenance = page.getByRole("table", { name: "Generation details and provenance" });
      for (const label of ["Provider", "Model identifier", "Harness"]) {
        const row = provenance.getByRole("row").filter({
          has: page.getByRole("rowheader", { name: label, exact: true }),
        });
        await expect(row.getByRole("cell").first()).toHaveText(injected);
        await expect(row).toHaveClass("comparison-difference");
      }
      await expect(page.locator("img, iframe")).toHaveCount(0);
      await expect(page.locator("html")).not.toHaveAttribute("data-injected");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
