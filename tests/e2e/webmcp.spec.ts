import { expect, test } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "Requires Chromium WebMCP support");
test.use({ launchOptions: { args: ["--enable-features=WebMCP"] } });

test.describe("native WebMCP gallery tools", () => {
  test("registers the collapsed filter form and returns matching attempt links", async ({
    page,
  }, info) => {
    const errors: string[] = [];
    const schemaIssues: unknown[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const session = await page.context().newCDPSession(page);
    session.on("Audits.issueAdded", (event) => {
      if (event.issue.code === "GenericIssue") schemaIssues.push(event.issue);
    });
    await session.send("Audits.enable");
    await page.goto("/");
    expect(schemaIssues).toEqual([]);
    await expect(page.locator(".gallery-controls")).not.toHaveAttribute("open");
    const tools = await page.webmcp.tools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "filter_gallery",
      description: expect.stringContaining("Filter and sort"),
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: expect.stringContaining("case-insensitive") },
          provider: { enum: ["", "Development fixture"] },
          sort: { enum: ["newest", "name"] },
        },
      },
    });
    const result = await page.webmcp.callTool(
      "filter_gallery",
      { search: "  FIXTURE-ANIMATION  ", provider: "Development fixture", sort: "name" },
      { timeout: 5000 },
    );
    expect(result).toEqual({
      count: 1,
      total: 6,
      attempts: [
        {
          id: "fixture-animation",
          name: "animation",
          provider: "Development fixture",
          url: "http://127.0.0.1:4173/runs/fixture-animation/",
        },
      ],
    });
    await expect(page.locator(".gallery-controls")).toHaveAttribute("open");
    await expect(page.locator("[data-card]:visible")).toHaveCount(1);
    await expect(page.locator("#results-status")).toHaveText("1 of 6 attempts");
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(await page.webmcp.callTool("filter_gallery", {}, { timeout: 5000 })).toEqual(result);
    await page.screenshot({ path: info.outputPath("agent-filter.png"), fullPage: true });
    await page.getByRole("link", { name: "Inspect attempt from animation", exact: true }).click();
    await expect(page).toHaveURL("/runs/fixture-animation/");
    expect(errors).toEqual([]);
  });

  test("returns empty results and can clear filters and change sorting", async ({ page }) => {
    await page.goto("/");
    expect(
      await page.webmcp.callTool("filter_gallery", { search: "not a model" }, { timeout: 5000 }),
    ).toEqual({ count: 0, total: 6, attempts: [] });
    await expect(page.getByText("No matching attempts", { exact: true })).toBeVisible();
    const result = await page.webmcp.callTool(
      "filter_gallery",
      { search: "", provider: "", sort: "name" },
      { timeout: 5000 },
    );
    expect(result).toMatchObject({
      count: 6,
      total: 6,
      attempts: [
        { id: "fixture-animation" },
        { id: "fixture-broken" },
        { id: "fixture-containment" },
        { id: "fixture-disabled" },
        { id: "fixture-no-html" },
        { id: "fixture-unknown" },
      ],
    });
    await expect(page.locator("[data-card]:visible")).toHaveCount(6);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.locator("[data-card]").last()).toHaveAttribute(
      "data-card",
      "fixture-unknown",
    );
    await expect(page.locator("#results-status")).not.toBeVisible();
  });

  test("does not register an unusable tool without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/");
      expect(await page.webmcp.tools()).toEqual([]);
      await expect(page.locator("[data-card]:visible")).toHaveCount(6);
      await expect(page.locator(".gallery-controls")).not.toBeVisible();
      await page.getByRole("link", { name: "Inspect attempt from animation", exact: true }).click();
      await expect(page).toHaveURL(/\/runs\/fixture-animation\/$/);
    } finally {
      await context.close();
    }
  });
});
