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
const artifactCache = new Map();
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
  if (checksum) {
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== checksum) {
      artifactCache.delete(url);
      throw new Error("Artifact checksum does not match the recorded evidence.");
    }
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
function enableEvidence() {
  for (const details of document.querySelectorAll("[data-evidence-url]")) {
    details.addEventListener("toggle", async () => {
      if (!details.open || details.dataset.loaded === "true") return;
      const status = details.querySelector(".evidence-status");
      status.textContent = "Loading preserved evidence…";
      try {
        const bytes = await artifact(details.dataset.evidenceUrl, details.dataset.sha256);
        details.querySelector("code").textContent = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
        details.dataset.loaded = "true";
        status.textContent = "Preserved artifact loaded. SHA-256 verified.";
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
        text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
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
        setTimeout(() => URL.revokeObjectURL(url), 60000);
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
  const selected = new Map();
  const tray = document.querySelector(".comparison-tray");
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  const search = filters.elements.namedItem("search");
  const provider = filters.elements.namedItem("provider");
  const sort = filters.elements.namedItem("sort");
  const reset = document.querySelector("[data-reset]");
  reset.hidden = false;
  const update = () => {
    const query = search.value.toLowerCase().trim();
    let count = 0;
    cards.sort((a, b) => {
      const primary =
        sort.value === "name"
          ? collator.compare(a.dataset.name, b.dataset.name)
          : (b.dataset.date ? Date.parse(b.dataset.date) : -Infinity) -
            (a.dataset.date ? Date.parse(a.dataset.date) : -Infinity);
      return primary || a.dataset.card.localeCompare(b.dataset.card, "en");
    });
    for (const card of cards) {
      card.hidden = !(
        (!provider.value || card.dataset.provider === provider.value) &&
        [card.dataset.name, card.dataset.identifier, card.dataset.provider].some((value) =>
          value.toLowerCase().includes(query),
        )
      );
      if (!card.hidden) count++;
      grid.append(card);
    }
    const filtered = query !== "" || provider.value !== "";
    filters.querySelector("[type='reset']").hidden = !filtered && sort.value === "newest";
    const status = document.querySelector("#results-status");
    status.hidden = !filtered;
    status.textContent = `${count} of ${cards.length} attempts`;
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
        for (const input of document.querySelectorAll("[data-select]"))
          if (input.value === id) input.checked = false;
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
    stage.append(image);
  } else stage.append(element("div", "Screenshot not captured", "placeholder"));
  const controls = element("div", undefined, "preview-controls");
  if (entry.preview.kind === "ready") {
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
async function enableComparison() {
  const form = document.querySelector("#compare-form");
  if (!form) return;
  const status = document.querySelector("#compare-status");
  let entries;
  try {
    const response = await fetch("/assets/runs.json");
    if (!response.ok) throw new Error("Run catalogue could not be loaded.");
    entries = await response.json();
  } catch (error) {
    status.textContent = `${error.message} Open individual run pages to inspect evidence.`;
    return;
  }
  const catalogue = new Map(entries.map((entry) => [entry.run.id, entry]));
  const left = form.elements.namedItem("left");
  const right = form.elements.namedItem("right");
  const both = document.querySelector("#run-both");
  const render = () => {
    for (const controller of previews.values()) controller.stop();
    previews.clear();
    const panels = document.querySelector("#compare-panels");
    panels.replaceChildren();
    const notices = document.querySelector("#condition-notices");
    notices.replaceChildren();
    both.hidden = true;
    const a = catalogue.get(left.value);
    const b = catalogue.get(right.value);
    if (!a || !b || a.run.id === b.run.id) {
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
      notice.append(element("p", "Generation conditions differ or are incomplete."));
      if (incomplete)
        notice.append(
          element(
            "p",
            "Some generation dates or agent conditions are unknown. Review each run's provenance.",
          ),
        );
      if (differences.length) {
        const list = element("ul");
        for (const difference of differences) list.append(element("li", difference));
        notice.append(list);
      }
      notices.append(notice);
    }
    for (const entry of [a, b]) {
      const panel = element("article", undefined, "compare-panel");
      panel.append(
        element("p", entry.run.provider, "eyebrow"),
        element("h2", entry.run.model.display_name),
      );
      const conditions = element(
        "p",
        `${entry.run.generation.mode} · ${entry.run.generation.interface} · ${entry.run.challenge_id}`,
        "muted",
      );
      const provenance = element("dl", undefined, "metadata");
      for (const [label, value] of [
        ["Harness", entry.run.generation.harness?.name ?? "Unknown"],
        ["Harness version", entry.run.generation.harness?.version ?? "Unknown"],
        ["Effort", entry.run.generation.harness?.effort ?? "Unknown"],
        ...entry.measurementRows,
      ]) {
        const row = element("div");
        row.append(element("dt", label), element("dd", value));
        provenance.append(row);
      }
      panel.append(conditions, provenance);
      const preview = comparePreview(entry);
      panel.append(preview);
      const link = element("a", "Inspect full evidence ↗");
      link.href = `/runs/${entry.run.id}/`;
      panel.append(link);
      panels.append(panel);
      setupPreview(preview);
    }
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
  resizePreviews();
  const observer = new ResizeObserver(resizePreviews);
  observer.observe(document.querySelector("main"));
} catch {
  announce(
    "Application controls are unavailable. Static pages and preserved evidence links remain readable.",
  );
}
