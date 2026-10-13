import assert from "node:assert/strict";
import test from "node:test";
import { fixtureMetadata } from "../scripts/fixtures.ts";
import { metadataSchema } from "../scripts/schema.ts";

function parseMetrics(metrics: unknown) {
  const metadata = fixtureMetadata("fixture-metrics");
  return metadataSchema.parse({
    ...metadata,
    generation: { ...metadata.generation, metrics },
  }).generation;
}

test("imports preserve recorded timing and token counts without recomputing totals", () => {
  const metrics = {
    time: { kind: "model", duration_ms: 17222 },
    tokens: { input: 1262, cached: 100, output: 2464, total: 3926 },
  };
  assert.deepEqual(parseMetrics(metrics).metrics, metrics);
});

test("metrics preserve optional dashboard cost values", () => {
  const metrics = {
    time: { kind: "model", duration_ms: 17222 },
    tokens: { input: 1262, cached: 100, output: 2464, total: 3926 },
    cost: 0.42,
  };
  assert.deepEqual(parseMetrics(metrics).metrics, metrics);
  assert.equal(parseMetrics({ ...metrics, cost: null }).metrics?.cost, null);
  assert.equal(parseMetrics({ ...metrics, cost: undefined }).metrics?.cost, undefined);
});

test("measurements distinguish missing data, measured zero, and elapsed time", () => {
  for (const metrics of [
    { time: null, tokens: { input: null, cached: null, output: null, total: null } },
    {
      time: { kind: "elapsed", duration_ms: 0 },
      tokens: { input: 0, cached: 0, output: 0, total: 0 },
    },
  ])
    assert.deepEqual(parseMetrics(metrics).metrics, metrics);
  const metadata = fixtureMetadata("fixture-legacy");
  const generation = { mode: "one-shot", interface: "other", tools_used: "no" };
  assert.equal(metadataSchema.parse({ ...metadata, generation }).generation.metrics, undefined);
});

test("imports reject invalid time kinds and negative, fractional, or unsafe measurements", () => {
  const metrics = {
    time: { kind: "model", duration_ms: 17222 },
    tokens: { input: 1262, cached: 0, output: 2464, total: 3726 },
  };
  assert.throws(() => parseMetrics({ ...metrics, time: { kind: "estimated", duration_ms: 1 } }));
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY]) {
    assert.throws(() => parseMetrics({ ...metrics, time: { kind: "model", duration_ms: value } }));
    for (const key of ["input", "cached", "output", "total"])
      assert.throws(() =>
        parseMetrics({ ...metrics, tokens: { ...metrics.tokens, [key]: value } }),
      );
  }
  for (const value of [-1, Number.POSITIVE_INFINITY])
    assert.throws(() => parseMetrics({ ...metrics, cost: value }));
});
