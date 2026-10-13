import type { Run } from "./schema.ts";

export type MetadataPair = [label: string, value: string];
export type MeasurementRows = [
  time: MetadataPair,
  input: MetadataPair,
  cached: MetadataPair,
  output: MetadataPair,
  total: MetadataPair,
  cost: MetadataPair,
];

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 6,
});

export const runDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export const compareOptionDateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function measurementRows(run: Run): MeasurementRows {
  const metrics = run.generation.metrics;
  const time = metrics?.time;
  const count = (value: number | null | undefined) =>
    value == null ? "Unknown" : numberFormat.format(value);
  const timeLabel = (() => {
    if (!time) return "Time";
    if (time.kind === "model") return "Model time";
    return "Elapsed time";
  })();
  return [
    [timeLabel, time ? `${numberFormat.format(time.duration_ms / 1000)} s` : "Unknown"],
    ["Input tokens", count(metrics?.tokens.input)],
    ["Cached tokens", count(metrics?.tokens.cached)],
    ["Output tokens", count(metrics?.tokens.output)],
    ["Total tokens", count(metrics?.tokens.total)],
    ["Cost (USD)", metrics?.cost == null ? "Unknown" : currencyFormat.format(metrics.cost)],
  ];
}
