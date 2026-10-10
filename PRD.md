# Capyboard — MVP Product Requirements Document

Version: 1.0  
Date: 2026-10-08  
Status: Ready for implementation; demand remains untested.  
Audience: Solo founder and AI coding agent.

## 1. Product decision

Build a public, curated gallery showing how different large language models respond to one fixed creative coding challenge: an animated capybara riding a hoverboard, made using HTML, CSS, and JavaScript.

Visitors can inspect the rendered output, exact instructions, original response, extracted source, model identity, and recorded generation conditions. They can compare two runs.

This MVP is a showcase of a narrow task, not a ranking of overall model quality. One attractive output does not establish reliability. Demand for the product is untested.

Product principle: **Showcase first. Inspect everything. Evaluate later.**

## 2. Problem and audience

When a model becomes available, developers want concrete evidence of what it can build. A visible, runnable artifact is easier to inspect than an abstract performance claim. Current examples often omit the instructions, editing history, or generation conditions needed to interpret the result.

Primary audience: developers exploring coding models. Secondary audiences: AI enthusiasts, educators, and developer advocates. The curator is the founder; visitors cannot submit content in the MVP.

Primary job: “Show me what this model actually produced for a known task, and let me inspect the evidence.”

Curator job: “Publish another experiment without changing application code or maintaining a backend.”

## 3. Goals, exclusions, and validation

### MVP goals

- Make outputs immediately browsable through actual screenshots.
- Make every published run independently inspectable and linkable.
- Preserve failures and generation history instead of presenting only successful examples.
- Keep the hosting and curation workflow practical for one person.
- Preserve records that future evaluation tooling can reference unchanged.

### Explicitly out of scope

No accounts, database, runtime backend, payments, public submissions, voting, leaderboard, numerical scoring, automated provider calls, runtime error scoring, LLM judge, historical charts, or additional challenges in the initial release. No code editor or visitor modification of outputs. No content-management dashboard. Do not implement dormant infrastructure for these features.

### Untested demand hypothesis

Developers will return when another model is added because inspecting comparable artifacts informs which model they try for a frontend task.

Founder validation plan: show the MVP to 15 developers who regularly try coding models. Observe whether they can inspect and compare runs without explanation. Over the next two model additions, follow up to see whether at least five return and can describe a real model-choice decision the gallery informed. This is an initial decision threshold, not proof of general demand. Collect this evidence manually; analytics infrastructure is not an MVP dependency.

## 4. Implementation defaults

These are proposed defaults for this handoff, not previously confirmed technology requirements.

| Concern | Decision |
| --- | --- |
| Public application | HTML, CSS, and vanilla JavaScript |
| Content | Version-controlled JSON and text artifacts |
| Build tooling | Small Node.js static-generation and validation scripts |
| Deployment | HTTPS static hosting with deep links and configurable response headers; separate gallery and preview origins |
| Dependencies | Prefer built-in APIs; development-only browser testing is allowed |
| Visual direction | Dark, high-contrast, minimalist gallery; monospace labels; restrained accent |
| Language | English |
| Theme | One dark theme; no theme selector |
| Data changes | Founder adds records locally, validates, rebuilds, deploys |

Generate real HTML pages for run and challenge routes. Avoid requiring a special SPA fallback. Bundle application assets with the gallery; no third-party CDN dependency. The preview origin serves only generated, restricted preview pages and carries no application credentials. Both origins are static deployments; neither needs a runtime backend. JavaScript powers filtering, copying, comparison controls, and opt-in previews. Basic navigation and evidence remain readable without it.

## 5. Fixed challenge and generation protocol

Challenge ID: `capybara-hoverboard-v1`.

Store this exact prompt as UTF-8 text, with its checksum. Its visible text is:

```text
Build an animated capybara riding a hoverboard using only HTML, CSS, and JavaScript.

Deliver a single self-contained HTML file with all CSS and JavaScript inline. Do not use external libraries, external image assets, external fonts, or network requests. Inline SVG, CSS drawing, and canvas are allowed.

The result should visibly show a capybara riding a hoverboard, with animation that makes the scene feel alive. Do not include audio.

Return only the HTML source, without explanations or Markdown code fences.
```

Do not add unstated visual requirements to this challenge. The gallery must retain outputs that ignore parts of the prompt. Changing any instruction creates a new challenge version; it does not overwrite v1.

Recommended collection protocol:

1. Start a fresh conversation or request with no previous user conversation.
2. Send the fixed prompt exactly once. Record any known system instruction separately.
3. Do not edit, retry, or repair the output for a canonical one-shot run.
4. Record provider, exact model identifier when available, interface, timestamp, exposed settings, and known tool use.
5. Save the full response and any HTML extracted from it before publication.

An API call and a consumer chat interface can have different hidden conditions. Label the interface. Record unknown values as `null` or `unknown`; never infer a temperature, hidden system prompt, or model snapshot. Reproduction is limited to the recorded information.

Additional attempts are separate runs with a shared series identifier and an attempt number. Publish all attempts collected for that series, including failures, or disclose that publication is incomplete. Revised and tool-assisted examples may be displayed but must carry prominent labels and their full user-turn transcript. They are not silently presented as canonical one-shot runs.

## 6. Information architecture and journeys

| Route | Purpose |
| --- | --- |
| `/` | Gallery and short explanation |
| `/runs/<run-id>/` | One run: preview and evidence |
| `/compare/?left=<run-id>&right=<run-id>` | Two-run comparison |
| `/challenge/` | Fixed prompt, protocol, and interpretation limits |

### Browse and inspect

Visitor opens the gallery, sees a screenshot and model label, opens a run, starts its preview, and inspects prompt/source/conditions. The run URL is sufficient to return directly to the same evidence.

### Compare

Visitor selects two gallery cards and opens Compare. The page shows both results and their conditions. The URL preserves the chosen IDs. On mobile, the two panels stack vertically. Each panel links to the full run.

### Publish

Curator adds an experiment folder and separate curation record, captures a screenshot through the restricted preview, validates content, builds static files, reviews locally, and deploys. Adding a valid run must not require modifying templates or application logic.

## 7. Functional requirements and acceptance criteria

### F1. Gallery

Each card displays thumbnail or an honest placeholder, model display name, provider, generation date or “Unknown date,” generation mode, and any unavailable-preview label. Cards link to run details. Screenshots never execute generated code.

Search matches model display name, model identifier, and provider, case-insensitively. Provide a provider filter and sort by newest generation date or model name. Unknown generation dates sort last; tie-break by run ID. Default is newest first. With empty content or no matching results, show a clear empty state and a reset action where relevant.

Acceptance: all published runs appear, failures are not filtered out by default, filters combine correctly, and gallery browsing creates zero experiment iframes or generated-script executions.

### F2. Run detail and live preview

Display the model identity, provider, generated and published timestamps, challenge link, generation mode, interface, settings, attempt information, exact user instructions, known system instruction, curation observations, original response, and extracted HTML where present.

Use clearly labelled collapsible evidence sections. Render code and responses as escaped text; syntax highlighting is optional. Provide Copy prompt, Copy HTML, Download HTML, and Download original response. Clipboard failure leaves selectable text and an explanatory status. Downloads initiated by the host produce the preserved original artifacts, not an instrumented preview document.

Preview initially shows the screenshot and a Run preview button. Starting executes a restricted derived preview. Stop removes the iframe; Restart replaces it with a new instance. A frame loading does not mean the output is correct. Say “Preview started,” never automatically “Passed.” Do not claim to catch every script error in this phase.

If the response lacks usable HTML, show the original response with “No runnable HTML returned.” If curator review disables execution, show “Live preview unavailable” and its reason while preserving evidence. Broken or missing artifact retrieval shows an error rather than an empty success state.

Acceptance: copying and downloading preserve source content; stopping unloads the frame; missing, malformed, and preview-disabled outputs remain inspectable; direct run links survive refresh; unknown IDs return a useful not-found page.

### F3. Side-by-side comparison

Allow exactly two distinct run IDs. Gallery selection exposes a visible selection count, remove action, and Compare button enabled only with two selections. The comparison page also offers labelled selectors to replace either run. Reject unknown IDs and duplicate IDs with a recoverable message.

Display both model labels, modes, exact challenge IDs, and settings above their previews. Use one shared preview width and height for both panels, based on the smaller available panel width, capped at 640 CSS pixels, with a 4:3 viewport. Display the actual viewport dimensions. No automatic scaling of one output to make it look better. Both frames start only after Run both; per-panel Stop and Restart remain available. Do not promise synchronized animation timing.

For different challenge versions, show “Different instructions.” For different modes/interfaces/settings or incomplete provenance, show “Generation conditions differ or are incomplete,” with the recorded differences. This is an interpretation notice, not a score. Comparison across conditions remains possible.

Acceptance: a shared URL reconstructs the pair; mobile stacks the panels; both previews have equal viewport dimensions; failures occupy their own panel with evidence links rather than being replaced by a successful result.

### F4. Challenge and transparency

Show the exact fixed prompt, collection protocol, and these plain-language limits: one task cannot establish overall model quality; individual runs can vary; model aliases and chat products can change; publication may not represent all possible attempts; preview restrictions may affect behavior.

Every run identifies the challenge version. The gallery contains a short linkable statement that it is a curated experiment gallery, not a general model leaderboard.

Acceptance: visitors can find the challenge and exact instructions from every run, and no UI implies an overall model ranking.

### F5. Manual curation and validation

Provide a documented local import command that accepts paths to metadata, original response, and optional extracted HTML. It must not call a model or execute submitted JavaScript. HTML extraction removes only surrounding explanations or code fences; it does not format, repair, or rewrite the HTML. Record extraction byte ranges when HTML is a verbatim UTF-8 substring of the original response. If extraction is ambiguous, preserve the response and require curator selection; never silently select the nicest output.

Build validation checks schema versions, unique IDs, referenced challenges, artifact paths, enum values, timestamps, checksums, thumbnail references, and prior immutable run records. Path references must remain inside the designated content directory. Missing required files or changed immutable content fail the build with useful messages. Content validation does not grade the generated result.

The curator separately decides whether a live preview is permitted, supplies a reason when disabled, and writes factual observations such as “Response references an external script.” Do not turn observations into hidden scores. A content violation remains publishable with restricted or disabled execution.

Acceptance: one documented workflow adds another run without application edits; importing a new run cannot overwrite an existing ID; invalid records fail before deployment; modifications to already recorded run bytes are detected using a checked-in integrity ledger.

## 8. Content model and integrity

Separate immutable experiment evidence from mutable presentation and future evaluation. Store one run record per generation attempt, not one record per model. Identical source from different attempts still has distinct run IDs.

Suggested repository layout:

```text
content/
  challenges/capybara-hoverboard-v1/
    challenge.json
    prompt.txt
  runs/<run-id>/
    run.json
    response.txt
    transcript.json
    output.html.txt
  curation/<run-id>.json
  thumbnails/<run-id>.webp
  integrity.json
src/
scripts/
tests/
dist/                         # generated; do not edit
```

`output.html.txt` contains the exact extracted HTML bytes. Do not expose originals as executable same-origin HTML routes. Serve evidence as plain text with `nosniff` headers; the host can download the bytes using an `.html` filename. Source files may be absent for unsuccessful generations. The transcript records user turns and supplied system instructions, excluding credentials and unrelated conversation.

Example run below is illustrative, not a real model submission. The import script supplies IDs, paths, byte counts, and real SHA-256 values; placeholder hashes must fail validation.

```json
{
  "schema_version": 1,
  "id": "example-run-001",
  "challenge_id": "capybara-hoverboard-v1",
  "series_id": "example-series-001",
  "attempt_number": 1,
  "provider": "Example Provider",
  "model": {
    "display_name": "Example Model",
    "identifier": "example-model-id",
    "identifier_kind": "alias"
  },
  "generated_at": null,
  "generation": {
    "mode": "one-shot",
    "interface": "web-chat",
    "tools_used": "unknown",
    "settings": {
      "temperature": null,
      "top_p": null,
      "max_output_tokens": null,
      "seed": null
    },
    "system_instruction_known": false
  },
  "instructions": {
    "prompt_path": "challenges/capybara-hoverboard-v1/prompt.txt",
    "prompt_sha256": "<computed-sha256>",
    "transcript_path": "runs/example-run-001/transcript.json"
  },
  "artifacts": {
    "response": {
      "path": "runs/example-run-001/response.txt",
      "sha256": "<computed-sha256>",
      "size_bytes": 1234
    },
    "html": {
      "path": "runs/example-run-001/output.html.txt",
      "sha256": "<computed-sha256>",
      "size_bytes": 1234,
      "extraction": { "start_byte": 0, "end_byte_exclusive": 1234 }
    }
  }
}
```

Required enums:

- `generation.mode`: `one-shot`, `revised`, `tool-assisted`, `unknown`.
- `generation.interface`: `api`, `web-chat`, `coding-agent`, `other`, `unknown`.
- `generation.tools_used`: `yes`, `no`, `unknown`.
- `model.identifier_kind`: `snapshot`, `alias`, `display-only`, `unknown`.

Use `artifacts.html: null` when no HTML was returned. Settings not exposed are `null`, not assumed defaults. Timestamps are ISO 8601 with explicit offset or UTC, or `null` when genuinely unavailable. A display-only identifier must be visibly described as such.

Curation record fields: `run_id`, `published_at`, `visible`, `preview_allowed`, `preview_disabled_reason`, `observations`, `series_publication_complete`, and optional thumbnail metadata containing path, viewport, capture delay, browser version, and preview-policy version. Use `null` for unknown capture metadata and incomplete-series reasons. Keep thumbnails and curation notes outside the immutable run record.

SHA-256 verifies content integrity, not authorship or scientific validity. Preserve run records and evidence through version control plus the integrity ledger. A metadata correction creates a replacement record with `supersedes_run_id` and a visible explanation; do not silently rewrite the historical evidence. Curation can hide execution or retract publication without destroying originals in the source repository.

There is intentionally no mutable `evaluation` field inside a run. Future evaluations will reference `run_id` and artifact checksums from separate records.

## 9. Preview isolation and boundaries

Treat all model-generated markup, scripts, and responses as untrusted, even when manually curated. This section specifies application containment, not future model grading.

1. Render generated code only inside an iframe using `sandbox="allow-scripts"`, loading a derived static page from the dedicated preview origin. Do not grant same-origin, top navigation, popups, forms, downloads, modals, or sandbox escape permissions. Deny camera, microphone, geolocation, and other unnecessary capabilities; use a descriptive frame title and no-referrer policy.
2. Serve every derived preview document with an enforced HTTP CSP response header, including `sandbox allow-scripts`. This also restricts a preview opened directly. Allow inline scripts/styles needed by the challenge. Baseline policy:

   ```text
   sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
   img-src data:; connect-src 'none'; font-src 'none'; media-src 'none';
   object-src 'none'; frame-src 'none'; worker-src 'none';
   base-uri 'none'; form-action 'none'
   ```

3. Generate derived preview pages at build time without executing their scripts. Preserve source separately. If preview preparation cannot safely represent malformed content, disable preview and explain why. Never weaken containment to make one run work. Do not rely on a meta CSP for the `sandbox` directive: it requires an HTTP header. Avoid `srcdoc` as the execution transport because inherited host CSP can block the inline scripts this challenge requires.
4. Do not trust messages sent from experiment frames. The MVP requires no frame-to-parent messaging. Do not insert preview HTML through application `innerHTML` or execute its scripts in the host.
5. Keep the gallery host CSP separate: allow its own locally hosted application assets without broadly allowing inline host scripts, and allow frames only from the configured preview origin. Never serve original experiment source as executable HTML on the gallery origin. Include deployable header configuration for both origins, source MIME types, `nosniff`, CSP, and permissions restrictions. Validate the actual deployed headers; a host that cannot enforce preview response headers does not satisfy this PRD.
6. Document transformations and publish the preview-policy version. Screenshots must come from the same restricted preview implementation, with capture conditions recorded. Never change the preserved original to make screenshots prettier.

Important boundary: iframe sandboxing and CSP are not an absolute no-network or CPU-isolation guarantee. CSP fetch restrictions do not cover every navigation path; an iframe can navigate itself, and a script can consume CPU. The MVP is therefore curator-reviewed, opt-in execution with a Stop control, not arbitrary hostile-code hosting. Review for self-navigation, network attempts, infinite loops, and abusive behavior before enabling a run. Suspect outputs remain visible as evidence with execution disabled. Do not claim the Stop button can reliably recover a browser already blocked by an infinite loop.

Technical references, checked for this PRD:

- [MDN iframe sandbox documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
- [MDN Content Security Policy documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)

## 10. Quality requirements

### Accessibility and responsive behavior

Target WCAG 2.1 AA for the application shell: semantic headings, labelled controls, visible focus, sufficient contrast, keyboard navigation, status announcements, and code blocks that scroll within their containers. The generated artworks have their own accessibility limitations and must not be rewritten to meet shell requirements. Provide a host-owned Stop control outside the iframe. Never autoplay previews; avoid decorative shell animation and respect reduced-motion preferences in the shell.

Validate the shell at 360, 768, and 1440 CSS pixels. It must not horizontally overflow. Mobile comparison stacks in a predictable order. A large code block must not expand page width.

### Performance and capacity

Design for 100 runs without a database or API. Use lazy-loaded thumbnails with explicit dimensions. Initial gallery load must not fetch original responses or HTML artifacts and must not start previews. Fetch source evidence when expanded or requested. At most two experiment frames may exist at once. Target application shell HTML/CSS/JS of 200 KB or less compressed, excluding thumbnails and experiment artifacts. Reserve image dimensions to avoid card shifts.

### Honest failure handling

Differentiate missing HTML, curator-disabled execution, failed artifact retrieval, and an apparently blank rendered result. Do not classify a blank frame automatically as a model failure or success. Keep source available whenever it exists. An application-shell error must not be attributed to the model.

### Browser support

Verify the current stable Chromium, Firefox, and WebKit browser engines available to the implementer, recording versions. Test the preview boundary in each. Do not depend on experimental iframe APIs as the sole isolation mechanism.

## 11. Verification plan

These tests validate Capyboard itself. They are not CapyLab evaluations of model quality.

| Area | Required verification |
| --- | --- |
| Content integrity | Duplicate IDs, missing files, changed prior hashes, invalid enums/dates, and path traversal fail validation |
| Evidence preservation | Imported response and extracted HTML checksums match downloaded bytes; source strings cannot inject host markup |
| Gallery | Search/filter/sort, zero results, empty collection, and non-execution of card content |
| Detail | Direct load/refresh, copy fallback, downloads, start/stop/restart, missing HTML, disabled preview, and source retrieval errors |
| Comparison | Pair persists in URL; invalid/duplicate IDs recover; viewport sizes match; condition notices render |
| Containment | Fixtures attempting parent DOM access, top navigation, popups, form submission, fetch, and remote image/script loading are blocked |
| Deployment | Source routes serve plain text with `nosniff`; host security headers are present; run deep links resolve |
| Accessibility | Keyboard journey from gallery to evidence and Stop control; focus visibility; contrast; responsive overflow checks |

Use clearly labelled, deterministic development fixtures: a valid animation, a broken HTML/JavaScript result, a response with no HTML, incomplete provenance, and a disabled preview. Add targeted malicious fixtures for containment checks. Do not run uncontrolled infinite-loop fixtures in a user's interactive browser; resource containment limitations are documented rather than falsely certified.

Production model examples must be supplied or collected by the founder with genuine provenance. Never invent a model attribution or pass off an agent-created demo as a real experiment. The application can be implementation-complete with fixtures; public launch is content-ready only after genuine runs have been imported.

## 12. Delivery sequence and definition of done

1. **Evidence foundation:** challenge files, schema, immutable ledger, import/validation scripts, and fixtures.
2. **Static gallery:** build-generated pages, cards, filters, sort, empty/not-found states.
3. **Run inspection:** metadata, escaped evidence, byte-preserving copy/download, restricted opt-in preview, curation notices.
4. **Comparison:** selection workflow, shared URLs, equal viewports, mobile stacking, condition notices.
5. **Launch preparation:** meaningful tests, accessibility review, hosting headers, founder documentation, and genuine content import.

Required handoff files: application source, content schemas, fixed prompt/protocol, import and validation commands, relevant tests, hosting configuration example, and README explaining local development, screenshot capture, publication, failure handling, and immutable-record corrections.

Implementation is done when all F1–F5 acceptance criteria pass, the build is static, no secret or model API key is required, previews remain opt-in and isolated, and another valid run can be imported without application changes.

Public launch additionally requires at least three genuine attempts from three identified models using challenge v1, with transparent generation conditions, intact response/source artifacts, and screenshots where feasible. Do not fabricate successful examples if collected attempts fail. Review the production deployment's routes and headers before calling it ready.

## 13. Future Capyboard Lab — architecture only

Preserve the following extension points without implementing their interfaces or infrastructure now:

| Later capability | Foundation preserved in MVP |
| --- | --- |
| Automated browser checks | Original artifact bytes, hashes, challenge version, separate preview policy |
| Repeated-run reliability | One record per attempt, series and attempt numbers, publication disclosure |
| Reproducible evaluations | Recorded model/interface/settings/transcript, explicit unknowns |
| Human visual assessment | Stable run IDs and consistent capture metadata |
| Historical comparisons | Immutable dated records and explicit model identifier kinds |
| Additional challenges | Versioned challenge IDs, independent prompt records |

A later evaluation record should reference the run ID, artifact hash, evaluation-suite version, execution environment, timestamp, and individual observations/results. Allow multiple evaluations for one unchanged run. New evaluation methods must not rewrite original evidence. Build functional checks and repeated-run methodology before introducing aggregate scores or claims about general model capability.

## 14. Instructions to the AI coding agent

Implement the MVP defined here. Resolve routine layout and naming choices yourself. Keep the repository and runtime small. Start with evidence integrity and preview containment before visual polish. Use the fixture collection until genuine model outputs are supplied, and label it unmistakably as development data.

Do not add a backend, provider integration, leaderboard, database, account system, or future Lab implementation. Do not fix or beautify generated experiments. Document any environment limitation that prevents a required verification; do not report unchecked requirements as passing.

Return the working implementation, concise setup/curation instructions, completed verification evidence, and any remaining launch-content or deployment dependencies.
