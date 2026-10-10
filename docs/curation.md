# Curate an attempt

## Collect evidence

Start a fresh conversation. Send `content/challenges/capybara-hoverboard-v1/prompt.txt` exactly once for a canonical one-shot attempt. Save the full response as UTF-8 without repairing it. Preserve failures too.

Copy `examples/import-metadata.json` to a local metadata file. Its identity is illustrative, not a real submission. Replace it with observed provider, model, interface, time, settings, and tool information. Record unknown settings and dates as `null`. Do not invent a snapshot identifier or hidden system prompt.

An attempt is the data unit. Different generations get different run IDs, even when their HTML matches. IDs must contain lowercase letters, digits, and hyphens. Omitting `id` and `series_id` creates fresh UUID-based identifiers; omitting `attempt_number` defaults to 1. Keep explicit IDs if retries of your import command must reject the same attempt.

Repeated generations share a series ID and use distinct positive attempt numbers. Publish every collected attempt in that series or disclose the missing attempts. Revised and tool-assisted attempts need those labels and their full transcript.

## Import

```sh
npm run import -- --metadata /path/to/metadata.json --response /path/to/response.txt
npm run validate
```

The importer never calls a model or executes the response. It creates immutable evidence under `content/runs/<run-id>/`, a separate unpublished curation record, and new integrity entries. Existing IDs cannot be overwritten.

Automatic extraction accepts an unambiguous HTML document or one HTML code fence. It does not format or repair the result. Ambiguous responses require an explicit selection.

```sh
npm run import -- --metadata /path/to/metadata.json --response /path/to/response.txt --html /path/to/selected.html
```

The selected file must be an exact UTF-8 byte substring of the response. Extraction records byte offsets. No HTML is a valid outcome and remains inspectable.

For revised, tool-assisted, or known-system attempts, also supply `--transcript /path/to/transcript.json`. The transcript uses this shape.

```json
{
  "schema_version": 1,
  "turns": [
    { "role": "user", "content": "Exact first user instruction." },
    { "role": "assistant", "content": "Exact intermediate response." },
    { "role": "user", "content": "Exact revision instruction." }
  ]
}
```

Use `system` for a supplied system instruction. Remove credentials and unrelated conversations. When omitted for a one-shot attempt without a known system instruction, the importer records the fixed challenge prompt as the user turn.

## Review and publish locally

Edit only `content/curation/<run-id>.json` for presentation decisions.

- Set `visible` to `true` and `published_at` to an ISO timestamp with a timezone.
- Set `series_publication_complete` truthfully. If collected attempts are withheld, set it to `false` and provide `series_incomplete_reason`.
- Add factual `observations`, not scores.
- Leave execution disabled for suspect output. Supply a nonempty `preview_disabled_reason`.
- Enable `preview_allowed` only after review, and set `preview_disabled_reason` to `null`.

Review source for self-navigation, network attempts, loops, and abusive behavior before enabling execution. CSP blocks specified fetch capabilities, but an iframe can navigate itself and consume CPU. Stop is not a reliable recovery mechanism for an already blocked browser.

```sh
npm run validate
npm run dev
```

Review the run route and its evidence. A visible blank frame is neither an automatic pass nor an automatic failure. Broken JavaScript and prompt violations remain legitimate evidence. Do not repair generated output to make the preview work.

## Capture a screenshot

Keep the local server running in one terminal. In another terminal run this command for a published, curator-enabled attempt.

```sh
npm run screenshots -- --run <run-id> --delay 1000
```

The tool uses the same restricted preview route as the app. It checks the actual response CSP and source checksum before execution. Chromium captures an unscaled 640 by 480 viewport with a whole-pixel crop. It records the browser version, delay, viewport, and `restricted-html-v1` policy. Capture may preserve a blank broken result. It never marks an attempt as passed.

The PNG and its metadata belong to mutable curation, not immutable evidence. Stop and restart the dev server to rebuild the gallery with the new thumbnail.

For the labelled demo collection use `--content .fixture-content --run fixture-animation` while `npm run dev -- --fixtures` is running. Custom HTTPS galleries can use `--gallery-origin`.

## Preserve history

Commit the evidence and `content/integrity.json` together when you publish content. The validator checks all current hashes and, when available, the ledger at Git HEAD. CI also compares against the pull request base ledger.

A historical metadata correction requires a new run ID with `supersedes_run_id` and `correction_reason`. Import the preserved response and transcript again with the corrected metadata. The detail page links to the prior record and explains the correction. Do not modify its original record or erase ledger entries.

Curation can disable execution or retract visibility without deleting historical evidence. Rebuild both deployments after retraction so stale pages disappear. Generated build output is replaceable; immutable source evidence is not.

For an explicit prior-ledger check run this command.

```sh
npm run validate -- --prior-integrity /path/to/prior-integrity.json
```

Do not regenerate the integrity ledger to hide a mismatch. SHA-256 detects byte changes, not authorship. If an interrupted import leaves `content/.import-lock`, inspect the partial files and Git diff before removing that lock. Do not retry blindly.
