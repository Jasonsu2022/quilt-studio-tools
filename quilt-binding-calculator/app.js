import {
  PRESETS,
  STRIP_PRESETS,
  DEFAULTS,
  LARGE_DIMENSION_WARNING_INCHES,
  calculateBinding,
  cmToInches,
  parseFractionOrNumber,
  formatInchesDisplay,
  formatCmDisplay,
  formatInputFromInches
} from "./calculator.js";

const STORAGE_KEY = "qbc_state_v1";

let copy = null;
let state = { ...DEFAULTS };
let rawInputs = {
  width: null,
  length: null,
  customStrip: null,
  wof: null,
  extra: null,
  squaring: null,
  seam: null
};
let lastValidResult = null;
let isResultCardVisible = false;
let copyTimeout = null;

/* ==========================================================================
   Helpers
   ========================================================================== */

function getByPath(obj, path) {
  return path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

function interpolate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getInputUnit() {
  return state.unitMode === "metric" ? "cm" : "in";
}

function getBuyUnit() {
  return state.unitMode === "imperial" ? "yd" : "m";
}

function formatLen(inches, unit = getInputUnit()) {
  if (unit === "cm") {
    return `${formatCmDisplay(inches)} ${copy.units.cm}`;
  }
  return `${formatInchesDisplay(inches)}"`;
}

function formatBuyImperial(result) {
  const unitWord = result.buyYards > 1 ? copy.units.yards : copy.units.yard;
  return `${result.buyYardsLabel} ${unitWord}`;
}

function formatBuyImperialShort(result) {
  return `${result.buyYardsLabel} ${copy.units.yd}`;
}

function formatBuyMetric(result) {
  return `${result.buyMetresLabel} ${copy.units.m}`;
}

/* ==========================================================================
   State Persistence (localStorage)
   ========================================================================== */

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return;

    if (["imperial", "metric", "mixed"].includes(parsed.unitMode)) {
      state.unitMode = parsed.unitMode;
    }
    if (["straight", "bias"].includes(parsed.cutStyle)) {
      state.cutStyle = parsed.cutStyle;
    }
    if (["diagonal", "straight"].includes(parsed.joinType)) {
      state.joinType = parsed.joinType;
    }
    for (const key of ["width", "length", "stripWidth", "wof", "extra", "squaring", "seam"]) {
      if (typeof parsed[key] === "number" && Number.isFinite(parsed[key])) {
        state[key] = parsed[key];
      }
    }
    if (typeof parsed.isCustomStrip === "boolean") {
      state.isCustomStrip = parsed.isCustomStrip;
    }
  } catch {
    // Ignore storage errors
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function resetToDefaults() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
  state = { ...DEFAULTS };
  for (const k of Object.keys(rawInputs)) rawInputs[k] = null;
  syncInputsFromState();
  updateUI();
}

/* ==========================================================================
   Static Copy & Structural Rendering
   ========================================================================== */

function applyStaticI18n() {
  document.title = copy.meta.title;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", copy.meta.description);

  const unitSwitcher = document.getElementById("unitSwitcher");
  if (unitSwitcher) unitSwitcher.setAttribute("aria-label", copy.units.ariaLabel);

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = getByPath(copy, key);
    if (typeof val === "string") {
      el.textContent = val;
    }
  });
}

function renderTips() {
  const list = document.getElementById("tipsList");
  list.innerHTML = copy.tips.items
    .map(
      (item, idx) => `
      <li class="tip-item">
        <span class="tip-num" aria-hidden="true">${idx + 1}</span>
        <div>
          <div class="tip-title">${escapeHtml(item.title)}</div>
          <p class="tip-body">${escapeHtml(item.body)}</p>
        </div>
      </li>
    `
    )
    .join("");
}

function renderRecommendations() {
  const grid = document.getElementById("recGrid");
  grid.innerHTML = copy.recommendations.items
    .map(
      (item) => `
      <article class="rec-item">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.desc)}</p>
        </div>
        <a class="rec-link" href="${escapeHtml(item.href)}">${escapeHtml(item.cta)}</a>
      </article>
    `
    )
    .join("");
}

function renderSeoAndChart() {
  const seoBlocks = document.getElementById("seoBlocks");
  seoBlocks.innerHTML = copy.seo.sections
    .map(
      (sec) => `
      <div class="seo-block">
        <h2>${escapeHtml(sec.heading)}</h2>
        ${sec.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
      </div>
    `
    )
    .join("");

  const cols = copy.seo.chartColumns;
  const rows = PRESETS.map((preset) => {
    const res = calculateBinding({
      ...DEFAULTS,
      width: preset.width,
      length: preset.length
    });
    const name = copy.presets[preset.id];
    const dimText = `${preset.width}" × ${preset.length}"`;
    return `
      <tr>
        <td><strong>${escapeHtml(name)}</strong></td>
        <td>${escapeHtml(dimText)}</td>
        <td>${formatInchesDisplay(res.totalLength)}"</td>
        <td>${res.strips}</td>
        <td class="highlight-buy">${formatBuyImperialShort(res)}</td>
        <td>${formatBuyMetric(res)}</td>
      </tr>
    `;
  }).join("");

  const table = document.getElementById("quickChartTable");
  table.innerHTML = `
    <thead>
      <tr>
        <th>${escapeHtml(cols.size)}</th>
        <th>${escapeHtml(cols.dimensions)}</th>
        <th>${escapeHtml(cols.totalLength)}</th>
        <th>${escapeHtml(cols.strips)}</th>
        <th>${escapeHtml(cols.buyImperial)}</th>
        <th>${escapeHtml(cols.buyMetric)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderFaqAndJsonLd() {
  const faqList = document.getElementById("faqList");
  faqList.innerHTML = copy.faq.items
    .map(
      (item) => `
      <details class="faq-item">
        <summary>${escapeHtml(item.q)}</summary>
        <div class="faq-answer">${escapeHtml(item.a)}</div>
      </details>
    `
    )
    .join("");

  const existing = document.getElementById("faq-jsonld");
  if (existing) existing.remove();

  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faq.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a
      }
    }))
  };

  const script = document.createElement("script");
  script.id = "faq-jsonld";
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(ld);
  document.head.appendChild(script);
}

/* ==========================================================================
   Dynamic Controls Rendering
   ========================================================================== */

function getMatchingPresetId() {
  if (!Number.isFinite(state.width) || !Number.isFinite(state.length)) return null;
  for (const p of PRESETS) {
    if (Math.abs(state.width - p.width) < 1e-4 && Math.abs(state.length - p.length) < 1e-4) {
      return p.id;
    }
  }
  return null;
}

function renderPresets() {
  const grid = document.getElementById("presetGrid");
  const activeId = getMatchingPresetId();
  const unit = getInputUnit();

  document.getElementById("customPresetBadge").hidden = activeId !== null;

  grid.innerHTML = PRESETS.map((p) => {
    const label = copy.presets[p.id];
    const dim =
      unit === "cm"
        ? `${Math.round(p.width * 2.54)}×${Math.round(p.length * 2.54)} cm`
        : `${p.width}×${p.length}"`;
    const active = p.id === activeId;
    return `
      <button type="button" class="preset-btn" data-preset="${p.id}" aria-pressed="${active}">
        <span class="preset-name">${escapeHtml(label)}</span>
        <span class="preset-dim">${escapeHtml(dim)}</span>
      </button>
    `;
  }).join("");

  grid.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = PRESETS.find((p) => p.id === btn.dataset.preset);
      if (!preset) return;
      state.width = preset.width;
      state.length = preset.length;
      rawInputs.width = null;
      rawInputs.length = null;
      syncInputsFromState();
      saveState();
      updateUI();
    });
  });
}

function renderStripButtons() {
  const grid = document.getElementById("stripGrid");
  const unit = getInputUnit();

  const presetBtns = STRIP_PRESETS.map((val) => {
    const isSelected = !state.isCustomStrip && Math.abs(state.stripWidth - val) < 1e-4;
    const label = unit === "cm" ? `${formatCmDisplay(val)} cm` : `${formatInchesDisplay(val)}"`;
    const tag = val === 2.5 ? `<span class="strip-tag">${escapeHtml(copy.inputs.stripWidth.mostCommon)}</span>` : "";
    return `
      <button type="button" class="strip-btn" data-strip="${val}" aria-pressed="${isSelected}">
        <span>${escapeHtml(label)}</span>
        ${tag}
      </button>
    `;
  }).join("");

  const customBtn = `
    <button type="button" class="strip-btn" data-strip="custom" aria-pressed="${state.isCustomStrip}">
      <span>${escapeHtml(copy.inputs.stripWidth.custom)}</span>
    </button>
  `;

  grid.innerHTML = presetBtns + customBtn;
  document.getElementById("customStripDrawer").hidden = !state.isCustomStrip;

  grid.querySelectorAll(".strip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.strip === "custom") {
        state.isCustomStrip = true;
        rawInputs.customStrip = null;
        syncInputsFromState();
        saveState();
        updateUI();
        document.getElementById("inputCustomStrip").focus();
      } else {
        state.isCustomStrip = false;
        state.stripWidth = Number(btn.dataset.strip);
        rawInputs.customStrip = null;
        syncInputsFromState();
        saveState();
        updateUI();
      }
    });
  });
}

function syncInputsFromState() {
  const unit = getInputUnit();
  const map = [
    ["inputWidth", "width", "width"],
    ["inputLength", "length", "length"],
    ["inputCustomStrip", "stripWidth", "customStrip"],
    ["inputWof", "wof", "wof"],
    ["inputExtra", "extra", "extra"],
    ["inputSquaring", "squaring", "squaring"],
    ["inputSeam", "seam", "seam"]
  ];

  for (const [elId, stateKey, rawKey] of map) {
    const el = document.getElementById(elId);
    if (!el) continue;
    if (rawInputs[rawKey] !== null) {
      el.value = rawInputs[rawKey];
    } else {
      el.value = formatInputFromInches(state[stateKey], unit);
    }
  }

  const suffixText = unit === "cm" ? copy.units.cm : copy.units.in;
  document.querySelectorAll("[data-unit-suffix]").forEach((el) => {
    el.textContent = suffixText;
  });
}

function updateToggleStates() {
  document.querySelectorAll(".unit-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.unit === state.unitMode));
  });

  document.querySelectorAll(".cut-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.cutStyle === state.cutStyle));
  });

  document.querySelectorAll(".join-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.joinType === state.joinType));
  });

  const joinField = document.getElementById("joinMethodField");
  joinField.hidden = state.cutStyle !== "straight";

  const seamDrawer = document.getElementById("seamDrawer");
  seamDrawer.hidden = state.joinType !== "straight";

  const advExpanded = document.getElementById("advancedToggle").getAttribute("aria-expanded") === "true";
  document.getElementById("advancedActionPill").textContent = advExpanded
    ? copy.advanced.done
    : copy.advanced.edit;

  const wofText = Number.isFinite(state.wof) ? formatLen(state.wof) : "—";
  const extraText = Number.isFinite(state.extra) ? formatLen(state.extra) : "—";
  const squaringText = Number.isFinite(state.squaring) ? formatLen(state.squaring) : "—";

  let summaryText;
  if (state.cutStyle === "bias") {
    summaryText = interpolate(copy.advanced.summaryBiasTemplate, {
      wof: wofText,
      extra: extraText,
      squaring: squaringText
    });
  } else {
    const joinLabel =
      state.joinType === "diagonal"
        ? copy.advanced.diagonal
        : `${copy.advanced.straight} (${Number.isFinite(state.seam) ? formatLen(state.seam) : "—"})`;
    summaryText = interpolate(copy.advanced.summaryTemplate, {
      wof: wofText,
      extra: extraText,
      join: joinLabel,
      squaring: squaringText
    });
  }
  document.getElementById("advancedSummary").textContent = summaryText;
}

/* ==========================================================================
   Field-Level Validation & Large-Dimension Warning
   ========================================================================== */

function applyFieldErrors(fieldErrors) {
  const fields = [
    { key: "width", inputId: "inputWidth", errId: "errWidth" },
    { key: "length", inputId: "inputLength", errId: "errLength" },
    { key: "stripWidth", inputId: "inputCustomStrip", errId: "errCustomStrip" },
    { key: "wof", inputId: "inputWof", errId: "errWof" },
    { key: "extra", inputId: "inputExtra", errId: "errExtra" },
    { key: "squaring", inputId: "inputSquaring", errId: "errSquaring" },
    { key: "seam", inputId: "inputSeam", errId: "errSeam" }
  ];

  for (const f of fields) {
    const input = document.getElementById(f.inputId);
    const errEl = document.getElementById(f.errId);
    const errKey = fieldErrors[f.key];
    if (errKey) {
      if (input) {
        input.classList.add("is-invalid");
        input.setAttribute("aria-invalid", "true");
      }
      if (errEl) {
        errEl.textContent = copy.validation[errKey] || copy.validation.positiveNumber;
        errEl.hidden = false;
      }
    } else {
      if (input) {
        input.classList.remove("is-invalid");
        input.removeAttribute("aria-invalid");
      }
      if (errEl) {
        errEl.textContent = "";
        errEl.hidden = true;
      }
    }
  }

  // Gentle non-blocking warning if width or length > 150"
  const warnEl = document.getElementById("dimWarning");
  const isLarge =
    (Number.isFinite(state.width) && state.width > LARGE_DIMENSION_WARNING_INCHES) ||
    (Number.isFinite(state.length) && state.length > LARGE_DIMENSION_WARNING_INCHES);
  if (warnEl) {
    warnEl.textContent = isLarge ? copy.warnings.largeDimension : "";
    warnEl.hidden = !isLarge;
  }
}

function updateStickyBarVisibility() {
  const bar = document.getElementById("stickyResultBar");
  if (!bar) return;
  bar.hidden = !lastValidResult || isResultCardVisible;
}

/* ==========================================================================
   Dynamic SVG Cutting Diagram
   ========================================================================== */

function buildStraightSvg(result) {
  const unit = getInputUnit();
  const wofLabel = interpolate(copy.diagram.wofLabel, { wof: formatLen(state.wof, unit) });
  const stripLabel = formatLen(state.stripWidth, unit);
  const squaringLabel = interpolate(copy.diagram.squaringLabel, {
    squaring: formatLen(state.squaring, unit)
  });

  const maxDirect = 10;
  const isCollapsed = result.strips > maxDirect;
  const rows = [];

  if (!isCollapsed) {
    for (let i = 0; i < result.strips; i++) {
      rows.push({ type: "strip", index: i });
    }
  } else {
    for (let i = 0; i < 4; i++) {
      rows.push({ type: "strip", index: i });
    }
    rows.push({ type: "collapsed", total: result.strips });
    for (let i = result.strips - 3; i < result.strips; i++) {
      rows.push({ type: "strip", index: i });
    }
  }

  const stripH = 26;
  const collapsedH = 30;
  const hasSquaring = state.squaring > 0;
  const squaringH = hasSquaring ? 28 : 0;

  const padX = 24;
  const topY = 42;
  const rectW = 352;
  let currentY = topY;

  let bodySvg = "";
  rows.forEach((row) => {
    if (row.type === "strip") {
      const isEven = row.index % 2 === 0;
      const fill = isEven ? "#2D5A4C" : "#D8BC96";
      const textFill = isEven ? "#FFFFFF" : "#241D18";
      bodySvg += `
        <rect x="${padX}" y="${currentY}" width="${rectW}" height="${stripH}" fill="${fill}" stroke="#241D18" stroke-width="1.5" />
        <text x="${padX + 12}" y="${currentY + 18}" fill="${textFill}" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700">#${row.index + 1}</text>
        <text x="${padX + rectW / 2}" y="${currentY + 18}" text-anchor="middle" fill="${textFill}" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600">${escapeHtml(stripLabel)}</text>
      `;
      currentY += stripH;
    } else {
      const collapsedText = interpolate(copy.diagram.collapsedLabel, { strips: row.total });
      bodySvg += `
        <rect x="${padX}" y="${currentY}" width="${rectW}" height="${collapsedH}" fill="#FAF7F2" stroke="#241D18" stroke-width="1.5" stroke-dasharray="5 4" />
        <text x="${padX + rectW / 2}" y="${currentY + 20}" text-anchor="middle" fill="#241D18" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700">${escapeHtml(collapsedText)}</text>
      `;
      currentY += collapsedH;
    }
  });

  if (hasSquaring) {
    bodySvg += `
      <rect x="${padX}" y="${currentY}" width="${rectW}" height="${squaringH}" fill="url(#squaringHatch)" stroke="#241D18" stroke-width="1.5" />
      <rect x="${padX + rectW / 2 - 76}" y="${currentY + 5}" width="152" height="18" rx="4" fill="#FAF7F2" fill-opacity="0.92" />
      <text x="${padX + rectW / 2}" y="${currentY + 18}" text-anchor="middle" fill="#241D18" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700">${escapeHtml(squaringLabel)}</text>
    `;
    currentY += squaringH;
  }

  const totalH = currentY + 16;

  return `
    <svg viewBox="0 0 400 ${totalH}" role="img" aria-label="${escapeHtml(wofLabel)}">
      <defs>
        <pattern id="squaringHatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#EAE2D6" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="#C8B9A6" stroke-width="4" />
        </pattern>
      </defs>
      <line x1="${padX}" y1="26" x2="${padX + rectW}" y2="26" stroke="#241D18" stroke-width="1.5" />
      <line x1="${padX}" y1="20" x2="${padX}" y2="32" stroke="#241D18" stroke-width="1.5" />
      <line x1="${padX + rectW}" y1="20" x2="${padX + rectW}" y2="32" stroke="#241D18" stroke-width="1.5" />
      <rect x="${padX + rectW / 2 - 84}" y="14" width="168" height="22" rx="4" fill="#FAF7F2" />
      <text x="${padX + rectW / 2}" y="29" text-anchor="middle" fill="#241D18" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="700">${escapeHtml(wofLabel)}</text>
      ${bodySvg}
    </svg>
  `;
}

function buildBiasSvg(result) {
  const unit = getInputUnit();
  const sqText = formatLen(result.biasSquareInches, unit);
  const stripLabel = interpolate(copy.diagram.biasStripLabel, {
    stripWidth: formatLen(state.stripWidth, unit)
  });

  const x = 90;
  const y = 46;
  const size = 220;

  const diagLines = [];
  for (let offset = -size + 28; offset < size; offset += 28) {
    diagLines.push(
      `<line x1="${x + offset}" y1="${y + size}" x2="${x + offset + size}" y2="${y}" stroke="#2D5A4C" stroke-width="1.5" stroke-dasharray="6 4" />`
    );
  }

  return `
    <svg viewBox="0 0 400 300" role="img" aria-label="${escapeHtml(sqText)} × ${escapeHtml(sqText)}">
      <defs>
        <clipPath id="biasSquareClip">
          <rect x="${x}" y="${y}" width="${size}" height="${size}" />
        </clipPath>
      </defs>

      <line x1="${x}" y1="26" x2="${x + size}" y2="26" stroke="#241D18" stroke-width="1.5" />
      <line x1="${x}" y1="20" x2="${x}" y2="32" stroke="#241D18" stroke-width="1.5" />
      <line x1="${x + size}" y1="20" x2="${x + size}" y2="32" stroke="#241D18" stroke-width="1.5" />
      <rect x="${x + size / 2 - 42}" y="14" width="84" height="22" rx="4" fill="#FAF7F2" />
      <text x="${x + size / 2}" y="29" text-anchor="middle" fill="#241D18" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="700">${escapeHtml(sqText)}</text>

      <line x1="68" y1="${y}" x2="68" y2="${y + size}" stroke="#241D18" stroke-width="1.5" />
      <line x1="62" y1="${y}" x2="74" y2="${y}" stroke="#241D18" stroke-width="1.5" />
      <line x1="62" y1="${y + size}" x2="74" y2="${y + size}" stroke="#241D18" stroke-width="1.5" />
      <text x="58" y="${y + size / 2 + 5}" text-anchor="end" fill="#241D18" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="700">${escapeHtml(sqText)}</text>

      <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#F3E7D3" stroke="#241D18" stroke-width="2" />

      <g clip-path="url(#biasSquareClip)">
        ${diagLines.join("")}
        <polygon points="${x},${y + size - 16} ${x + size - 16},${y} ${x + size},${y} ${x + size},${y + 16} ${x + 16},${y + size} ${x},${y + size}" fill="#2D5A4C" fill-opacity="0.22" />
      </g>

      <g transform="translate(${x + size / 2}, ${y + size / 2}) rotate(-45)">
        <rect x="-72" y="-14" width="144" height="28" rx="6" fill="#2D5A4C" stroke="#241D18" stroke-width="1.2" />
        <text x="0" y="5" text-anchor="middle" fill="#FFFFFF" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700">${escapeHtml(stripLabel)}</text>
      </g>

      <text x="${x + size - 10}" y="${y + size - 10}" text-anchor="end" fill="#241D18" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700">45° bias</text>
    </svg>
  `;
}

/* ==========================================================================
   Results, Sticky Bar & Print Card Rendering
   ========================================================================== */

function updateUI() {
  renderPresets();
  renderStripButtons();
  updateToggleStates();

  const res = calculateBinding(state);
  applyFieldErrors(res.fieldErrors || {});

  const errorEl = document.getElementById("resultError");
  const validEl = document.getElementById("resultValid");
  const diagramCard = document.getElementById("diagramCard");

  if (!res.valid) {
    lastValidResult = null;
    errorEl.textContent = copy.validation[res.errorKey] || copy.validation.positiveNumber;
    errorEl.hidden = false;
    validEl.hidden = true;
    diagramCard.hidden = true;
    updateStickyBarVisibility();
    return;
  }

  lastValidResult = res;
  errorEl.hidden = true;
  validEl.hidden = false;
  diagramCard.hidden = false;

  const inputUnit = getInputUnit();
  const buyUnit = getBuyUnit();

  const primaryBuy = buyUnit === "yd" ? formatBuyImperial(res) : formatBuyMetric(res);
  const primaryBuyShort = buyUnit === "yd" ? formatBuyImperialShort(res) : formatBuyMetric(res);
  const altBuy = buyUnit === "yd" ? formatBuyMetric(res) : formatBuyImperialShort(res);

  document.getElementById("buyValue").textContent = primaryBuy;

  const altBuyNote =
    buyUnit === "yd"
      ? interpolate(copy.results.altBuyMetric, { altBuy })
      : interpolate(copy.results.altBuyImperial, { altBuy });

  const squaringStr = formatLen(state.squaring, inputUnit);
  const buySubText =
    state.squaring > 0
      ? `${altBuyNote} · ${interpolate(copy.results.includesSquaring, { squaring: squaringStr })}`
      : altBuyNote;
  document.getElementById("buySub").textContent = buySubText;

  const roundingText =
    buyUnit === "yd" ? copy.results.roundingImperial : copy.results.roundingMetric;
  document.getElementById("buyRounding").textContent = roundingText;

  // Natural-language Cutting Instruction
  const stripWidthStr = formatLen(state.stripWidth, inputUnit);
  const wofStr = formatLen(state.wof, inputUnit);
  let instructionHtml = "";

  if (res.cutStyle === "straight") {
    const stripWord = res.strips === 1 ? copy.results.stripSingular : copy.results.stripPlural;
    instructionHtml = interpolate(copy.results.instructionStraight, {
      strips: res.strips,
      stripWord,
      stripWidth: stripWidthStr,
      wof: wofStr
    });
  } else {
    const squareStr = formatLen(res.biasSquareInches, inputUnit);
    if (res.panels > 1) {
      instructionHtml = interpolate(copy.results.instructionBiasPieced, {
        square: squareStr,
        wof: wofStr,
        panels: res.panels,
        stripWidth: stripWidthStr
      });
    } else {
      instructionHtml = interpolate(copy.results.instructionBias, {
        square: squareStr,
        stripWidth: stripWidthStr
      });
    }
  }
  document.getElementById("cuttingInstruction").innerHTML = instructionHtml;

  // 3-cell Breakdown
  const totalBindingVal = formatLen(res.totalLength, inputUnit);
  const totalBindingSub = interpolate(copy.results.totalBindingSub, {
    perimeter: formatLen(res.perimeter, inputUnit),
    extra: formatLen(res.extra, inputUnit)
  });

  const exactFabricVal = formatLen(res.fabricInches, inputUnit);
  let exactFabricSub;
  if (res.cutStyle === "straight") {
    exactFabricSub = interpolate(copy.results.exactFabricSub, {
      netFabric: formatLen(res.stripsFabricInches, inputUnit),
      squaring: squaringStr
    });
  } else if (res.panels > 1) {
    exactFabricSub = interpolate(copy.results.exactFabricSubBiasPieced, {
      panels: res.panels,
      square: formatLen(res.biasSquareInches, inputUnit),
      squaring: squaringStr
    });
  } else {
    exactFabricSub = interpolate(copy.results.exactFabricSubBias, {
      square: formatLen(res.biasSquareInches, inputUnit),
      squaring: squaringStr
    });
  }

  let countLabel, countVal, countSub, stickyDetail;
  if (res.cutStyle === "straight") {
    const stripWord = res.strips === 1 ? copy.results.stripSingular : copy.results.stripPlural;
    countLabel = copy.results.stripsLabel;
    countVal = `${res.strips} ${stripWord}`;
    countSub = interpolate(copy.results.stripsSub, { stripWidth: stripWidthStr });
    stickyDetail = countVal;
  } else {
    const sqStr = formatLen(res.biasSquareInches, inputUnit);
    countLabel = copy.results.squareLabel;
    countVal = `${sqStr} × ${sqStr}`;
    countSub =
      res.panels > 1
        ? interpolate(copy.results.squareSubPieced, { panels: res.panels })
        : copy.results.squareSub;
    stickyDetail = `${sqStr} × ${sqStr} sq`;
  }

  document.getElementById("bdTotalVal").textContent = totalBindingVal;
  document.getElementById("bdTotalSub").textContent = totalBindingSub;
  document.getElementById("bdFabricVal").textContent = exactFabricVal;
  document.getElementById("bdFabricSub").textContent = exactFabricSub;
  document.getElementById("bdCountLabel").textContent = countLabel;
  document.getElementById("bdCountVal").textContent = countVal;
  document.getElementById("bdCountSub").textContent = countSub;

  // Mobile sticky bar content
  document.getElementById("stickyBarText").innerHTML = `${escapeHtml(copy.stickyBar.buyPrefix)} <span class="sticky-bar-buy">${escapeHtml(primaryBuyShort)}</span> · ${escapeHtml(stickyDetail)}`;
  updateStickyBarVisibility();

  // Diagram
  const svgMarkup = res.cutStyle === "straight" ? buildStraightSvg(res) : buildBiasSvg(res);
  document.getElementById("diagramStage").innerHTML = svgMarkup;

  // Sync Print Cutting Card
  syncPrintCard({
    primaryBuy,
    buySubText: `${buySubText} · ${roundingText}`,
    instructionHtml,
    totalBindingVal,
    totalBindingSub,
    exactFabricVal,
    exactFabricSub,
    countLabel,
    countVal,
    countSub,
    svgMarkup
  });
}

function syncPrintCard(data) {
  const inputUnit = getInputUnit();
  const sizeText = `${formatLen(state.width, inputUnit)} × ${formatLen(state.length, inputUnit)}`;
  const styleText =
    state.cutStyle === "straight"
      ? copy.inputs.cutStyle.straight
      : copy.inputs.cutStyle.bias;

  document.getElementById("printCardTitle").textContent = copy.printCard.title;
  document.getElementById("printProjectLabel").textContent = copy.printCard.projectLabel;
  document.getElementById("printDateLabel").textContent = copy.printCard.dateLabel;
  document.getElementById("printMetaRow").innerHTML = `
    <span><strong>${escapeHtml(copy.printCard.quiltSpecLabel)}</strong> ${escapeHtml(sizeText)}</span>
    <span><strong>${escapeHtml(copy.printCard.cutStyleLabel)}</strong> ${escapeHtml(styleText)}</span>
  `;

  document.getElementById("printBuyLabel").textContent = copy.results.buyHeading;
  document.getElementById("printBuyValue").textContent = data.primaryBuy;
  document.getElementById("printBuySub").textContent = data.buySubText;
  document.getElementById("printInstruction").innerHTML = data.instructionHtml;

  document.getElementById("printBreakdown").innerHTML = `
    <div class="print-breakdown-cell">
      <div class="print-breakdown-label">${escapeHtml(copy.results.totalBinding)}</div>
      <div class="print-breakdown-val">${escapeHtml(data.totalBindingVal)}</div>
      <div class="print-breakdown-sub">${escapeHtml(data.totalBindingSub)}</div>
    </div>
    <div class="print-breakdown-cell">
      <div class="print-breakdown-label">${escapeHtml(copy.results.exactFabric)}</div>
      <div class="print-breakdown-val">${escapeHtml(data.exactFabricVal)}</div>
      <div class="print-breakdown-sub">${escapeHtml(data.exactFabricSub)}</div>
    </div>
    <div class="print-breakdown-cell">
      <div class="print-breakdown-label">${escapeHtml(data.countLabel)}</div>
      <div class="print-breakdown-val">${escapeHtml(data.countVal)}</div>
      <div class="print-breakdown-sub">${escapeHtml(data.countSub)}</div>
    </div>
  `;

  document.getElementById("printDiagramWrap").innerHTML = data.svgMarkup;
  document.getElementById("printFooter").textContent = copy.printCard.footer;
}

/* ==========================================================================
   Copy Plan & Print Actions
   ========================================================================== */

function buildPlainTextPlan() {
  if (!lastValidResult) return "";
  const res = lastValidResult;
  const inputUnit = getInputUnit();
  const buyUnit = getBuyUnit();

  const size = `${formatLen(state.width, inputUnit)} × ${formatLen(state.length, inputUnit)}`;
  const buy = buyUnit === "yd" ? formatBuyImperial(res) : formatBuyMetric(res);
  const altBuy = buyUnit === "yd" ? formatBuyMetric(res) : formatBuyImperialShort(res);
  const altBuyNote =
    buyUnit === "yd"
      ? interpolate(copy.results.altBuyMetric, { altBuy })
      : interpolate(copy.results.altBuyImperial, { altBuy });
  const stripWidth = formatLen(state.stripWidth, inputUnit);
  const wof = formatLen(state.wof, inputUnit);
  const totalBinding = formatLen(res.totalLength, inputUnit);
  const exactFabric = formatLen(res.fabricInches, inputUnit);
  const squaring = formatLen(state.squaring, inputUnit);

  if (res.cutStyle === "straight") {
    const stripWord = res.strips === 1 ? copy.results.stripSingular : copy.results.stripPlural;
    return interpolate(copy.actions.copyTemplateStraight, {
      size,
      buy,
      altBuyNote,
      strips: res.strips,
      stripWord,
      stripWidth,
      wof,
      totalBinding,
      exactFabric,
      squaring
    });
  }

  const square = formatLen(res.biasSquareInches, inputUnit);
  if (res.panels > 1) {
    return interpolate(copy.actions.copyTemplateBiasPieced, {
      size,
      buy,
      altBuyNote,
      panels: res.panels,
      wof,
      square,
      stripWidth,
      totalBinding,
      exactFabric,
      squaring
    });
  }

  return interpolate(copy.actions.copyTemplateBias, {
    size,
    buy,
    altBuyNote,
    square,
    stripWidth,
    totalBinding,
    exactFabric,
    squaring
  });
}

async function handleCopyPlan() {
  const text = buildPlainTextPlan();
  if (!text) return;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }

    const btn = document.getElementById("btnCopy");
    btn.textContent = copy.actions.copied;
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      btn.textContent = copy.actions.copyPlan;
    }, 1800);
  } catch {
    // Silent fallback
  }
}

/* ==========================================================================
   Event Wiring & Sticky Observer
   ========================================================================== */

function bindNumericInput(elId, stateKey, rawKey) {
  const el = document.getElementById(elId);
  el.addEventListener("input", () => {
    rawInputs[rawKey] = el.value;
    const isInches = getInputUnit() === "in";
    const parsed = parseFractionOrNumber(el.value, isInches);
    if (Number.isFinite(parsed)) {
      state[stateKey] = isInches ? parsed : cmToInches(parsed);
      saveState();
    } else {
      state[stateKey] = NaN;
    }
    updateUI();
  });

  el.addEventListener("blur", () => {
    if (Number.isFinite(state[stateKey])) {
      // Keep user's readable fraction text if they typed one; otherwise normalize cleanly
      const raw = rawInputs[rawKey];
      if (!raw || !raw.includes("/")) {
        rawInputs[rawKey] = null;
        el.value = formatInputFromInches(state[stateKey], getInputUnit());
      }
    }
  });
}

function setupStickyObserver() {
  const resultCard = document.getElementById("resultCard");
  if (!resultCard || typeof IntersectionObserver === "undefined") return;

  const observer = new IntersectionObserver(
    (entries) => {
      isResultCardVisible = entries.some((e) => e.isIntersecting);
      updateStickyBarVisibility();
    },
    { threshold: 0.12 }
  );
  observer.observe(resultCard);
}

function bindEvents() {
  // Unit switcher — NEVER mutates internal inches
  document.querySelectorAll(".unit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextMode = btn.dataset.unit;
      if (nextMode === state.unitMode) return;
      state.unitMode = nextMode;
      for (const k of Object.keys(rawInputs)) rawInputs[k] = null;
      syncInputsFromState();
      saveState();
      updateUI();
    });
  });

  // Cut style
  document.querySelectorAll(".cut-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.cutStyle = btn.dataset.cutStyle;
      saveState();
      updateUI();
    });
  });

  // Join type
  document.querySelectorAll(".join-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.joinType = btn.dataset.joinType;
      saveState();
      updateUI();
    });
  });

  // Advanced accordion
  const advToggle = document.getElementById("advancedToggle");
  const advPanel = document.getElementById("advancedPanel");
  advToggle.addEventListener("click", () => {
    const expanded = advToggle.getAttribute("aria-expanded") === "true";
    advToggle.setAttribute("aria-expanded", String(!expanded));
    advPanel.hidden = expanded;
    updateToggleStates();
  });

  // Reset to defaults
  const btnReset = document.getElementById("btnReset");
  if (btnReset) {
    btnReset.addEventListener("click", resetToDefaults);
  }

  // Sticky bar smooth scroll to Result Card
  const stickyBar = document.getElementById("stickyResultBar");
  if (stickyBar) {
    stickyBar.addEventListener("click", () => {
      const rc = document.getElementById("resultCard");
      if (rc) rc.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Numeric inputs
  bindNumericInput("inputWidth", "width", "width");
  bindNumericInput("inputLength", "length", "length");
  bindNumericInput("inputCustomStrip", "stripWidth", "customStrip");
  bindNumericInput("inputWof", "wof", "wof");
  bindNumericInput("inputExtra", "extra", "extra");
  bindNumericInput("inputSquaring", "squaring", "squaring");
  bindNumericInput("inputSeam", "seam", "seam");

  // Print & Copy
  document.getElementById("btnPrint").addEventListener("click", () => {
    window.print();
  });
  document.getElementById("btnCopy").addEventListener("click", handleCopyPlan);
}

/* ==========================================================================
   Bootstrap
   ========================================================================== */

async function init() {
  const resp = await fetch("./en.json");
  copy = await resp.json();

  loadState();
  applyStaticI18n();
  renderTips();
  renderRecommendations();
  renderSeoAndChart();
  renderFaqAndJsonLd();
  bindEvents();
  setupStickyObserver();
  syncInputsFromState();
  updateUI();
}

init();
