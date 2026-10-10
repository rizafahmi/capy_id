import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const runId = slug.brand<"RunId">();
export const challengeId = slug.brand<"ChallengeId">();
export const contentPath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.includes("\0") &&
      value.split("/").every((part) => part !== ".." && part !== "." && part !== ""),
    "Path must be relative and stay inside content",
  );
export const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const timestamp = z.iso.datetime({ offset: true });
const optionalTime = timestamp.nullable();
const artifact = z.strictObject({
  path: contentPath,
  sha256: hash,
  size_bytes: z.number().int().nonnegative(),
});
const settings = z.strictObject({
  temperature: z.number().finite().nullable(),
  top_p: z.number().finite().nullable(),
  max_output_tokens: z.number().int().positive().nullable(),
  seed: z.number().int().nullable(),
});
export const challengeSchema = z.strictObject({
  schema_version: z.literal(1),
  id: challengeId,
  title: z.string().min(1),
  prompt_path: contentPath,
  prompt_sha256: hash,
});
const runObject = z.strictObject({
  schema_version: z.literal(1),
  id: runId,
  challenge_id: challengeId,
  series_id: slug,
  attempt_number: z.number().int().positive(),
  provider: z.string().min(1),
  model: z.strictObject({
    display_name: z.string().min(1),
    identifier: z.string().min(1),
    identifier_kind: z.enum(["snapshot", "alias", "display-only", "unknown"]),
  }),
  generated_at: optionalTime,
  generation: z.strictObject({
    mode: z.enum(["one-shot", "revised", "tool-assisted", "unknown"]),
    interface: z.enum(["api", "web-chat", "coding-agent", "other", "unknown"]),
    tools_used: z.enum(["yes", "no", "unknown"]),
    harness: z
      .strictObject({
        name: z.string().min(1),
        version: z.string().min(1).nullable(),
        effort: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]).nullable(),
      })
      .optional(),
    metrics: z
      .strictObject({
        time: z
          .strictObject({
            kind: z.enum(["model", "elapsed"]),
            duration_ms: z.number().int().nonnegative(),
          })
          .nullable(),
        tokens: z.strictObject({
          input: z.number().int().nonnegative().nullable(),
          cached: z.number().int().nonnegative().nullable(),
          output: z.number().int().nonnegative().nullable(),
          total: z.number().int().nonnegative().nullable(),
        }),
      })
      .optional(),
    settings: settings.optional(),
    system_instruction_known: z.boolean().optional(),
  }),
  instructions: z.strictObject({
    prompt_path: contentPath,
    prompt_sha256: hash,
    transcript_path: contentPath,
  }),
  artifacts: z.strictObject({
    response: artifact,
    html: artifact
      .extend({
        extraction: z.strictObject({
          start_byte: z.number().int().nonnegative(),
          end_byte_exclusive: z.number().int().nonnegative(),
        }),
      })
      .nullable(),
  }),
  supersedes_run_id: runId.optional(),
  correction_reason: z.string().min(1).optional(),
});
export const runSchema = runObject.superRefine((run, ctx) => {
  if (Boolean(run.supersedes_run_id) !== Boolean(run.correction_reason))
    ctx.addIssue({
      code: "custom",
      message: "A replacement record requires supersedes_run_id and correction_reason",
    });
});
export const metadataSchema = runObject
  .pick({
    schema_version: true,
    id: true,
    challenge_id: true,
    series_id: true,
    attempt_number: true,
    provider: true,
    model: true,
    generated_at: true,
    generation: true,
    supersedes_run_id: true,
    correction_reason: true,
  })
  .partial({ id: true, series_id: true, attempt_number: true })
  .extend({
    generation: runObject.shape.generation
      .omit({ settings: true, system_instruction_known: true })
      .strip(),
  })
  .strip();
export const transcriptSchema = z.strictObject({
  schema_version: z.literal(1),
  turns: z
    .array(z.strictObject({ role: z.enum(["user", "system", "assistant"]), content: z.string() }))
    .min(1),
});
export const curationSchema = z
  .strictObject({
    schema_version: z.literal(1),
    run_id: runId,
    published_at: optionalTime,
    visible: z.boolean(),
    preview_allowed: z.boolean(),
    preview_disabled_reason: z.string().min(1).nullable(),
    observations: z.array(z.string()),
    series_publication_complete: z.boolean(),
    series_incomplete_reason: z.string().min(1).nullable(),
    thumbnail: z
      .strictObject({
        path: contentPath,
        viewport: z
          .strictObject({ width: z.number().int().positive(), height: z.number().int().positive() })
          .nullable(),
        capture_delay_ms: z.number().nonnegative().nullable(),
        browser_version: z.string().min(1).nullable(),
        preview_policy_version: z.string().min(1).nullable(),
      })
      .nullable(),
  })
  .superRefine((record, ctx) => {
    if (record.visible && !record.published_at)
      ctx.addIssue({ code: "custom", message: "Visible runs require a publication timestamp" });
    if (!record.preview_allowed && !record.preview_disabled_reason)
      ctx.addIssue({ code: "custom", message: "Disabled previews require a reason" });
    if (record.preview_allowed && record.preview_disabled_reason !== null)
      ctx.addIssue({ code: "custom", message: "Allowed previews cannot have a disabled reason" });
  });
export const ledgerSchema = z.strictObject({
  schema_version: z.literal(1),
  files: z.record(
    contentPath,
    z.strictObject({ sha256: hash, size_bytes: z.number().int().nonnegative() }),
  ),
});
export type Run = z.infer<typeof runSchema>;
export type Curation = z.infer<typeof curationSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export type Ledger = z.infer<typeof ledgerSchema>;
export type Entry = { run: Run; curation: Curation; transcript: Transcript };
export type Collection = {
  root: string;
  challenges: Map<string, Challenge>;
  prompts: Map<string, string>;
  runs: Entry[];
};
export type Preview = { kind: "ready"; url: string } | { kind: "unavailable"; reason: string };
export const schemas = {
  run: runSchema,
  curation: curationSchema,
  challenge: challengeSchema,
  transcript: transcriptSchema,
  integrity: ledgerSchema,
  metadata: metadataSchema,
};
