import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function readUsage(file) {
  const totals = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, totalTokens: 0 };
  const missingFields = Object.fromEntries(Object.keys(totals).map((key) => [key, 0]));
  let assistantMessages = 0;
  let usageRecords = 0;
  let zeroUsageRecords = 0;
  let reasoning = 0;
  let reasoningRecords = 0;
  let cost = 0;
  let costRecords = 0;
  let settled = false;
  let aborted = null;
  let response = "";
  let compactions = 0;
  const additionalUsage = [];
  const malformedLines = [];
  const models = new Map();
  let lineNumber = 0;

  function consume(line) {
    lineNumber++;
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      malformedLines.push(lineNumber);
      return;
    }
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      malformedLines.push(lineNumber);
      return;
    }
    if (event.type === "agent_settled") {
      settled = true;
      aborted = event.aborted ?? null;
    }
    if (event.type === "compaction_start") compactions++;
    if (event.type === "compaction_end" && event.result?.usage) {
      additionalUsage.push({ kind: "compaction", usage: event.result.usage });
    }
    if (event.type !== "message_end") return;
    const message = event.message;
    if (message?.role === "toolResult" && message.usage) {
      additionalUsage.push({ kind: "tool", usage: message.usage });
    }
    if (message?.role !== "assistant") return;
    assistantMessages++;
    const model = {
      provider: message.provider ?? null,
      model: message.model ?? null,
      responseModel: message.responseModel ?? null,
      thinkingLevel: message.thinkingLevel ?? null,
      providerThinkingLevel: message.providerThinkingLevel ?? null,
    };
    models.set(JSON.stringify(model), model);
    const content = message.content;
    if (Array.isArray(content)) {
      const text = content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (text) response = text;
    } else if (typeof content === "string") response = content;
    const usage = message.usage;
    if (!usage) return;
    usageRecords++;
    for (const key of Object.keys(totals)) {
      if (Number.isFinite(usage[key]) && usage[key] >= 0) totals[key] += usage[key];
      else missingFields[key]++;
    }
    if (usage.totalTokens === 0) zeroUsageRecords++;
    if (Number.isFinite(usage.reasoning) && usage.reasoning >= 0) {
      reasoning += usage.reasoning;
      reasoningRecords++;
    }
    if (Number.isFinite(usage.cost?.total) && usage.cost.total >= 0) {
      cost += usage.cost.total;
      costRecords++;
    }
  }

  let buffer = "";
  const stream = createReadStream(file, { encoding: "utf8" });
  for await (const chunk of stream) {
    buffer += chunk;
    let boundary = buffer.indexOf("\n");
    while (boundary !== -1) {
      consume(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 1);
      boundary = buffer.indexOf("\n");
    }
  }
  if (buffer) consume(buffer);
  return {
    summary: {
      assistantMessages,
      usageRecords,
      missingUsageRecords: assistantMessages - usageRecords,
      zeroUsageRecords,
      reportedTokens: totals,
      missingTokenFields: missingFields,
      reportedReasoningTokens: reasoningRecords ? reasoning : null,
      reasoningAlreadyIncludedInOutput: true,
      piEstimatedCostUsd: costRecords ? cost : null,
      missingCostRecords: assistantMessages - costRecords,
      actualBilledCostUsd: null,
      observedModels: [...models.values()],
      agentSettled: settled,
      aborted,
      malformedEventLines: malformedLines,
      unexpectedCompactions: compactions,
      additionalUsage,
      notes: [
        "Totals contain completed assistant-message records only, including reported failed attempts.",
        "Streaming cumulative updates are not added to final message usage.",
        "Additional tool or compaction usage is listed separately, not silently discarded or added twice.",
        "Missing or zero usage does not establish zero consumption or zero cost.",
        "Reasoning is included in output. Cached fields and totalTokens retain Pi's reported semantics.",
        "Pi cost is an estimate, not a billing statement. Acceptance requires independent review.",
      ],
    },
    response,
  };
}

export async function summarize(run) {
  const { summary, response } = await readUsage(join(run, "artifacts/events.jsonl"));
  await writeFile(
    join(run, "artifacts/results/usage.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    join(run, "artifacts/results/final-response.txt"),
    response ? `${response}\n` : "",
    { mode: 0o600 },
  );
}
