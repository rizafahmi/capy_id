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

test("comparison prioritizes aligned outputs before metrics and expandable provenance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/compare/?left=fixture-animation&right=fixture-unknown");
  await expect(page.locator(".compare-panel")).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  const stages = await page.locator(".compare-panel .preview-stage").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, width: rect.width, height: rect.height };
    }),
  );
  expect(stages).toHaveLength(2);
  const [leftStage, rightStage] = stages;
  if (!leftStage || !rightStage) throw new Error("Both output stages must be present.");
  expect(leftStage.top).toBeLessThan(520);
  expect(leftStage.top).toBe(rightStage.top);
  expect(leftStage.width).toBe(rightStage.width);
  expect(leftStage.height).toBe(rightStage.height);
  await expect(page.locator(".compare-panel").first()).toContainText("Left attempt");
  await expect(page.locator(".compare-panel").last()).toContainText("Right attempt");
  await expect(page.locator(".compare-panel").first()).toContainText("Low effort");
  await expect(page.locator(".compare-panel").last()).toContainText("Effort unknown");
  const metrics = page.getByRole("table", { name: "Recorded metrics" });
  await expect(metrics).toBeVisible();
  await expect(metrics.getByRole("columnheader")).toHaveText([
    "Measurement",
    "Left attempt",
    "Right attempt",
  ]);
  await expect(metrics.getByRole("rowheader")).toHaveText([
    "Effort",
    "Model time",
    "Time",
    "Input tokens",
    "Cached tokens",
    "Output tokens",
    "Total tokens",
    "Cost (USD)",
  ]);
  await expect(
    metrics.getByRole("row", { name: "Model time 17.222 s Not recorded", exact: true }),
  ).toBeVisible();
  await expect(
    metrics.getByRole("row", { name: "Time Not recorded Unknown", exact: true }),
  ).toBeVisible();
  await expect(metrics.locator(".comparison-difference")).toHaveCount(0);
  const metricsTop = await metrics.evaluate((node) => node.getBoundingClientRect().top);
  expect(metricsTop).toBeGreaterThan(leftStage.top + leftStage.height);
  const provenance = page.locator("#compare-provenance");
  await expect(provenance).not.toHaveAttribute("open", "");
  await expect(provenance.getByRole("table")).toBeHidden();
  const summary = provenance.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(
    provenance.getByRole("table", { name: "Generation details and provenance" }),
  ).toBeVisible();
  await expect(provenance).toContainText("fixture-animation");
  await expect(provenance).toContainText("fixture-unknown");
  await page
    .getByRole("combobox", { name: "Right run", exact: true })
    .selectOption("fixture-animation");
  await expect(page.locator("#compare-results")).toBeHidden();
  await expect(page.locator(".compare-panel")).toHaveCount(0);
});

test("comparison exposes harness settings and refreshes missing metadata with the selected runs", async ({
  page,
}) => {
  await page.route("**/assets/runs.json", async (route) => {
    const response = await route.fetch();
    const entries = await response.json();
    for (const entry of entries) {
      if (entry.run.id === "fixture-broken") {
        entry.run.generation.harness = {
          name: "Alternate harness",
          version: "2.0",
          effort: "high",
        };
        entry.run.generation.mode = "tool-assisted";
        entry.run.generation.interface = "coding-agent";
        entry.run.generation.tools_used = "yes";
      }
      if (entry.run.id === "fixture-unknown") delete entry.run.generation.harness;
      if (entry.run.id === "fixture-no-html") entry.run.generation.harness.version = null;
    }
    await route.fulfill({ response, json: entries });
  });
  await page.goto("/compare/?left=fixture-animation&right=fixture-broken");
  const settings = page.getByRole("table", {
    name: "Harness and generation settings",
    exact: true,
  });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("columnheader")).toHaveText([
    "Setting",
    "Left attempt",
    "Right attempt",
  ]);
  await expect(settings.getByRole("row")).toHaveText([
    "SettingLeft attemptRight attempt",
    "HarnessDevelopment harnessAlternate harness",
    "Harness versiontest2.0",
    "Effortlowhigh",
    "Generation modeone-shottool-assisted",
    "Interfaceothercoding-agent",
    "Tools usednoyes",
  ]);
  await expect(settings.locator(".comparison-difference")).toHaveCount(6);
  await expect(page.locator(".compare-panel").first().locator(".compare-harness")).toHaveText(
    "Development harness · test",
  );
  await expect(page.locator(".compare-panel").last().locator(".compare-harness")).toHaveText(
    "Alternate harness · 2.0",
  );
  await expect(page.locator('#compare-form option[value="fixture-animation"]')).toHaveText([
    /animation · Development harness · low effort/,
    /animation · Development harness · low effort/,
  ]);
  await expect(page.locator("#compare-provenance")).not.toHaveAttribute("open", "");
  await page
    .getByRole("combobox", { name: "Right run", exact: true })
    .selectOption("fixture-unknown");
  await expect(
    settings.getByRole("row", { name: "Harness Development harness Unknown", exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByRole("row", { name: "Harness version test Unknown", exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByRole("row", { name: "Effort low Unknown", exact: true }),
  ).toBeVisible();
  await expect(settings.locator(".comparison-difference")).toHaveCount(0);
  await expect(page.locator(".compare-panel").last().locator(".compare-harness")).toHaveText(
    "Harness unknown · Version unknown",
  );
  await page.goBack();
  await expect(
    settings.getByRole("row", {
      name: "Harness Development harness Alternate harness",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Right run", exact: true })
    .selectOption("fixture-no-html");
  await expect(
    settings.getByRole("row", { name: "Harness version test Unknown", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".compare-panel").last().locator(".compare-harness")).toHaveText(
    "Development harness · Version unknown",
  );
  await page
    .getByRole("combobox", { name: "Right run", exact: true })
    .selectOption("fixture-animation");
  await expect(settings).toHaveCount(0);
});

test("comparison has labeled required selectors and a native GET fallback without JavaScript", async ({
  browser,
  baseURL,
}, info) => {
  if (!baseURL) throw new Error("Comparison tests require a configured base URL.");
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const width of [360, 768, 1366]) {
        await page.setViewportSize({ width, height: 768 });
        await page.goto("/compare/");
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
      `${baseURL}/compare/?left=fixture-animation&right=fixture-unknown`,
    );
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByRole("link", { name: "← All attempts", exact: true }).click();
    await expect(page.locator("[data-card]")).toHaveCount(6);
  } finally {
    await context.close();
  }
});
