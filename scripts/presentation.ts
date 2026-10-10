import type { Run } from "./schema.ts";

export type MetadataPair = [label: string, value: string];
export type MeasurementRows = [
  time: MetadataPair,
  input: MetadataPair,
  cached: MetadataPair,
  output: MetadataPair,
  total: MetadataPair,
];

export function measurementRows(run: Run): MeasurementRows {
  const metrics = run.generation.metrics;
  const time = metrics?.time;
  const numbers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
  const count = (value: number | null | undefined) =>
    value == null ? "Unknown" : numbers.format(value);
  return [
    [
      time ? (time.kind === "model" ? "Model time" : "Elapsed time") : "Time",
      time ? `${numbers.format(time.duration_ms / 1000)} s` : "Unknown",
    ],
    ["Input tokens", count(metrics?.tokens.input)],
    ["Cached tokens", count(metrics?.tokens.cached)],
    ["Output tokens", count(metrics?.tokens.output)],
    ["Total tokens", count(metrics?.tokens.total)],
  ];
}
