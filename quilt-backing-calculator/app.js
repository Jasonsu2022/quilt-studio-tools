import {
  PRESETS,
  FABRIC_WIDTH_PRESETS,
  DEFAULTS,
  calculateBacking,
  cmToInches,
  parseFractionOrNumber,
  formatInchesDisplay,
  formatCmDisplay,
  formatInputFromInches
} from "./calculator.js?v=1.3";

const STORAGE_KEY = "qbk_state_v1";

let copy = null;
let state = { ...DEFAULTS, isCustomFabricWidth: false };
let rawInputs = {
  width: null,
  length: null,
  fabricWidth: null,
  overage: null,
  selvageDeduction: null
};
let lastValidResult = null;
let isResultCardVisible = false;
let copyTimeout = null;

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

function formatMeasure(inches) {
  if (getInputUnit() === "cm") {
    return `${formatCmDisplay(inches)} ${copy.units.cm}`;
  }
  return `${formatInchesDisplay(inches)}"`;
}

function formatDualMeasure(inches) {
  return `${formatInchesDisplay(inches)}" (${formatCmDisplay(inches)} cm)`;
}

function formatPrimaryBuy(plan) {
  if (getBuyUnit() === "yd") {
    const unitWord = plan.buyYards > 1 ? copy.units.yards : copy.units.yard;
    return `${plan.buyYardsLabel} ${unitWord}`;
  }
  return `${plan.buyMetresLabel} ${copy.units.m}`;
}

function formatAltBuy(plan) {
  if (getBuyUnit() === "yd") {
    return `${plan.buyMetresLabel} ${copy.units.m}`;
  }
  const unitWord = plan.buyYards > 1 ? copy.units.yards : copy.units.yard;
  return `${plan.buyYardsLabel} ${unitWord}`;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors in private browsing
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state = { ...DEFAULTS, isCustomFabricWidth: false, ...parsed };
      const matchesPreset = FABRIC_WIDTH_PRESETS.some(
        (v) => Math.abs(v - state.fabricWidth) < 1e-6
      );
      if (!matchesPreset) {
        state.isCustomFabricWidth = true;
      }
    }
  } catch {
    state = { ...DEFAULTS, isCustomFabricWidth: false };
  }
}

function showFieldError(inputId, errId, msgKey) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errId);
  if (!input || !errEl) return;
  if (msgKey) {
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    errEl.textContent = copy.validation[msgKey] || msgKey;
    errEl.hidden = false;
  } else {
    input.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
    errEl.textContent = "";
    errEl.hidden = true;
  }
}

function renderUnitButtons() {
  document.querySelectorAll(".unit-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.unit === state.unitMode));
  });
  const suffix = getInputUnit();
  document.querySelectorAll("[data-unit-suffix]").forEach((el) => {
    el.textContent = suffix;
  });
}

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
  if (!grid || !copy) return;
  const activeId = getMatchingPresetId();
  const unit = getInputUnit();

  const badge = document.getElementById("customPresetBadge");
  if (badge) badge.hidden = activeId !== null;

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
      syncAllInputsFromState();
      recalculate();
    });
  });
}

function renderFabricWidthButtons() {
  const matchesPreset = FABRIC_WIDTH_PRESETS.some(
    (v) => Math.abs(v - state.fabricWidth) < 1e-6
  );
  const showCustom = Boolean(state.isCustomFabricWidth || !matchesPreset);
  document.querySelectorAll("[data-wof]").forEach((btn) => {
    const val = btn.dataset.wof;
    const pressed =
      val === "custom"
        ? showCustom
        : !showCustom && Math.abs(Number(val) - state.fabricWidth) < 1e-6;
    btn.setAttribute("aria-pressed", String(pressed));
  });
  const drawer = document.getElementById("wofCustomDrawer");
  if (drawer) {
    drawer.hidden = !showCustom;
  }
}

function renderOverageButtons() {
  document.querySelectorAll("[data-method]").forEach((btn) => {
    btn.setAttribute(
      "aria-pressed",
      String(btn.dataset.method === state.quiltingMethod)
    );
  });
}

function renderAdvancedSummary() {
  const summaryEl = document.getElementById("advancedSummary");
  if (!summaryEl) return;
  const usable = Math.max(0, state.fabricWidth - state.selvageDeduction);
  summaryEl.textContent = interpolate(copy.advanced.summaryTemplate, {
    selvage: formatMeasure(state.selvageDeduction),
    usable: formatMeasure(usable)
  });
}

function syncAllInputsFromState() {
  const unit = getInputUnit();
  const wEl = document.getElementById("inputWidth");
  const lEl = document.getElementById("inputLength");
  const wofEl = document.getElementById("inputFabricWidth");
  const ovEl = document.getElementById("inputOverage");
  const selEl = document.getElementById("inputSelvage");
  const dirEl = document.getElementById("inputDirectional");

  if (wEl && rawInputs.width === null) wEl.value = formatInputFromInches(state.width, unit);
  if (lEl && rawInputs.length === null) lEl.value = formatInputFromInches(state.length, unit);
  if (wofEl && rawInputs.fabricWidth === null)
    wofEl.value = formatInputFromInches(state.fabricWidth, unit);
  if (ovEl && rawInputs.overage === null)
    ovEl.value = formatInputFromInches(state.overage, unit);
  if (selEl && rawInputs.selvageDeduction === null)
    selEl.value = formatInputFromInches(state.selvageDeduction, unit);
  if (dirEl) dirEl.checked = Boolean(state.isDirectional);

  renderUnitButtons();
  renderPresets();
  renderFabricWidthButtons();
  renderOverageButtons();
  renderAdvancedSummary();
}

export function buildBackingSvgString(res, copyObj, inputUnit) {
  const d = res.diagram;
  const fmt = (inches) =>
    inputUnit === "cm"
      ? `${formatCmDisplay(inches)} cm`
      : `${formatInchesDisplay(inches)}"`;

  // Target drawing box inside SVG viewBox
  const vbW = 460;
  const vbH = 300;
  const padLeft = 56;
  const padTop = 36;
  const padRight = 32;
  const padBottom = 46;
  const maxDrawW = vbW - padLeft - padRight;
  const maxDrawH = vbH - padTop - padBottom;

  const scale = Math.min(
    maxDrawW / d.backingWidth,
    maxDrawH / d.backingLength
  );
  const drawW = d.backingWidth * scale;
  const drawH = d.backingLength * scale;
  const ox = padLeft + (maxDrawW - drawW) / 2;
  const oy = padTop + (maxDrawH - drawH) / 2;

  const panelsSvg = d.panels
    .map((p) => {
      const px = ox + p.x * scale;
      const py = oy + p.y * scale;
      const pw = p.drawWidth * scale;
      const ph = p.drawHeight * scale;
      const rectSvg = `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="#E8F0EC" stroke="#2B5447" stroke-width="1.5" />`;
      if (d.panels.length === 1) {
        const label = `${fmt(p.cutWidth)} usable width`;
        const labelX = ox + drawW / 2;
        const labelY = Math.max(16, oy - 10);
        return (
          rectSvg +
          `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#2B5447">${escapeHtml(label)}</text>`
        );
      }
      const label = `P${p.index} (${fmt(p.cutWidth)})`;
      const showLabel = pw > 52 && ph > 24;
      const labelX = px + pw / 2;
      const labelY =
        d.orientation === "vertical" ? py + 16 : py + ph / 2 + 4;
      return (
        rectSvg +
        (showLabel
          ? `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="600" fill="#2B5447">${escapeHtml(label)}</text>`
          : "")
      );
    })
    .join("");

  const seamsSvg = d.seams
    .map((s) => {
      const x1 = ox + s.x1 * scale;
      const y1 = oy + s.y1 * scale;
      const x2 = ox + s.x2 * scale;
      const y2 = oy + s.y2 * scale;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#B54A28" stroke-width="2.2" stroke-dasharray="6 4" />`;
    })
    .join("");

  const q = d.quiltTopRect;
  const qx = ox + q.x * scale;
  const qy = oy + q.y * scale;
  const qw = q.width * scale;
  const qh = q.height * scale;

  const quiltTopSvg = `
    <rect x="${qx.toFixed(1)}" y="${qy.toFixed(1)}" width="${qw.toFixed(1)}" height="${qh.toFixed(1)}" fill="rgba(255,255,255,0.45)" stroke="#241D18" stroke-width="1.6" stroke-dasharray="5 4" rx="2" />
    <text x="${(qx + qw / 2).toFixed(1)}" y="${(qy + qh / 2 - 4).toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#241D18">Quilt Top</text>
    <text x="${(qx + qw / 2).toFixed(1)}" y="${(qy + qh / 2 + 12).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#52473E">${escapeHtml(fmt(q.width))} × ${escapeHtml(fmt(q.height))}</text>
  `;

  // Total width callout (bottom) & total length callout (left)
  const dimBottomY = oy + drawH + 22;
  const dimLeftX = ox - 16;
  const modeText =
    d.layoutMode === "single"
      ? copyObj.results.orientationSingle
      : d.layoutMode === "vertical"
        ? copyObj.results.orientationVertical
        : copyObj.results.orientationHorizontal;
  const altText = interpolate(copyObj.diagram.altTemplate, {
    mode: modeText,
    panels: d.panelCount,
    bw: fmt(d.backingWidth),
    bl: fmt(d.backingLength),
    qw: fmt(q.width),
    ql: fmt(q.height)
  });

  return `<svg viewBox="0 0 ${vbW} ${vbH}" width="100%" role="img" aria-label="${escapeHtml(altText)}" xmlns="http://www.w3.org/2000/svg" style="max-width:460px;height:auto;display:block;margin:0 auto;font-family:'Plus Jakarta Sans',sans-serif;">
    <title>${escapeHtml(altText)}</title>
    ${panelsSvg}
    ${quiltTopSvg}
    ${seamsSvg}
    <text x="${(ox + drawW / 2).toFixed(1)}" y="${dimBottomY.toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#241D18">Backing Width: ${escapeHtml(fmt(d.backingWidth))}</text>
    <text x="${dimLeftX.toFixed(1)}" y="${(oy + drawH / 2).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#241D18" transform="rotate(-90 ${dimLeftX.toFixed(1)} ${(oy + drawH / 2).toFixed(1)})">Length: ${escapeHtml(fmt(d.backingLength))}</text>
  </svg>`;
}

function renderResults(res) {
  const resultValid = document.getElementById("resultValid");
  const resultError = document.getElementById("resultError");
  const stickyBar = document.getElementById("stickyResultBar");

  if (!res.valid) {
    if (resultValid) resultValid.hidden = true;
    if (resultError) {
      resultError.textContent = copy.validation.positiveNumber;
      resultError.hidden = false;
    }
    if (stickyBar) stickyBar.hidden = true;
    return;
  }

  lastValidResult = res;
  if (resultValid) resultValid.hidden = false;
  if (resultError) resultError.hidden = true;

  const p = res.primary;
  const buyText = formatPrimaryBuy(p);
  const altText = formatAltBuy(p);
  const exactMeasureStr = formatMeasure(p.exactInches);
  const allowanceStr = formatMeasure(p.cuttingAllowance);

  const orientEl = document.getElementById("orientationPill");
  if (orientEl) {
    orientEl.textContent =
      res.diagram.layoutMode === "single"
        ? copy.results.orientationSingle
        : res.chosenOrientation === "vertical"
          ? copy.results.orientationVertical
          : copy.results.orientationHorizontal;
  }

  document.getElementById("buyValue").textContent = buyText;
  document.getElementById("buySub").textContent =
    getBuyUnit() === "yd"
      ? interpolate(copy.results.altBuyMetric, { altBuy: altText })
      : interpolate(copy.results.altBuyImperial, { altBuy: altText });
  document.getElementById("buyRounding").textContent =
    getBuyUnit() === "yd"
      ? interpolate(copy.results.roundingImperial, {
          exact: exactMeasureStr,
          allowance: allowanceStr
        })
      : interpolate(copy.results.roundingMetric, {
          exact: exactMeasureStr,
          allowance: allowanceStr
        });

  const seamWord =
    p.seams === 1 ? copy.results.seamSingular : copy.results.seamPlural;
  const instrEl = document.getElementById("cuttingInstruction");
  if (p.panels === 1) {
    const isRotated = res.chosenOrientation === "horizontal";
    const coveredSide = isRotated ? res.backingLength : res.backingWidth;
    const template = isRotated
      ? copy.results.instructionSingleRotated
      : copy.results.instructionSingle;
    instrEl.innerHTML = interpolate(template, {
      buy: escapeHtml(buyText),
      cutLength: escapeHtml(formatMeasure(p.cutLength)),
      usable: escapeHtml(formatMeasure(res.usableWof)),
      coveredSide: escapeHtml(formatMeasure(coveredSide))
    });
  } else {
    instrEl.innerHTML = interpolate(copy.results.instructionPieced, {
      panels: p.panels,
      cutLength: escapeHtml(formatMeasure(p.cutLength)),
      seams: p.seams,
      seamWord: escapeHtml(seamWord)
    });
  }

  const panelWord =
    p.panels === 1 ? copy.results.panelSingular : copy.results.panelPlural;
  document.getElementById("bdPanelsVal").textContent = `${p.panels} ${panelWord}`;
  document.getElementById("bdSeamsVal").textContent = `${p.seams} ${seamWord}`;
  document.getElementById("bdCutLenVal").textContent = formatMeasure(p.cutLength);
  document.getElementById("bdCutLenSub").textContent = interpolate(
    copy.results.usableWofNote,
    { usable: formatMeasure(res.usableWof) }
  );
  document.getElementById("bdBackingSizeVal").textContent =
    `${formatMeasure(res.backingWidth)} × ${formatMeasure(res.backingLength)}`;

  // 2. SVG Diagram
  const stage = document.getElementById("diagramStage");
  if (stage) {
    stage.innerHTML = buildBackingSvgString(res, copy, getInputUnit());
  }

  // 3. Alternative Direction Comparison Card
  const altTitle = document.getElementById("altCardHeading");
  const altBody = document.getElementById("altCardBody");
  if (res.isDirectional) {
    altTitle.textContent = copy.results.altCard.directionalTitle;
    altBody.innerHTML = `<p class="batting-note">${escapeHtml(copy.results.altCard.directionalBody)}</p>`;
  } else {
    const alt = res.alternative;
    if (alt.panels === 1) {
      altTitle.textContent = copy.results.altCard.singleHeading;
      altBody.innerHTML = `<div class="alt-compare-row">
        <span><strong>${escapeHtml(copy.results.altCard.singleName)}:</strong> ${escapeHtml(
          interpolate(copy.results.altCard.singleSummary, {
            cutLength: formatMeasure(alt.cutLength),
            buy: formatPrimaryBuy(alt)
          })
        )}</span>
      </div>`;
    } else {
      altTitle.textContent = copy.results.altCard.heading;
      const altDirName =
        res.alternativeOrientation === "vertical"
          ? copy.results.altCard.verticalName
          : copy.results.altCard.horizontalName;
      const altPanelWord =
        alt.panels === 1 ? copy.results.panelSingular : copy.results.panelPlural;
      const altSeamWord =
        alt.seams === 1 ? copy.results.seamSingular : copy.results.seamPlural;
      altBody.innerHTML = `<div class="alt-compare-row">
        <span><strong>${escapeHtml(altDirName)}:</strong> ${escapeHtml(
          interpolate(copy.results.altCard.summary, {
            panels: alt.panels,
            panelWord: altPanelWord,
            cutLength: formatMeasure(alt.cutLength),
            seams: alt.seams,
            seamWord: altSeamWord,
            buy: formatPrimaryBuy(alt)
          })
        )}</span>
      </div>`;
    }
  }

  // 4. Wideback / Multi-panel Banner
  const banner = document.getElementById("widebackBanner");
  if (res.warnings.includes("widebackExceeded")) {
    banner.textContent = copy.results.widebackBanner.widebackExceeded;
    banner.hidden = false;
  } else if (res.warnings.includes("multiPanelWidebackTip")) {
    banner.textContent = interpolate(copy.results.widebackBanner.multiPanel, {
      panels: p.panels,
      seams: p.seams
    });
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }

  // 5. Batting Recommendation Card
  const bat = res.batting;
  document.getElementById("battingMinSize").textContent =
    `${formatInchesDisplay(bat.width)}" × ${formatInchesDisplay(bat.length)}" (${formatCmDisplay(bat.width)} × ${formatCmDisplay(bat.length)} cm)`;
  if (bat.exceedKing) {
    document.getElementById("battingPkgName").textContent =
      copy.results.battingCard.exceedKingName;
    document.getElementById("battingNote").textContent =
      copy.results.battingCard.exceedKingDetail;
  } else {
    const pkgInfo = copy.battingPackages[bat.packageId];
    document.getElementById("battingPkgName").textContent =
      `${pkgInfo.name} (${pkgInfo.dim})`;
    document.getElementById("battingNote").textContent = interpolate(
      copy.results.battingCard.packageDetail,
      {
        pkgName: pkgInfo.name,
        pkgDim: pkgInfo.dim,
        overage: formatDualMeasure(state.overage)
      }
    );
  }

  // Dimension warning (> 150")
  const dimWarn = document.getElementById("dimWarning");
  if (res.warnings.includes("largeDimension")) {
    dimWarn.textContent = copy.warnings.largeDimension;
    dimWarn.hidden = false;
  } else {
    dimWarn.hidden = true;
  }

  // Sticky bar
  if (stickyBar) {
    document.getElementById("stickyBarText").textContent =
      `${buyText} · ${p.panels} ${panelWord} (${p.seams} ${seamWord})`;
    stickyBar.hidden = isResultCardVisible;
  }

  // Print card
  updatePrintCard(res, buyText, altText, panelWord, seamWord);
}

function updatePrintCard(res, buyText, altText, panelWord, seamWord) {
  const p = res.primary;
  document.getElementById("printCardTitle").textContent = copy.printCard.title;
  document.getElementById("printProjectLabel").textContent = copy.printCard.projectLabel;
  document.getElementById("printDateLabel").textContent = copy.printCard.dateLabel;
  document.getElementById("printMetaRow").textContent =
    `${copy.printCard.quiltSpecLabel} ${formatMeasure(state.width)} × ${formatMeasure(state.length)}   ·   ${copy.printCard.fabricSpecLabel} ${formatMeasure(state.fabricWidth)} WOF (${formatMeasure(res.usableWof)} usable)`;
  document.getElementById("printBuyLabel").textContent = copy.results.buyHeading;
  document.getElementById("printBuyValue").textContent = buyText;
  document.getElementById("printBuySub").textContent =
    `(${altText}) · ${formatMeasure(p.exactInches)} + ${formatMeasure(p.cuttingAllowance)} cutting allowance · Backing ${formatMeasure(res.backingWidth)} × ${formatMeasure(res.backingLength)}`;
  document.getElementById("printInstruction").textContent =
    p.panels === 1
      ? res.chosenOrientation === "horizontal"
        ? `Cut 1 piece at ${formatMeasure(p.cutLength)} long and rotate 90° — ${formatMeasure(res.usableWof)} usable width covers ${formatMeasure(res.backingLength)} side (no seams).`
        : `Cut 1 piece at ${formatMeasure(p.cutLength)} long — ${formatMeasure(res.usableWof)} usable width covers ${formatMeasure(res.backingWidth)} width (no seams).`
      : `Cut ${p.panels} ${panelWord} at ${formatMeasure(p.cutLength)} each; sew ${p.seams} ${seamWord} (1/2" seam allowance).`;
  const bat = res.batting;
  const batText = bat.exceedKing
    ? copy.results.battingCard.exceedKingName
    : `${copy.battingPackages[bat.packageId].name} (${copy.battingPackages[bat.packageId].dim})`;
  document.getElementById("printBreakdown").textContent =
    `Batting min: ${formatMeasure(bat.width)} × ${formatMeasure(bat.length)} · Suggested package: ${batText}`;
  document.getElementById("printDiagramWrap").innerHTML = buildBackingSvgString(
    res,
    copy,
    getInputUnit()
  );
  document.getElementById("printFooter").textContent = copy.printCard.footer;
}

function recalculate() {
  const unit = getInputUnit();
  const parseField = (rawStr, fallback) => {
    if (rawStr === null) return fallback;
    const val = parseFractionOrNumber(rawStr, unit === "in");
    return unit === "cm" && Number.isFinite(val) ? cmToInches(val) : val;
  };

  const w = parseField(rawInputs.width, state.width);
  const l = parseField(rawInputs.length, state.length);
  const wof = parseField(rawInputs.fabricWidth, state.fabricWidth);
  const ov = parseField(rawInputs.overage, state.overage);
  const sel = parseField(rawInputs.selvageDeduction, state.selvageDeduction);

  const res = calculateBacking({
    ...state,
    width: w,
    length: l,
    fabricWidth: wof,
    overage: ov,
    selvageDeduction: sel
  });

  showFieldError("inputWidth", "errWidth", res.fieldErrors.width || null);
  showFieldError("inputLength", "errLength", res.fieldErrors.length || null);
  showFieldError("inputFabricWidth", "errFabricWidth", res.fieldErrors.fabricWidth || null);
  showFieldError("inputOverage", "errOverage", res.fieldErrors.overage || null);
  showFieldError("inputSelvage", "errSelvage", res.fieldErrors.selvageDeduction || null);

  if (res.valid) {
    state.width = w;
    state.length = l;
    state.fabricWidth = wof;
    state.overage = ov;
    state.selvageDeduction = sel;
    saveState();
    renderPresets();
    renderFabricWidthButtons();
    renderOverageButtons();
    renderAdvancedSummary();
  }

  renderResults(res);
}

function bindEvents() {
  document.querySelectorAll(".unit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.unitMode = btn.dataset.unit;
      rawInputs = {
        width: null,
        length: null,
        fabricWidth: null,
        overage: null,
        selvageDeduction: null
      };
      syncAllInputsFromState();
      recalculate();
    });
  });

  const bindNumericInput = (id, key, onCustomHook) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      rawInputs[key] = el.value;
      if (onCustomHook) onCustomHook();
      recalculate();
    });
    el.addEventListener("blur", () => {
      if (lastValidResult) {
        rawInputs[key] = null;
        el.value = formatInputFromInches(state[key], getInputUnit());
      }
    });
  };

  bindNumericInput("inputWidth", "width");
  bindNumericInput("inputLength", "length");
  bindNumericInput("inputFabricWidth", "fabricWidth");
  bindNumericInput("inputOverage", "overage", () => {
    state.quiltingMethod = "custom";
    renderOverageButtons();
  });
  bindNumericInput("inputSelvage", "selvageDeduction");

  document.querySelectorAll("[data-wof]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.wof;
      if (val === "custom") {
        state.isCustomFabricWidth = true;
        saveState();
        renderFabricWidthButtons();
        const wofEl = document.getElementById("inputFabricWidth");
        if (wofEl) wofEl.focus();
      } else {
        state.isCustomFabricWidth = false;
        state.fabricWidth = Number(val);
        rawInputs.fabricWidth = null;
        document.getElementById("inputFabricWidth").value =
          formatInputFromInches(state.fabricWidth, getInputUnit());
        renderFabricWidthButtons();
        recalculate();
      }
    });
  });

  document.querySelectorAll("[data-method]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const method = btn.dataset.method;
      state.quiltingMethod = method;
      if (method === "domestic") {
        state.overage = 3;
        rawInputs.overage = null;
        document.getElementById("inputOverage").value =
          formatInputFromInches(3, getInputUnit());
      } else if (method === "longarm") {
        state.overage = 4;
        rawInputs.overage = null;
        document.getElementById("inputOverage").value =
          formatInputFromInches(4, getInputUnit());
      } else {
        document.getElementById("inputOverage").focus();
      }
      renderOverageButtons();
      recalculate();
    });
  });

  const dirEl = document.getElementById("inputDirectional");
  if (dirEl) {
    dirEl.addEventListener("change", () => {
      state.isDirectional = dirEl.checked;
      recalculate();
    });
  }

  const advToggle = document.getElementById("advancedToggle");
  const advPanel = document.getElementById("advancedPanel");
  const advPill = document.getElementById("advancedActionPill");
  if (advToggle && advPanel) {
    advToggle.addEventListener("click", () => {
      const expanded = advToggle.getAttribute("aria-expanded") === "true";
      advToggle.setAttribute("aria-expanded", String(!expanded));
      advPanel.hidden = expanded;
      if (advPill) {
        advPill.textContent = expanded ? copy.advanced.edit : copy.advanced.done;
      }
    });
  }

  const btnReset = document.getElementById("btnReset");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      state = { ...DEFAULTS, isCustomFabricWidth: false, unitMode: state.unitMode };
      rawInputs = {
        width: null,
        length: null,
        fabricWidth: null,
        overage: null,
        selvageDeduction: null
      };
      syncAllInputsFromState();
      recalculate();
    });
  }

  const btnPrint = document.getElementById("btnPrint");
  if (btnPrint) btnPrint.addEventListener("click", () => window.print());

  const btnCopy = document.getElementById("btnCopy");
  if (btnCopy) {
    btnCopy.addEventListener("click", async () => {
      if (!lastValidResult) return;
      const p = lastValidResult.primary;
      const text = [
        `Quilt Top: ${formatMeasure(state.width)} x ${formatMeasure(state.length)}`,
        `Backing Needed: ${formatMeasure(lastValidResult.backingWidth)} x ${formatMeasure(lastValidResult.backingLength)} (${formatMeasure(state.overage)} overage/side)`,
        `Buy: ${formatPrimaryBuy(p)} (${formatAltBuy(p)}) of ${formatMeasure(state.fabricWidth)} WOF`,
        `Layout: ${p.panels} panel(s) x ${formatMeasure(p.cutLength)}, ${p.seams} seam(s) (${lastValidResult.chosenOrientation})`,
        `Batting Min: ${formatMeasure(lastValidResult.batting.width)} x ${formatMeasure(lastValidResult.batting.length)}`
      ].join("\n");
      try {
        await navigator.clipboard.writeText(text);
        btnCopy.textContent = copy.actions.copied;
        clearTimeout(copyTimeout);
        copyTimeout = setTimeout(() => {
          btnCopy.textContent = copy.actions.copyPlan;
        }, 1800);
      } catch {
        // Ignore clipboard errors
      }
    });
  }

  const stickyBar = document.getElementById("stickyResultBar");
  const resultCard = document.getElementById("resultCard");
  if (stickyBar && resultCard) {
    stickyBar.addEventListener("click", () => {
      resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if ("IntersectionObserver" in window) {
      const obs = new IntersectionObserver(
        (entries) => {
          isResultCardVisible = entries[0].isIntersecting;
          stickyBar.hidden = isResultCardVisible || !lastValidResult;
        },
        { threshold: 0.15 }
      );
      obs.observe(resultCard);
    }
  }
}

async function init() {
  loadState();
  const resp = await fetch("./en.json?v=1.3");
  copy = await resp.json();
  syncAllInputsFromState();
  bindEvents();
  recalculate();
}

document.addEventListener("DOMContentLoaded", init);
