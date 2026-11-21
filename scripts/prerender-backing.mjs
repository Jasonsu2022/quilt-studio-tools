/**
 * Static Pre-renderer for Quilt Backing & Batting Calculator
 * Reads quilt-backing-calculator/en.json as the single source of truth
 * and writes pre-rendered English HTML (including SVG diagram, Batting Chart,
 * FAQ, SoftwareApplication & BreadcrumbList JSON-LD) into quilt-backing-calculator/index.html.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRESETS,
  FABRIC_WIDTH_PRESETS,
  DEFAULTS,
  calculateBacking,
  formatInchesDisplay,
  formatCmDisplay
} from "../quilt-backing-calculator/calculator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const calcDir = path.join(rootDir, "quilt-backing-calculator");
const copy = JSON.parse(fs.readFileSync(path.join(calcDir, "en.json"), "utf8"));

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function interpolate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`
  );
}

// Compute initial default result (60x80, WOF=44, overage=3)
const defRes = calculateBacking(DEFAULTS);
const p = defRes.primary;
const defBuyImperial = `${p.buyYardsLabel} ${p.buyYards > 1 ? copy.units.yards : copy.units.yard}`;
const defAltMetric = `${p.buyMetresLabel} ${copy.units.m}`;
const defBuySub = interpolate(copy.results.altBuyMetric, { altBuy: defAltMetric });
const defRounding = interpolate(copy.results.roundingImperial, {
  exact: `${formatInchesDisplay(p.exactInches)}"`,
  allowance: `${formatInchesDisplay(p.cuttingAllowance)}"`
});
const seamWord = p.seams === 1 ? copy.results.seamSingular : copy.results.seamPlural;
const panelWord = p.panels === 1 ? copy.results.panelSingular : copy.results.panelPlural;
const defInstruction = interpolate(copy.results.instructionPieced, {
  panels: p.panels,
  cutLength: `${formatInchesDisplay(p.cutLength)}"`,
  seams: p.seams,
  seamWord
});
const defAdvSummary = interpolate(copy.advanced.summaryTemplate, {
  selvage: `${formatInchesDisplay(DEFAULTS.selvageDeduction)}"`,
  usable: `${formatInchesDisplay(defRes.usableWof)}"`
});

// Pre-render initial SVG diagram
function renderStaticSvg(res) {
  const d = res.diagram;
  const vbW = 460;
  const vbH = 300;
  const padLeft = 56;
  const padTop = 36;
  const padRight = 32;
  const padBottom = 46;
  const maxDrawW = vbW - padLeft - padRight;
  const maxDrawH = vbH - padTop - padBottom;
  const scale = Math.min(maxDrawW / d.backingWidth, maxDrawH / d.backingLength);
  const drawW = d.backingWidth * scale;
  const drawH = d.backingLength * scale;
  const ox = padLeft + (maxDrawW - drawW) / 2;
  const oy = padTop + (maxDrawH - drawH) / 2;

  const panelsSvg = d.panels
    .map((panel) => {
      const px = ox + panel.x * scale;
      const py = oy + panel.y * scale;
      const pw = panel.drawWidth * scale;
      const ph = panel.drawHeight * scale;
      return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="#E8F0EC" stroke="#2B5447" stroke-width="1.5" /><text x="${(px + pw / 2).toFixed(1)}" y="${(py + 16).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="600" fill="#2B5447">P${panel.index} (${formatInchesDisplay(panel.cutWidth)}")</text>`;
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
  const altText = interpolate(copy.diagram.altTemplate, {
    mode: copy.results.orientationVertical,
    panels: d.panelCount,
    bw: `${formatInchesDisplay(d.backingWidth)}"`,
    bl: `${formatInchesDisplay(d.backingLength)}"`,
    qw: `${formatInchesDisplay(q.width)}"`,
    ql: `${formatInchesDisplay(q.height)}"`
  });

  return `<svg viewBox="0 0 ${vbW} ${vbH}" width="100%" role="img" aria-label="${escapeHtml(altText)}" xmlns="http://www.w3.org/2000/svg" style="max-width:460px;height:auto;display:block;margin:0 auto;font-family:'Plus Jakarta Sans',sans-serif;"><title>${escapeHtml(altText)}</title>${panelsSvg}<rect x="${qx.toFixed(1)}" y="${qy.toFixed(1)}" width="${qw.toFixed(1)}" height="${qh.toFixed(1)}" fill="rgba(255,255,255,0.45)" stroke="#241D18" stroke-width="1.6" stroke-dasharray="5 4" rx="2" /><text x="${(qx + qw / 2).toFixed(1)}" y="${(qy + qh / 2 - 4).toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#241D18">Quilt Top</text><text x="${(qx + qw / 2).toFixed(1)}" y="${(qy + qh / 2 + 12).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#52473E">${formatInchesDisplay(q.width)}" × ${formatInchesDisplay(q.height)}"</text>${seamsSvg}<text x="${(ox + drawW / 2).toFixed(1)}" y="${(oy + drawH + 22).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#241D18">Backing Width: ${formatInchesDisplay(d.backingWidth)}"</text><text x="${(ox - 16).toFixed(1)}" y="${(oy + drawH / 2).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#241D18" transform="rotate(-90 ${(ox - 16).toFixed(1)} ${(oy + drawH / 2).toFixed(1)})">Length: ${formatInchesDisplay(d.backingLength)}"</text></svg>`;
}

const presetsHtml = PRESETS.map((pr) => {
  return `            <button type="button" class="preset-btn" data-preset="${pr.id}" aria-pressed="false">
              <span class="preset-name">${escapeHtml(copy.presets[pr.id])}</span>
              <span class="preset-dim">${pr.width}×${pr.length}"</span>
            </button>`;
}).join("\n");

const wofChipsHtml = [
  ...FABRIC_WIDTH_PRESETS.map((val) => {
    const active = val === DEFAULTS.fabricWidth;
    return `            <button type="button" class="strip-btn" data-wof="${val}" aria-pressed="${active}"><span>${val}"</span></button>`;
  }),
  `            <button type="button" class="strip-btn" data-wof="custom" aria-pressed="false"><span>${escapeHtml(copy.inputs.fabricWidth.custom)}</span></button>`
].join("\n");

const seoHtml = copy.seo.sections
  .map(
    (sec) => `        <div class="seo-block">
          <h2>${escapeHtml(sec.heading)}</h2>
${sec.paragraphs.map((para) => `          <p>${escapeHtml(para)}</p>`).join("\n")}
        </div>`
  )
  .join("\n");

const chartRowsHtml = copy.seo.chartRows
  .map(
    (r) => `              <tr>
                <td><strong>${escapeHtml(r.size)}</strong></td>
                <td>${escapeHtml(r.in)}</td>
                <td>${escapeHtml(r.cm)}</td>
                <td>${escapeHtml(r.bestFor)}</td>
              </tr>`
  )
  .join("\n");

const faqHtml = copy.faq.items
  .map(
    (item) => `          <details class="faq-item">
            <summary>${escapeHtml(item.q)}</summary>
            <div class="faq-answer">${escapeHtml(item.a)}</div>
          </details>`
  )
  .join("\n");

const faqJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: copy.faq.items.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a }
  }))
});

const appJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: copy.header.title,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Web",
  url: "https://tools.3145201.xyz/quilt-backing-calculator/",
  description: copy.meta.description,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
});

const breadcrumbJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://tools.3145201.xyz/" },
    {
      "@type": "ListItem",
      position: 2,
      name: copy.header.title,
      item: "https://tools.3145201.xyz/quilt-backing-calculator/"
    }
  ]
});

const alt = defRes.alternative;
const altSummary = interpolate(copy.results.altCard.summary, {
  panels: alt.panels,
  panelWord: alt.panels === 1 ? copy.results.panelSingular : copy.results.panelPlural,
  cutLength: `${formatInchesDisplay(alt.cutLength)}"`,
  seams: alt.seams,
  seamWord: alt.seams === 1 ? copy.results.seamSingular : copy.results.seamPlural,
  buy: `${alt.buyYardsLabel} ${alt.buyYards > 1 ? copy.units.yards : copy.units.yard}`
});

const defPkg = copy.battingPackages[defRes.batting.packageId];
const defBatNote = interpolate(copy.results.battingCard.packageDetail, {
  pkgName: defPkg.name,
  pkgDim: defPkg.dim,
  overage: `${formatInchesDisplay(DEFAULTS.overage)}" (${formatCmDisplay(DEFAULTS.overage)} cm)`
});

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(copy.meta.title)}</title>
  <meta name="description" content="${escapeHtml(copy.meta.description)}" />
  <meta property="og:title" content="${escapeHtml(copy.meta.title)}" />
  <meta property="og:description" content="${escapeHtml(copy.meta.description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://tools.3145201.xyz/quilt-backing-calculator/" />
  <meta property="og:image" content="https://tools.3145201.xyz/og-cover.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="https://tools.3145201.xyz/quilt-backing-calculator/" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css?v=1.3.1" />
  <script id="faq-jsonld" type="application/ld+json">${faqJsonLd}</script>
  <script id="app-jsonld" type="application/ld+json">${appJsonLd}</script>
  <script id="breadcrumb-jsonld" type="application/ld+json">${breadcrumbJsonLd}</script>
  <script defer src="../config/analytics.js"></script>
</head>
<body>
  <div class="page-shell">
    <div class="top-header-wrap no-print">
      <nav class="site-nav" aria-label="Site navigation">
        <a class="site-brand" href="../">${escapeHtml(copy.nav.siteName)}</a>
        <div class="site-nav-links">
          <a href="../">${escapeHtml(copy.nav.home)}</a>
          <a href="../quilt-binding-calculator/">Binding<span class="nav-hide-sm"> Calculator</span></a>
          <a href="../about/">${escapeHtml(copy.nav.about)}</a>
        </div>
      </nav>

      <div class="header-row">
        <header class="page-header">
          <h1>${escapeHtml(copy.header.title)}</h1>
          <p class="page-subtitle">${escapeHtml(copy.header.subtitle)}</p>
        </header>

        <div class="unit-switcher" role="group" id="unitSwitcher" aria-label="${escapeHtml(copy.units.ariaLabel)}">
          <button type="button" class="unit-btn" data-unit="imperial" aria-pressed="true">
            <span class="unit-label-full">${escapeHtml(copy.units.imperial)}</span>
            <span class="unit-label-short">${escapeHtml(copy.units.imperialShort)}</span>
          </button>
          <button type="button" class="unit-btn" data-unit="metric" aria-pressed="false">
            <span class="unit-label-full">${escapeHtml(copy.units.metric)}</span>
            <span class="unit-label-short">${escapeHtml(copy.units.metricShort)}</span>
          </button>
          <button type="button" class="unit-btn" data-unit="mixed" aria-pressed="false">
            <span class="unit-label-full">${escapeHtml(copy.units.mixed)}</span>
            <span class="unit-label-short">${escapeHtml(copy.units.mixedShort)}</span>
          </button>
        </div>
      </div>
    </div>

    <main class="core-grid no-print">
      <!-- Input Card -->
      <section class="card" aria-label="Quilt backing inputs">
        <div class="field-group">
          <div class="field-header">
            <span class="field-label">${escapeHtml(copy.presets.label)}</span>
            <span class="custom-badge" id="customPresetBadge">${escapeHtml(copy.presets.custom)}</span>
          </div>
          <div class="preset-grid" id="presetGrid">
${presetsHtml}
          </div>
        </div>

        <div class="field-group">
          <span class="field-label" style="margin-bottom: 10px;">${escapeHtml(copy.inputs.dimensionsLabel)}</span>
          <div class="dim-row">
            <div>
              <label class="field-label" for="inputWidth">${escapeHtml(copy.inputs.width)}</label>
              <div class="input-wrap" style="margin-top: 8px;">
                <input id="inputWidth" class="num-input" type="text" inputmode="decimal" autocomplete="off" placeholder="${escapeHtml(copy.inputs.widthPlaceholder)}" value="${DEFAULTS.width}" />
                <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
              </div>
              <p class="field-error-msg" id="errWidth" hidden role="alert"></p>
            </div>
            <div>
              <label class="field-label" for="inputLength">${escapeHtml(copy.inputs.length)}</label>
              <div class="input-wrap" style="margin-top: 8px;">
                <input id="inputLength" class="num-input" type="text" inputmode="decimal" autocomplete="off" placeholder="${escapeHtml(copy.inputs.lengthPlaceholder)}" value="${DEFAULTS.length}" />
                <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
              </div>
              <p class="field-error-msg" id="errLength" hidden role="alert"></p>
            </div>
          </div>
          <div class="dim-warning" id="dimWarning" hidden role="status"></div>
        </div>

        <div class="field-group">
          <span class="field-label" style="margin-bottom: 10px;">${escapeHtml(copy.inputs.fabricWidth.label)}</span>
          <div class="wof-grid" id="wofGrid">
${wofChipsHtml}
          </div>
          <div class="inline-drawer" id="wofCustomDrawer" hidden>
            <label for="inputFabricWidth">${escapeHtml(copy.inputs.fabricWidth.inputLabel)}</label>
            <div class="input-wrap">
              <input id="inputFabricWidth" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${DEFAULTS.fabricWidth}" />
              <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
            </div>
            <p class="field-error-msg" id="errFabricWidth" hidden role="alert"></p>
          </div>
          <p class="adv-hint">${escapeHtml(copy.inputs.fabricWidth.hint)}</p>
        </div>

        <div class="field-group">
          <span class="field-label" style="margin-bottom: 10px;">${escapeHtml(copy.inputs.overage.label)}</span>
          <div class="overage-grid" role="group">
            <button type="button" class="cut-btn" data-method="domestic" aria-pressed="true">
              <span class="cut-btn-title">${escapeHtml(copy.inputs.overage.domestic)}</span>
              <span class="cut-btn-hint">${escapeHtml(copy.inputs.overage.domesticHint)}</span>
            </button>
            <button type="button" class="cut-btn" data-method="longarm" aria-pressed="false">
              <span class="cut-btn-title">${escapeHtml(copy.inputs.overage.longarm)}</span>
              <span class="cut-btn-hint">${escapeHtml(copy.inputs.overage.longarmHint)}</span>
            </button>
            <button type="button" class="cut-btn" data-method="custom" aria-pressed="false">
              <span class="cut-btn-title">${escapeHtml(copy.inputs.overage.custom)}</span>
              <span class="cut-btn-hint">${escapeHtml(copy.inputs.overage.customHint)}</span>
            </button>
          </div>
          <div class="inline-drawer">
            <label for="inputOverage">${escapeHtml(copy.inputs.overage.inputLabel)}</label>
            <div class="input-wrap">
              <input id="inputOverage" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${DEFAULTS.overage}" />
              <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
            </div>
            <p class="field-error-msg" id="errOverage" hidden role="alert"></p>
          </div>
        </div>

        <div class="field-group">
          <label class="toggle-row" for="inputDirectional">
            <span class="toggle-text">
              <span class="toggle-title">${escapeHtml(copy.inputs.directional.label)}</span>
              <span class="toggle-hint">${escapeHtml(copy.inputs.directional.hint)}</span>
            </span>
            <input id="inputDirectional" class="switch-input" type="checkbox" />
          </label>
        </div>

        <div class="advanced-box">
          <button type="button" class="advanced-toggle" id="advancedToggle" aria-expanded="false" aria-controls="advancedPanel">
            <span class="advanced-toggle-text">
              <span class="advanced-title">${escapeHtml(copy.advanced.toggle)}</span>
              <span class="advanced-summary" id="advancedSummary">${escapeHtml(defAdvSummary)}</span>
            </span>
            <span class="advanced-action-pill" id="advancedActionPill">${escapeHtml(copy.advanced.edit)}</span>
          </button>

          <div class="advanced-panel" id="advancedPanel" hidden>
            <div class="adv-field">
              <label for="inputSelvage">${escapeHtml(copy.advanced.selvage)}</label>
              <div class="input-wrap">
                <input id="inputSelvage" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${DEFAULTS.selvageDeduction}" />
                <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
              </div>
              <p class="field-error-msg" id="errSelvage" hidden role="alert"></p>
              <p class="adv-hint">${escapeHtml(copy.advanced.selvageHint)}</p>
            </div>

            <div class="adv-field">
              <label>${escapeHtml(copy.advanced.seamLabel)}</label>
              <div class="readonly-spec">${escapeHtml(copy.advanced.seamValue)}</div>
              <p class="adv-hint">${escapeHtml(copy.advanced.seamHint)}</p>
            </div>

            <div class="adv-reset-row">
              <button type="button" class="btn-reset" id="btnReset">${escapeHtml(copy.advanced.reset)}</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Results Column (Fixed Order 1-5) -->
      <div class="results-column">
        <!-- 1. Primary Plan -->
        <section class="result-card" id="resultCard" aria-live="polite">
          <div class="result-error" id="resultError" hidden></div>

          <div class="result-valid" id="resultValid">
            <div class="buy-hero">
              <div class="orientation-pill" id="orientationPill">${escapeHtml(copy.results.orientationVertical)}</div>
              <div class="buy-label">${escapeHtml(copy.results.buyHeading)}</div>
              <div class="buy-value" id="buyValue">${escapeHtml(defBuyImperial)}</div>
              <div class="buy-sub" id="buySub">${escapeHtml(defBuySub)}</div>
              <div class="buy-rounding" id="buyRounding">${escapeHtml(defRounding)}</div>
              <p class="buy-footnote">${escapeHtml(copy.results.roundingFootnote)}</p>
            </div>

            <div class="instruction-box" id="cuttingInstruction">${defInstruction}</div>

            <div class="breakdown-grid-4">
              <div class="breakdown-cell">
                <div class="breakdown-label">${escapeHtml(copy.results.panelsLabel)}</div>
                <div class="breakdown-value" id="bdPanelsVal">${p.panels} ${escapeHtml(panelWord)}</div>
              </div>
              <div class="breakdown-cell">
                <div class="breakdown-label">${escapeHtml(copy.results.seamsLabel)}</div>
                <div class="breakdown-value" id="bdSeamsVal">${p.seams} ${escapeHtml(seamWord)}</div>
              </div>
              <div class="breakdown-cell">
                <div class="breakdown-label">${escapeHtml(copy.results.cutLengthLabel)}</div>
                <div class="breakdown-value" id="bdCutLenVal">${formatInchesDisplay(p.cutLength)}"</div>
                <div class="breakdown-sub" id="bdCutLenSub">Usable ${formatInchesDisplay(defRes.usableWof)}" each</div>
              </div>
              <div class="breakdown-cell">
                <div class="breakdown-label">${escapeHtml(copy.results.backingSizeLabel)}</div>
                <div class="breakdown-value" id="bdBackingSizeVal">${formatInchesDisplay(defRes.backingWidth)}" × ${formatInchesDisplay(defRes.backingLength)}"</div>
              </div>
            </div>

            <div class="action-row">
              <button type="button" class="btn-print" id="btnPrint">${escapeHtml(copy.actions.printCard)}</button>
              <button type="button" class="btn-copy" id="btnCopy">${escapeHtml(copy.actions.copyPlan)}</button>
            </div>
          </div>
        </section>

        <!-- 2. SVG Layout Diagram -->
        <section class="card diagram-card" id="diagramCard">
          <h2>${escapeHtml(copy.diagram.heading)}</h2>
          <div class="diagram-stage" id="diagramStage">${renderStaticSvg(defRes)}</div>
          <div class="diagram-legend">
            <span class="legend-item"><span class="legend-swatch legend-swatch--panel"></span>${escapeHtml(copy.diagram.legendBacking)}</span>
            <span class="legend-item"><span class="legend-swatch legend-swatch--quilt"></span>${escapeHtml(copy.diagram.legendQuiltTop)}</span>
            <span class="legend-item"><span class="legend-swatch legend-swatch--seam"></span>${escapeHtml(copy.diagram.legendSeam)}</span>
          </div>
          <p class="diagram-note">${escapeHtml(copy.diagram.scaleNote)}</p>
          <p class="diagram-note">${escapeHtml(copy.diagram.trimNote)}</p>
        </section>

        <!-- 3. Alternative Direction Comparison Card -->
        <section class="sub-result-card" id="altDirectionCard">
          <h3 id="altCardHeading">${escapeHtml(copy.results.altCard.heading)}</h3>
          <div id="altCardBody">
            <div class="alt-compare-row">
              <span><strong>${escapeHtml(copy.results.altCard.horizontalName)}:</strong> ${escapeHtml(altSummary)}</span>
            </div>
          </div>
        </section>

        <!-- 4. Multi-panel / Wideback Tip Banner -->
        <div class="wideback-banner" id="widebackBanner" hidden role="status"></div>

        <!-- 5. Recommended Batting Card -->
        <section class="batting-card" id="battingCard">
          <h3>${escapeHtml(copy.results.battingCard.heading)}</h3>
          <div class="batting-grid">
            <div class="batting-cell">
              <div class="batting-cell-label">${escapeHtml(copy.results.battingCard.minSizeLabel)}</div>
              <div class="batting-cell-value" id="battingMinSize">${formatInchesDisplay(defRes.batting.width)}" × ${formatInchesDisplay(defRes.batting.length)}" (${formatCmDisplay(defRes.batting.width)} × ${formatCmDisplay(defRes.batting.length)} cm)</div>
            </div>
            <div class="batting-cell">
              <div class="batting-cell-label">${escapeHtml(copy.results.battingCard.packageLabel)}</div>
              <div class="batting-cell-value" id="battingPkgName">${escapeHtml(defPkg.name)} (${escapeHtml(defPkg.dim)})</div>
            </div>
          </div>
          <p class="batting-note" id="battingNote">${escapeHtml(defBatNote)}</p>
        </section>
      </div>
    </main>

    <div class="content-sections no-print">
      <!-- Complete Your Project (Internal Cross-Link) -->
      <section class="card" id="complete-project">
        <h2 class="section-heading">${escapeHtml(copy.completeProject.heading)}</h2>
        <div class="rec-grid">
          <article class="rec-item">
            <div>
              <h3>${escapeHtml(copy.completeProject.cardTitle)}</h3>
              <p>${escapeHtml(copy.completeProject.cardDesc)}</p>
            </div>
            <a class="rec-link" href="${escapeHtml(copy.completeProject.href)}">${escapeHtml(copy.completeProject.cardCta)}</a>
          </article>
        </div>
      </section>

      <!-- How it works + Batting Quick Chart -->
      <section class="card" id="guide-section">
        <div id="seoBlocks">
${seoHtml}
        </div>

        <div class="chart-wrap" id="batting-chart">
          <h2>${escapeHtml(copy.seo.chartHeading)}</h2>
          <p class="chart-note">${escapeHtml(copy.seo.chartNote)}</p>
          <div class="table-scroll">
            <table class="quick-table">
              <thead>
                <tr>
                  <th>${escapeHtml(copy.seo.chartColumns.size)}</th>
                  <th>${escapeHtml(copy.seo.chartColumns.dimensionsIn)}</th>
                  <th>${escapeHtml(copy.seo.chartColumns.dimensionsCm)}</th>
                  <th>${escapeHtml(copy.seo.chartColumns.bestFor)}</th>
                </tr>
              </thead>
              <tbody>
${chartRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="card" id="faq-section">
        <h2 class="section-heading">${escapeHtml(copy.faq.heading)}</h2>
        <div class="faq-list">
${faqHtml}
        </div>
      </section>

      <footer class="site-footer">
        <span>${escapeHtml(copy.footer.copyright)}</span>
        <a href="../about/">${escapeHtml(copy.footer.aboutLink)}</a>
      </footer>
    </div>

    <button type="button" class="sticky-result-bar no-print" id="stickyResultBar" hidden>
      <span class="sticky-bar-main" id="stickyBarText"></span>
      <span class="sticky-bar-cta">${escapeHtml(copy.stickyBar.viewDetails)}</span>
    </button>

    <section class="print-only-card" id="printCard" aria-hidden="true">
      <div class="print-card-header">
        <div class="print-card-title" id="printCardTitle"></div>
      </div>
      <div class="print-write-lines">
        <div class="print-line-row">
          <span id="printProjectLabel"></span>
          <span class="print-line"></span>
        </div>
        <div class="print-line-row">
          <span id="printDateLabel"></span>
          <span class="print-line"></span>
        </div>
      </div>
      <div class="print-meta-row" id="printMetaRow"></div>
      <div class="print-buy-box">
        <div class="print-buy-label" id="printBuyLabel"></div>
        <div class="print-buy-value" id="printBuyValue"></div>
        <div class="print-buy-sub" id="printBuySub"></div>
      </div>
      <div class="print-instruction" id="printInstruction"></div>
      <div class="print-breakdown" id="printBreakdown"></div>
      <div class="print-diagram-wrap" id="printDiagramWrap"></div>
      <div class="print-footer" id="printFooter"></div>
    </section>
  </div>

  <script type="module" src="./app.js?v=1.3"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(calcDir, "index.html"), html, "utf8");
console.log("Pre-rendered quilt-backing-calculator/index.html successfully!");
