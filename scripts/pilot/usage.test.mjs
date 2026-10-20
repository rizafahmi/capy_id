import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readUsage } from "./usage.mjs";

async function fixture(t, records) {
  const directory = await mkdtemp(join(tmpdir(), "capy-usage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "events.jsonl");
  await writeFile(file, records.join("\n"));
  return file;
}

const usage = {
  input: 10,
  cacheRead: 30,
  cacheWrite: 4,
  output: 6,
  reasoning: 3,
  totalTokens: 50,
  cost: { total: 0.25 },
};

function message(value = usage, text = "done") {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      provider: "fixture",
      model: "fixture-model",
      usage: value,
      content: [{ type: "text", text }],
    },
  });
}

test("only final messages count, including failures, without adding reasoning twice", async (t) => {
  const file = await fixture(t, [
    JSON.stringify({ type: "message_update", usage }),
    message(),
    JSON.stringify({ type: "turn_end", message: { role: "assistant", usage } }),
    JSON.stringify({
      type: "message_end",
      message: { role: "assistant", stopReason: "error", usage },
    }),
    JSON.stringify({ type: "agent_end", messages: [{ role: "assistant", usage }] }),
    JSON.stringify({ type: "agent_settled", aborted: false }),
  ]);
  const { summary } = await readUsage(file);
  assert.deepEqual(summary.reportedTokens, {
    input: 20,
    cacheRead: 60,
    cacheWrite: 8,
    output: 12,
    totalTokens: 100,
  });
  assert.equal(summary.reportedReasoningTokens, 6);
  assert.equal(summary.piEstimatedCostUsd, 0.5);
  assert.equal(summary.actualBilledCostUsd, null);
  assert.equal(summary.agentSettled, true);
});

test("missing usage, missing cost, zero usage and truncated records remain explicit", async (t) => {
  const file = await fixture(t, [
    message(null),
    message({ input: 5 }),
    message({ input: 0, output: 0, totalTokens: 0 }),
    '{"type":"message_end"',
  ]);
  const { summary } = await readUsage(file);
  assert.equal(summary.missingUsageRecords, 1);
  assert.equal(summary.zeroUsageRecords, 1);
  assert.equal(summary.missingTokenFields.cacheRead, 2);
  assert.equal(summary.piEstimatedCostUsd, null);
  assert.deepEqual(summary.malformedEventLines, [4]);
  assert.equal(summary.agentSettled, false);
});

test("literal Unicode separators do not split JSON records", async (t) => {
  const file = await fixture(t, [message(usage, "first\u2028second\u2029third")]);
  const { summary, response } = await readUsage(file);
  assert.equal(summary.assistantMessages, 1);
  assert.equal(response, "first\u2028second\u2029third");
});

test("unexpected compaction and nested model usage are preserved separately", async (t) => {
  const file = await fixture(t, [
    message(),
    JSON.stringify({ type: "compaction_start" }),
    JSON.stringify({ type: "compaction_end", result: { usage } }),
    JSON.stringify({ type: "message_end", message: { role: "toolResult", usage } }),
  ]);
  const { summary } = await readUsage(file);
  assert.equal(summary.reportedTokens.totalTokens, 50);
  assert.equal(summary.additionalUsage.length, 2);
  assert.equal(summary.unexpectedCompactions, 1);
});

test("non-object JSON records are reported instead of crashing", async (t) => {
  const file = await fixture(t, ["null", "4", "[]", message()]);
  const { summary } = await readUsage(file);
  assert.deepEqual(summary.malformedEventLines, [1, 2, 3]);
  assert.equal(summary.assistantMessages, 1);
});
