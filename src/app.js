const globalStatus = document.querySelector("#global-status");
const announce = (message) => {
  if (globalStatus) globalStatus.textContent = message;
};
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const nameCollator = new Intl.Collator("en", { sensitivity: "base" });
const compareDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});
const artifactCache = new Map();
const verifiedChecksums = new Set();
async function artifact(url, checksum) {
  if (!artifactCache.has(url)) {
    const request = (async () => {
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) throw new Error(`Artifact retrieval failed (${response.status}).`);
      return new Uint8Array(await response.arrayBuffer());
    })();
    artifactCache.set(url, request);
    request.catch(() => artifactCache.delete(url));
  }
  const bytes = await artifactCache.get(url);
  if (checksum && !verifiedChecksums.has(`${url}:${checksum}`)) {
    const hashArray = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    let hash = "";
    for (let i = 0; i < hashArray.length; i++) {
      hash += hashArray[i].toString(16).padStart(2, "0");
    }
    if (hash !== checksum) {
      artifactCache.delete(url);
      throw new Error("Artifact checksum does not match the recorded evidence.");
    }
    verifiedChecksums.add(`${url}:${checksum}`);
  }
  return bytes;
}
function artifactStatus(button, message) {
  const status =
    button.closest(".evidence")?.querySelector(".evidence-status") ??
    document.querySelector("#artifact-status") ??
    globalStatus;
  if (status) status.textContent = message;
}
function validateTokens(source, tokens) {
  if (!Array.isArray(tokens)) throw new Error("Invalid highlighting ranges.");
  let offset = 0;
  for (const token of tokens) {
    if (
      !Number.isInteger(token.offset) ||
      !Number.isInteger(token.length) ||
      token.offset < offset ||
      token.length <= 0 ||
      token.offset + token.length > source.length ||
      typeof token.light !== "string" ||
      !/^#[\da-f]{6}$/i.test(token.light) ||
      typeof token.dark !== "string" ||
      !/^#[\da-f]{6}$/i.test(token.dark)
    )
      throw new Error("Invalid highlighting ranges.");
    offset = token.offset + token.length;
  }
}
function highlightedCode(source, tokens) {
  validateTokens(source, tokens);
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const token of tokens) {
    if (token.offset > offset)
      fragment.append(document.createTextNode(source.slice(offset, token.offset)));
    const span = element(
      "span",
      source.slice(token.offset, token.offset + token.length),
      "syntax-token",
    );
    span.style.cssText = `--syntax-light:${token.light};--syntax-dark:${token.dark}`;
    fragment.append(span);
    offset = token.offset + token.length;
  }
  if (offset < source.length) fragment.append(document.createTextNode(source.slice(offset)));
  return fragment;
}
async function highlightCode(details, code, source) {
  const response = await fetch(details.dataset.highlightUrl, { credentials: "omit" });
  if (!response.ok) throw new Error("Highlighting could not be loaded.");
  const data = await response.json();
  if (data.sha256 !== details.dataset.sha256)
    throw new Error("Highlighting does not match this artifact.");
  validateTokens(source, data.tokens);
  const hasFormatted = typeof data.formatted?.source === "string";
  if (hasFormatted) validateTokens(data.formatted.source, data.formatted.tokens);
  let original = null;
  let formatted = null;
  const getOriginal = () => {
    if (!original) original = highlightedCode(source, data.tokens);
    return original;
  };
  const getFormatted = () => {
    if (!formatted && hasFormatted)
      formatted = highlightedCode(data.formatted.source, data.formatted.tokens);
    return formatted;
  };
  const button = details.querySelector("[data-format]");
  const status = details.querySelector(".evidence-status");
  const show = (isFormatted) => {
    const fragment = isFormatted ? getFormatted() : getOriginal();
    code.replaceChildren(fragment ? fragment.cloneNode(true) : document.createTextNode(source));
    code.parentElement.scrollTop = 0;
    code.parentElement.scrollLeft = 0;
    status.textContent = isFormatted
      ? "Formatted for readability. Original SHA-256 verified."
      : "Preserved artifact loaded. SHA-256 verified.";
    button?.setAttribute("aria-pressed", String(isFormatted));
  };
  show(hasFormatted);
  if (hasFormatted && button) {
    button.hidden = false;
    button.addEventListener("click", () => show(button.getAttribute("aria-pressed") !== "true"));
  } else if (button) {
    status.textContent += " Formatting unavailable. Showing the original.";
  }
}
function enableEvidence() {
  for (const button of document.querySelectorAll("[data-wrap]")) {
    button.hidden = false;
    button.addEventListener("click", () => {
      const wrapped = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(wrapped));
      button.closest(".evidence-body").querySelector("pre").classList.toggle("unwrapped", !wrapped);
    });
  }
  for (const details of document.querySelectorAll("[data-evidence-url]")) {
    details.addEventListener("toggle", async () => {
      if (!details.open || details.dataset.loaded === "true") return;
      const status = details.querySelector(".evidence-status");
      status.textContent = "Loading preserved evidence…";
      try {
        const bytes = await artifact(details.dataset.evidenceUrl, details.dataset.sha256);
        const code = details.querySelector("code");
        const source = utf8Decoder.decode(bytes);
        code.textContent = source;
        details.dataset.loaded = "true";
        status.textContent = "Preserved artifact loaded. SHA-256 verified.";
        if (details.dataset.highlightUrl) {
          try {
            await highlightCode(details, code, source);
          } catch {
            status.textContent +=
              " Syntax highlighting unavailable. Original text remains readable.";
          }
        }
      } catch (error) {
        status.textContent = `${error.message} Close and reopen this section to retry.`;
      }
    });
  }
  for (const button of document.querySelectorAll("[data-copy-url]")) {
    button.hidden = false;
    button.addEventListener("click", async () => {
      let text;
      try {
        const bytes = await artifact(
          button.dataset.copyUrl,
          button.closest("[data-sha256]")?.dataset.sha256,
        );
        text = utf8Decoder.decode(bytes);
      } catch (error) {
        artifactStatus(button, error.message);
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        artifactStatus(button, "Copied preserved text. Downloads preserve exact bytes.");
      } catch {
        const container = button.closest(".evidence-body") ?? button.parentElement;
        let field = container.querySelector("[data-copy-fallback]");
        if (!field) {
          field = element("textarea", undefined, "clipboard-fallback");
          field.dataset.copyFallback = "";
          field.readOnly = true;
          field.rows = 10;
          field.setAttribute("aria-label", "Preserved text for manual copying");
          container.append(field);
        }
        field.value = text;
        field.focus();
        field.select();
        artifactStatus(
          button,
          "Clipboard unavailable. The preserved text is selected for manual copying.",
        );
      }
    });
  }
  for (const button of document.querySelectorAll("[data-download-url]")) {
    button.hidden = false;
    button.addEventListener("click", async () => {
      try {
        const bytes = await artifact(button.dataset.downloadUrl, button.dataset.sha256);
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
        const link = element("a");
        link.href = url;
        link.download = button.dataset.filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        artifactStatus(button, "Download started from the preserved original artifact.");
      } catch (error) {
        artifactStatus(button, error.message);
      }
    });
  }
}

function enableGallery() {
  const filters = document.querySelector(".filters");
  if (!filters) return;
  filters.closest(".gallery-controls").hidden = false;
  const cards = [...document.querySelectorAll("[data-card]")];
  const grid = document.querySelector(".gallery-grid");
  const cardItems = cards.map((card) => ({
    card,
    id: card.dataset.card,
    name: card.dataset.name,
    timestamp: card.dataset.date ? Date.parse(card.dataset.date) : -Infinity,
    searchable: [card.dataset.name, card.dataset.identifier, card.dataset.provider].map((value) =>
      (value ?? "").toLowerCase(),
    ),
    provider: card.dataset.provider,
  }));
  const selected = new Map();
  const tray = document.querySelector(".comparison-tray");
  const search = filters.elements.namedItem("search");
  const provider = filters.elements.namedItem("provider");
  const sort = filters.elements.namedItem("sort");
  const reset = document.querySelector("[data-reset]");
  reset.hidden = false;
  const update = () => {
    const query = search.value.toLowerCase().trim();
    let count = 0;
    cardItems.sort((a, b) => {
      const primary =
        sort.value === "name" ? nameCollator.compare(a.name, b.name) : b.timestamp - a.timestamp;
      return primary || a.id.localeCompare(b.id, "en");
    });
    for (const item of cardItems) {
      const hidden = !(
        (!provider.value || item.provider === provider.value) &&
        (!query || item.searchable.some((value) => value.includes(query)))
      );
      if (item.card.hidden !== hidden) item.card.hidden = hidden;
      if (!hidden) count++;
    }
    grid.append(...cardItems.map((item) => item.card));
    const filtered = query !== "" || provider.value !== "";
    filters.querySelector("[type='reset']").hidden = !filtered && sort.value === "newest";
    const status = document.querySelector("#results-status");
    status.hidden = !filtered;
    status.textContent = `${count} of ${cardItems.length} attempts`;
    document.querySelector("#empty-state").hidden = count !== 0;
  };
  const updateSelection = () => {
    tray.hidden = selected.size === 0;
    document.querySelector("#selection-count").textContent = `${selected.size} of 2 selected`;
    const list = document.querySelector("#selected-runs");
    list.replaceChildren();
    for (const [id, name] of selected) {
      const item = element("li", name);
      const remove = element("button", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${name} from comparison`);
      remove.addEventListener("click", () => {
        selected.delete(id);
        const input = grid.querySelector(`input[value="${id}"]`);
        if (input) input.checked = false;
        updateSelection();
      });
      item.append(remove);
      list.append(item);
    }
    const link = document.querySelector("#compare-link");
    link.setAttribute("aria-disabled", String(selected.size !== 2));
    if (selected.size === 2) {
      const [left, right] = [...selected.keys()];
      link.href = `/compare/?${new URLSearchParams({ left, right })}`;
      link.removeAttribute("tabindex");
    } else {
      link.removeAttribute("href");
      link.tabIndex = -1;
    }
  };
  for (const card of cards) {
    const input = card.querySelector("[data-select]");
    input.closest("label").hidden = false;
    input.addEventListener("change", () => {
      if (input.checked && selected.size === 2) {
        input.checked = false;
        announce("Only two runs can be selected. Remove a run before selecting another.");
        return;
      }
      if (input.checked) selected.set(input.value, card.dataset.name);
      else selected.delete(input.value);
      updateSelection();
    });
  }
  filters.addEventListener("input", update);
  filters.addEventListener("submit", (event) => event.preventDefault());
  filters.addEventListener("reset", () => setTimeout(update, 0));
  reset.addEventListener("click", () => filters.reset());
  update();
}

const previews = new Map();
let resizeObserver = null;
function ensureResizeObserver() {
  if (resizeObserver || !previews.size) return;
  const main = document.querySelector("main");
  if (!main) return;
  resizeObserver = new ResizeObserver(() => requestAnimationFrame(resizePreviews));
  resizeObserver.observe(main);
}
function setupPreview(node) {
  const stage = node.querySelector(".preview-stage");
  const startButton = node.querySelector("[data-start]");
  const stopButton = node.querySelector("[data-stop]");
  const restartButton = node.querySelector("[data-restart]");
  const status = node.querySelector(".preview-status");
  const state = { node, stage, phase: "idle", frame: null, width: 0, height: 0 };
  const stop = () => {
    state.frame?.remove();
    state.frame = null;
    if (state.phase !== "idle") state.phase = "stopped";
    if (startButton)
      startButton.hidden = node.dataset.comparison === "true" || state.phase !== "idle";
    if (stopButton) stopButton.hidden = true;
    if (restartButton) restartButton.hidden = state.phase === "idle";
    status.textContent = "Preview stopped. The frame has been removed.";
  };
  const start = () => {
    if (!node.dataset.previewUrl) return;
    stop();
    if ([...previews.values()].filter((controller) => controller.state.frame).length >= 2) {
      status.textContent = "Stop an existing preview before starting another. At most two can run.";
      return;
    }
    const frame = element("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute(
      "allow",
      "camera 'none'; microphone 'none'; geolocation 'none'; fullscreen 'none'; autoplay 'none'",
    );
    frame.referrerPolicy = "no-referrer";
    frame.title = `Restricted preview of ${node.dataset.previewId}`;
    frame.width = String(state.width);
    frame.height = String(state.height);
    frame.src = node.dataset.previewUrl;
    stage.append(frame);
    state.frame = frame;
    state.phase = "running";
    startButton.hidden = true;
    stopButton.hidden = false;
    restartButton.hidden = false;
    status.textContent =
      "Preview started. This does not establish correctness or detect every script error.";
  };
  startButton?.addEventListener("click", start);
  stopButton?.addEventListener("click", stop);
  restartButton?.addEventListener("click", start);
  if (startButton) startButton.hidden = node.dataset.comparison === "true";
  const controller = { state, start, stop };
  previews.set(node, controller);
  ensureResizeObserver();
  return controller;
}
function resizePreviews() {
  const controllers = [...previews.values()];
  if (!controllers.length) return;
  const available = Math.min(
    640,
    ...controllers.map(({ state }) => state.stage.parentElement.clientWidth),
  );
  const width = Math.max(4, Math.floor(available / 4) * 4);
  const height = (width * 3) / 4;
  for (const { state } of controllers) {
    state.width = width;
    state.height = height;
    state.stage.style.width = `${width}px`;
    state.stage.style.height = `${height}px`;
    if (state.frame) {
      state.frame.width = String(width);
      state.frame.height = String(height);
    }
    state.node.querySelector("[data-viewport]").textContent = `${width} × ${height} CSS px · 4:3`;
  }
}
function comparePreview(entry) {
  const node = element("section", undefined, "preview");
  node.dataset.previewId = entry.run.id;
  node.dataset.comparison = "true";
  if (entry.preview.kind === "ready") node.dataset.previewUrl = entry.preview.url;
  const stage = element("div", undefined, "preview-stage");
  if (entry.curation.thumbnail) {
    const image = element("img");
    image.src = `/${entry.curation.thumbnail.path}`;
    image.alt = `Screenshot of ${entry.run.model.display_name} output`;
    image.width = 640;
    image.height = 480;
    image.setAttribute("loading", "eager");
    image.setAttribute("fetchpriority", "high");
    stage.append(image);
  } else stage.append(element("div", "Screenshot not captured", "placeholder"));
  const controls = element("div", undefined, "preview-controls");
  if (entry.preview.kind === "ready") {
    const openPreview = element("a", "Open preview in new tab", "preview-open");
    openPreview.setAttribute("aria-description", `for ${entry.run.model.display_name}`);
    const arrow = element("span", " ↗");
    arrow.setAttribute("aria-hidden", "true");
    openPreview.append(arrow);
    openPreview.href = entry.preview.url;
    openPreview.target = "_blank";
    openPreview.rel = "noopener noreferrer";
    openPreview.referrerPolicy = "no-referrer";
    controls.append(openPreview);
    for (const [name, label] of [
      ["start", "Run preview"],
      ["stop", "Stop"],
      ["restart", "Restart"],
    ]) {
      const button = element("button", label);
      button.type = "button";
      button.dataset[name] = "";
      button.hidden = true;
      controls.append(button);
    }
  } else controls.append(element("p", entry.preview.reason, "notice"));
  const viewport = element("span", undefined, "viewport-label");
  viewport.dataset.viewport = "";
  controls.append(viewport);
  const status = element("p", "Preview is stopped.", "preview-status");
  status.setAttribute("role", "status");
  node.append(stage, controls, status);
  return node;
}
function comparisonTable(caption, rows) {
  const table = element("table", undefined, "compare-table");
  table.append(element("caption", caption, "sr-only"));
  const head = element("thead");
  const headings = element("tr");
  for (const label of ["Measurement", "Left attempt", "Right attempt"]) {
    const cell = element("th", label);
    cell.scope = "col";
    headings.append(cell);
  }
  head.append(headings);
  const body = element("tbody");
  for (const [label, left, right] of rows) {
    const different =
      left !== right && ![left, right].some((value) => ["Unknown", "Not recorded"].includes(value));
    const row = element("tr", undefined, different ? "comparison-difference" : undefined);
    const heading = element("th", label);
    heading.scope = "row";
    row.append(heading, element("td", left), element("td", right));
    body.append(row);
  }
  table.append(head, body);
  return table;
}
async function enableComparison() {
  const form = document.querySelector("#compare-form");
  if (!form) return;
  const status = document.querySelector("#compare-status");
  const left = form.elements.namedItem("left");
  const right = form.elements.namedItem("right");
  const both = document.querySelector("#run-both");
  let cataloguePromise = null;
  const getCatalogue = () => {
    if (!cataloguePromise) {
      cataloguePromise = (async () => {
        const response = await fetch("/assets/runs.json");
        if (!response.ok) throw new Error("Run catalogue could not be loaded.");
        const entries = await response.json();
        return new Map(entries.map((entry) => [entry.run.id, entry]));
      })();
    }
    return cataloguePromise;
  };
  const searchParams = new URLSearchParams(location.search);
  if (searchParams.get("left") && searchParams.get("right")) {
    void getCatalogue();
  }
  left.addEventListener("focus", () => void getCatalogue(), { once: true });
  right.addEventListener("focus", () => void getCatalogue(), { once: true });
  const provenanceDetails = document.querySelector("#compare-provenance");
  const generation = document.querySelector("#compare-generation");
  let currentComparison = null;
  const renderProvenance = () => {
    if (!provenanceDetails?.open || !currentComparison || generation.hasChildNodes()) return;
    const [a, b] = currentComparison;
    const provenance = [
      ["Run ID", (entry) => entry.run.id],
      ["Provider", (entry) => entry.run.provider],
      ["Model identifier", (entry) => entry.run.model.identifier],
      ["Generated", (entry) => entry.run.generated_at ?? "Unknown"],
      ["Harness", (entry) => entry.run.generation.harness?.name ?? "Unknown"],
      ["Harness version", (entry) => entry.run.generation.harness?.version ?? "Unknown"],
      ["Generation mode", (entry) => entry.run.generation.mode],
      ["Interface", (entry) => entry.run.generation.interface],
      ["Tools used", (entry) => entry.run.generation.tools_used],
      ["Challenge", (entry) => entry.run.challenge_id],
    ];
    generation.append(
      comparisonTable(
        "Generation details and provenance",
        provenance.map(([label, value]) => [label, value(a), value(b)]),
      ),
    );
  };
  provenanceDetails?.addEventListener("toggle", renderProvenance);
  const render = async () => {
    for (const controller of previews.values()) controller.stop();
    previews.clear();
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    const panels = document.querySelector("#compare-panels");
    panels.replaceChildren();
    const results = document.querySelector("#compare-results");
    results.hidden = true;
    const metrics = document.querySelector("#compare-metrics");
    metrics.replaceChildren();
    currentComparison = null;
    generation.replaceChildren();
    const notices = document.querySelector("#condition-notices");
    notices.replaceChildren();
    both.hidden = true;
    if (!left.value || !right.value || left.value === right.value) {
      status.textContent =
        !left.value && !right.value
          ? "Choose two distinct runs."
          : "Choose two distinct published run IDs. Unknown or duplicate IDs cannot be compared.";
      return;
    }
    let catalogue;
    try {
      catalogue = await getCatalogue();
    } catch (error) {
      status.textContent = `${error.message} Open individual run pages to inspect evidence.`;
      return;
    }
    const a = catalogue.get(left.value);
    const b = catalogue.get(right.value);
    if (!a || !b) {
      status.textContent =
        "Choose two distinct published run IDs. Unknown or duplicate IDs cannot be compared.";
      return;
    }
    status.textContent = "Two attempts selected. Previews do not start automatically.";
    if (a.run.challenge_id !== b.run.challenge_id)
      notices.append(element("p", "Different instructions.", "notice"));
    const differences = [];
    for (const key of ["mode", "interface", "tools_used"]) {
      if (a.run.generation[key] !== b.run.generation[key])
        differences.push(`${key}: ${a.run.generation[key]} versus ${b.run.generation[key]}`);
    }
    for (const [key, label] of [
      ["name", "Harness"],
      ["version", "Harness version"],
      ["effort", "Effort"],
    ]) {
      const leftValue = a.run.generation.harness?.[key] ?? "Unknown";
      const rightValue = b.run.generation.harness?.[key] ?? "Unknown";
      if (leftValue !== rightValue) differences.push(`${label}: ${leftValue} versus ${rightValue}`);
    }
    const systems = (entry) =>
      entry.transcript.turns.filter((turn) => turn.role === "system").map((turn) => turn.content);
    if (JSON.stringify(systems(a)) !== JSON.stringify(systems(b)))
      differences.push("Known system instructions differ.");
    const incomplete = [a, b].some(
      ({ run }) =>
        !run.generated_at ||
        run.generation.mode === "unknown" ||
        run.generation.interface === "unknown" ||
        run.generation.tools_used === "unknown" ||
        (run.generation.interface === "coding-agent" &&
          (!run.generation.harness ||
            run.generation.harness.version === null ||
            run.generation.harness.effort === null)),
    );
    if (differences.length || incomplete) {
      const notice = element("div", undefined, "notice");
      const message = element("p");
      message.append(element("span", "Generation conditions differ or are incomplete."));
      if (differences.length)
        message.append(element("span", ` ${differences.join(" · ")}.`, "compare-differences"));
      if (incomplete)
        message.append(" Some dates or agent conditions are unknown. Review provenance.");
      notice.append(message);
      notices.append(notice);
    }
    for (const [index, entry] of [a, b].entries()) {
      const panel = element("article", undefined, "compare-panel");
      const header = element("header", undefined, "compare-attempt");
      const title = element("h2", entry.run.model.display_name);
      title.id = `compare-attempt-${index}`;
      panel.setAttribute("aria-labelledby", title.id);
      const effort = entry.run.generation.harness?.effort;
      const effortLabel = effort
        ? `${effort.charAt(0).toUpperCase()}${effort.slice(1)} effort`
        : "Effort unknown";
      const identity = element("p", undefined, "compare-identity");
      identity.append(element("strong", effortLabel));
      if (entry.run.generated_at) {
        const date = compareDateFormat.format(new Date(entry.run.generated_at));
        const time = element("time", `${date} UTC`);
        time.dateTime = entry.run.generated_at;
        identity.append(time);
      } else identity.append(element("span", "Unknown date"));
      const name = element("div", undefined, "compare-attempt-name");
      name.append(
        element(
          "p",
          `${index === 0 ? "Left" : "Right"} attempt · #${entry.run.attempt_number}`,
          "eyebrow",
        ),
        title,
      );
      header.append(name, identity);
      const preview = comparePreview(entry);
      const link = element("a", "Inspect full evidence ↗", "compare-evidence");
      link.href = `/runs/${entry.run.id}/`;
      panel.append(header, preview, link);
      panels.append(panel);
      setupPreview(preview);
    }
    const rows = [
      [
        "Effort",
        a.run.generation.harness?.effort ?? "Unknown",
        b.run.generation.harness?.effort ?? "Unknown",
      ],
    ];
    for (const [index, [label, value]] of a.measurementRows.entries()) {
      const [rightLabel, rightValue] = b.measurementRows[index];
      if (label === rightLabel) rows.push([label, value, rightValue]);
      else rows.push([label, value, "Not recorded"], [rightLabel, "Not recorded", rightValue]);
    }
    metrics.append(comparisonTable("Recorded metrics", rows));
    currentComparison = [a, b];
    if (provenanceDetails?.open) renderProvenance();
    results.hidden = false;
    resizePreviews();
    both.hidden = false;
    both.disabled = ![a, b].some((entry) => entry.preview.kind === "ready");
  };
  const sync = () => {
    history.pushState(
      null,
      "",
      `/compare/?${new URLSearchParams({ left: left.value, right: right.value })}`,
    );
    render();
  };
  const loadUrl = () => {
    const params = new URLSearchParams(location.search);
    left.value = params.get("left") ?? "";
    right.value = params.get("right") ?? "";
    render();
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sync();
  });
  left.addEventListener("change", sync);
  right.addEventListener("change", sync);
  both.addEventListener("click", () => {
    for (const controller of previews.values()) controller.start();
  });
  window.addEventListener("popstate", loadUrl);
  loadUrl();
}
try {
  enableEvidence();
  enableGallery();
  for (const node of document.querySelectorAll("[data-preview-id]")) setupPreview(node);
  await enableComparison();
  if (previews.size) {
    resizePreviews();
    ensureResizeObserver();
  }
} catch {
  announce(
    "Application controls are unavailable. Static pages and preserved evidence links remain readable.",
  );
}
