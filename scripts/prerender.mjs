/**
 * Static Pre-renderer for Quilt Binding Calculator
 * Reads quilt-binding-calculator/en.json as the single source of truth
 * and writes pre-rendered English HTML (including Quick Chart, FAQ & JSON-LD)
 * directly into quilt-binding-calculator/index.html so the page is 100% readable
 * even when JavaScript is disabled or slow on weak mobile networks.
 *
 * Does NOT alter any calculation logic.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRESETS,
  STRIP_PRESETS,
  DEFAULTS,
  calculateBinding,
  formatInchesDisplay
} from "../quilt-binding-calculator/calculator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const calcDir = path.join(rootDir, "quilt-binding-calculator");

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

// Compute default Throw result for initial static SSR display
const defRes = calculateBinding(DEFAULTS);
const defBuyImperial = `${defRes.buyYardsLabel} ${defRes.buyYards > 1 ? copy.units.yards : copy.units.yard}`;
const defAltMetric = `${defRes.buyMetresLabel} ${copy.units.m}`;
const defBuySub = `${interpolate(copy.results.altBuyMetric, { altBuy: defAltMetric })} · ${interpolate(copy.results.includesSquaring, { squaring: `${formatInchesDisplay(DEFAULTS.squaring)}"` })}`;
const defInstruction = interpolate(copy.results.instructionStraight, {
  strips: defRes.strips,
  stripWord: defRes.strips === 1 ? copy.results.stripSingular : copy.results.stripPlural,
  stripWidth: `${formatInchesDisplay(DEFAULTS.stripWidth)}"`,
  wof: `${formatInchesDisplay(DEFAULTS.wof)}"`
});
const defAdvSummary = interpolate(copy.advanced.summaryTemplate, {
  wof: `${formatInchesDisplay(DEFAULTS.wof)}"`,
  extra: `${formatInchesDisplay(DEFAULTS.extra)}"`,
  join: copy.advanced.diagonal,
  squaring: `${formatInchesDisplay(DEFAULTS.squaring)}"`
});

// Presets HTML
const presetsHtml = PRESETS.map((p) => {
  const active = p.id === "throw";
  return `            <button type="button" class="preset-btn" data-preset="${p.id}" aria-pressed="${active}">
              <span class="preset-name">${escapeHtml(copy.presets[p.id])}</span>
              <span class="preset-dim">${p.width}×${p.length}"</span>
            </button>`;
}).join("\n");

// Strip buttons HTML
const stripsHtml = [
  ...STRIP_PRESETS.map((val) => {
    const active = val === DEFAULTS.stripWidth;
    const tag = val === 2.5 ? `\n              <span class="strip-tag">${escapeHtml(copy.inputs.stripWidth.mostCommon)}</span>` : "";
    return `            <button type="button" class="strip-btn" data-strip="${val}" aria-pressed="${active}">
              <span>${escapeHtml(formatInchesDisplay(val))}"</span>${tag}
            </button>`;
  }),
  `            <button type="button" class="strip-btn" data-strip="custom" aria-pressed="false">
              <span>${escapeHtml(copy.inputs.stripWidth.custom)}</span>
            </button>`
].join("\n");

// Tips HTML
const tipsHtml = copy.tips.items
  .map(
    (item, idx) => `          <li class="tip-item">
            <span class="tip-num" aria-hidden="true">${idx + 1}</span>
            <div>
              <div class="tip-title">${escapeHtml(item.title)}</div>
              <p class="tip-body">${escapeHtml(item.body)}</p>
            </div>
          </li>`
  )
  .join("\n");

// Recommendations HTML
const recsHtml = copy.recommendations.items
  .map(
    (item) => `          <article class="rec-item">
            <div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.desc)}</p>
            </div>
            <a class="rec-link" href="${escapeHtml(item.href)}">${escapeHtml(item.cta)}</a>
          </article>`
  )
  .join("\n");

// SEO sections HTML
const seoHtml = copy.seo.sections
  .map(
    (sec) => `        <div class="seo-block">
          <h2>${escapeHtml(sec.heading)}</h2>
${sec.paragraphs.map((p) => `          <p>${escapeHtml(p)}</p>`).join("\n")}
        </div>`
  )
  .join("\n");

// Quick Chart table HTML
const cols = copy.seo.chartColumns;
const chartRowsHtml = PRESETS.map((preset) => {
  const res = calculateBinding({ ...DEFAULTS, width: preset.width, length: preset.length });
  return `              <tr>
                <td><strong>${escapeHtml(copy.presets[preset.id])}</strong></td>
                <td>${preset.width}" × ${preset.length}"</td>
                <td>${formatInchesDisplay(res.totalLength)}"</td>
                <td>${res.strips}</td>
                <td class="highlight-buy">${res.buyYardsLabel} ${escapeHtml(copy.units.yd)}</td>
                <td>${res.buyMetresLabel} ${escapeHtml(copy.units.m)}</td>
              </tr>`;
}).join("\n");

const chartTableHtml = `            <thead>
              <tr>
                <th>${escapeHtml(cols.size)}</th>
                <th>${escapeHtml(cols.dimensions)}</th>
                <th>${escapeHtml(cols.totalLength)}</th>
                <th>${escapeHtml(cols.strips)}</th>
                <th>${escapeHtml(cols.buyImperial)}</th>
                <th>${escapeHtml(cols.buyMetric)}</th>
              </tr>
            </thead>
            <tbody>
${chartRowsHtml}
            </tbody>`;

// FAQ HTML & JSON-LD
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
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a
    }
  }))
});

const appJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: copy.header.title,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Web",
  url: "https://tools.3145201.xyz/quilt-binding-calculator/",
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
      item: "https://tools.3145201.xyz/quilt-binding-calculator/"
    }
  ]
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
  <meta property="og:url" content="https://tools.3145201.xyz/quilt-binding-calculator/" />
  <meta property="og:image" content="https://tools.3145201.xyz/og-cover.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="https://tools.3145201.xyz/quilt-binding-calculator/" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css?v=1.3" />
  <script id="faq-jsonld" type="application/ld+json">${faqJsonLd}</script>
  <script id="app-jsonld" type="application/ld+json">${appJsonLd}</script>
  <script id="breadcrumb-jsonld" type="application/ld+json">${breadcrumbJsonLd}</script>
  <script defer src="../config/analytics.js"></script>
</head>
<body>
  <div class="page-shell">
    <!-- Section 1: Minimal Top Bar + 3-Way Unit Switcher -->
    <div class="top-header-wrap no-print">
      <nav class="site-nav" aria-label="Site navigation">
        <a class="site-brand" href="../" data-i18n="nav.siteName">${escapeHtml(copy.nav.siteName)}</a>
        <div class="site-nav-links">
          <a href="../" data-i18n="nav.home">${escapeHtml(copy.nav.home)}</a>
          <a href="../about/" data-i18n="nav.about">${escapeHtml(copy.nav.about)}</a>
        </div>
      </nav>

      <div class="header-row">
        <header class="page-header">
          <h1 data-i18n="header.title">${escapeHtml(copy.header.title)}</h1>
          <p class="page-subtitle" data-i18n="header.subtitle">${escapeHtml(copy.header.subtitle)}</p>
        </header>

        <div class="unit-switcher" role="group" id="unitSwitcher" aria-label="${escapeHtml(copy.units.ariaLabel)}">
          <button type="button" class="unit-btn" data-unit="imperial" aria-pressed="true">
            <span class="unit-label-full" data-i18n="units.imperial">${escapeHtml(copy.units.imperial)}</span>
            <span class="unit-label-short" data-i18n="units.imperialShort">${escapeHtml(copy.units.imperialShort)}</span>
          </button>
          <button type="button" class="unit-btn" data-unit="metric" aria-pressed="false">
            <span class="unit-label-full" data-i18n="units.metric">${escapeHtml(copy.units.metric)}</span>
            <span class="unit-label-short" data-i18n="units.metricShort">${escapeHtml(copy.units.metricShort)}</span>
          </button>
          <button type="button" class="unit-btn" data-unit="mixed" aria-pressed="false">
            <span class="unit-label-full" data-i18n="units.mixed">${escapeHtml(copy.units.mixed)}</span>
            <span class="unit-label-short" data-i18n="units.mixedShort">${escapeHtml(copy.units.mixedShort)}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Calculator Core: Input (Left) + Results & Diagram (Right) -->
    <main class="core-grid no-print">
      <!-- Section 2: Input Card -->
      <section class="card" aria-label="Quilt binding inputs">
        <!-- 2.1 Quilt Size Presets -->
        <div class="field-group">
          <div class="field-header">
            <span class="field-label" data-i18n="presets.label">${escapeHtml(copy.presets.label)}</span>
            <span class="custom-badge" id="customPresetBadge" hidden data-i18n="presets.custom">${escapeHtml(copy.presets.custom)}</span>
          </div>
          <div class="preset-grid" id="presetGrid">
${presetsHtml}
          </div>
        </div>

        <!-- 2.2 Width x Length -->
        <div class="field-group">
          <div class="dim-row">
            <div>
              <label class="field-label" for="inputWidth" data-i18n="inputs.width">${escapeHtml(copy.inputs.width)}</label>
              <div class="input-wrap" style="margin-top: 8px;">
                <input id="inputWidth" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${DEFAULTS.width}" />
                <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
              </div>
              <p class="field-error-msg" id="errWidth" hidden role="alert"></p>
            </div>
            <div>
              <label class="field-label" for="inputLength" data-i18n="inputs.length">${escapeHtml(copy.inputs.length)}</label>
              <div class="input-wrap" style="margin-top: 8px;">
                <input id="inputLength" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${DEFAULTS.length}" />
                <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
              </div>
              <p class="field-error-msg" id="errLength" hidden role="alert"></p>
            </div>
          </div>
          <div class="dim-warning" id="dimWarning" hidden role="status"></div>
        </div>

        <!-- 2.3 Cut Style -->
        <div class="field-group">
          <span class="field-label" style="margin-bottom: 10px;" data-i18n="inputs.cutStyle.label">${escapeHtml(copy.inputs.cutStyle.label)}</span>
          <div class="cut-style-grid" role="group">
            <button type="button" class="cut-btn" data-cut-style="straight" aria-pressed="true">
              <span class="cut-btn-title" data-i18n="inputs.cutStyle.straight">${escapeHtml(copy.inputs.cutStyle.straight)}</span>
              <span class="cut-btn-hint" data-i18n="inputs.cutStyle.straightHint">${escapeHtml(copy.inputs.cutStyle.straightHint)}</span>
            </button>
            <button type="button" class="cut-btn" data-cut-style="bias" aria-pressed="false">
              <span class="cut-btn-title" data-i18n="inputs.cutStyle.bias">${escapeHtml(copy.inputs.cutStyle.bias)}</span>
              <span class="cut-btn-hint" data-i18n="inputs.cutStyle.biasHint">${escapeHtml(copy.inputs.cutStyle.biasHint)}</span>
            </button>
          </div>
        </div>

        <!-- 2.4 Strip Width -->
        <div class="field-group">
          <span class="field-label" style="margin-bottom: 10px;" data-i18n="inputs.stripWidth.label">${escapeHtml(copy.inputs.stripWidth.label)}</span>
          <div class="strip-grid" id="stripGrid">
${stripsHtml}
          </div>
          <div class="custom-strip-drawer" id="customStripDrawer" hidden>
            <label for="inputCustomStrip" data-i18n="inputs.stripWidth.customLabel">${escapeHtml(copy.inputs.stripWidth.customLabel)}</label>
            <div class="input-wrap">
              <input id="inputCustomStrip" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${DEFAULTS.stripWidth}" />
              <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
            </div>
            <p class="field-error-msg" id="errCustomStrip" hidden role="alert"></p>
          </div>
        </div>

        <!-- 2.5 Advanced Options (Collapsed by default) -->
        <div class="advanced-box">
          <button type="button" class="advanced-toggle" id="advancedToggle" aria-expanded="false" aria-controls="advancedPanel">
            <span class="advanced-toggle-text">
              <span class="advanced-title" data-i18n="advanced.toggle">${escapeHtml(copy.advanced.toggle)}</span>
              <span class="advanced-summary" id="advancedSummary">${escapeHtml(defAdvSummary)}</span>
            </span>
            <span class="advanced-action-pill" id="advancedActionPill">${escapeHtml(copy.advanced.edit)}</span>
          </button>

          <div class="advanced-panel" id="advancedPanel" hidden>
            <div class="adv-field">
              <label for="inputWof" data-i18n="advanced.wof">${escapeHtml(copy.advanced.wof)}</label>
              <div class="input-wrap">
                <input id="inputWof" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${DEFAULTS.wof}" />
                <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
              </div>
              <p class="field-error-msg" id="errWof" hidden role="alert"></p>
              <p class="adv-hint" data-i18n="advanced.wofHint">${escapeHtml(copy.advanced.wofHint)}</p>
            </div>

            <div class="adv-field">
              <label for="inputExtra" data-i18n="advanced.extra">${escapeHtml(copy.advanced.extra)}</label>
              <div class="input-wrap">
                <input id="inputExtra" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${DEFAULTS.extra}" />
                <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
              </div>
              <p class="field-error-msg" id="errExtra" hidden role="alert"></p>
              <p class="adv-hint" data-i18n="advanced.extraHint">${escapeHtml(copy.advanced.extraHint)}</p>
            </div>

            <div class="adv-field" id="joinMethodField">
              <label data-i18n="advanced.joinType">${escapeHtml(copy.advanced.joinType)}</label>
              <div class="join-row" role="group">
                <button type="button" class="join-btn" data-join-type="diagonal" aria-pressed="true" data-i18n="advanced.diagonal">${escapeHtml(copy.advanced.diagonal)}</button>
                <button type="button" class="join-btn" data-join-type="straight" aria-pressed="false" data-i18n="advanced.straight">${escapeHtml(copy.advanced.straight)}</button>
              </div>
              <div class="seam-drawer" id="seamDrawer" hidden>
                <label for="inputSeam" data-i18n="advanced.seam">${escapeHtml(copy.advanced.seam)}</label>
                <div class="input-wrap">
                  <input id="inputSeam" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${DEFAULTS.seam}" />
                  <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
                </div>
                <p class="field-error-msg" id="errSeam" hidden role="alert"></p>
              </div>
            </div>

            <div class="adv-field">
              <label for="inputSquaring" data-i18n="advanced.squaring">${escapeHtml(copy.advanced.squaring)}</label>
              <div class="input-wrap">
                <input id="inputSquaring" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${DEFAULTS.squaring}" />
                <span class="input-suffix" data-unit-suffix>${escapeHtml(copy.units.in)}</span>
              </div>
              <p class="field-error-msg" id="errSquaring" hidden role="alert"></p>
              <p class="adv-hint" data-i18n="advanced.squaringHint">${escapeHtml(copy.advanced.squaringHint)}</p>
            </div>

            <div class="adv-reset-row">
              <button type="button" class="btn-reset" id="btnReset" data-i18n="advanced.reset">${escapeHtml(copy.advanced.reset)}</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Right Column: Section 3 (Result Card) + Section 4 (SVG Diagram) -->
      <div class="results-column">
        <!-- Section 3: Result Card -->
        <section class="result-card" id="resultCard" aria-live="polite">
          <div class="result-error" id="resultError" hidden></div>

          <div class="result-valid" id="resultValid">
            <div class="buy-hero">
              <div class="buy-label" data-i18n="results.buyHeading">${escapeHtml(copy.results.buyHeading)}</div>
              <div class="buy-value" id="buyValue">${escapeHtml(defBuyImperial)}</div>
              <div class="buy-sub" id="buySub">${escapeHtml(defBuySub)}</div>
              <div class="buy-rounding" id="buyRounding">${escapeHtml(copy.results.roundingImperial)}</div>
              <p class="buy-footnote" data-i18n="results.roundingFootnote">${escapeHtml(copy.results.roundingFootnote)}</p>
            </div>

            <div class="instruction-box" id="cuttingInstruction">${defInstruction}</div>

            <div class="breakdown-grid">
              <div class="breakdown-cell">
                <div class="breakdown-label" data-i18n="results.totalBinding">${escapeHtml(copy.results.totalBinding)}</div>
                <div class="breakdown-value" id="bdTotalVal">${formatInchesDisplay(defRes.totalLength)}"</div>
                <div class="breakdown-sub" id="bdTotalSub">${formatInchesDisplay(defRes.perimeter)}" + ${formatInchesDisplay(defRes.extra)}" extra</div>
              </div>
              <div class="breakdown-cell">
                <div class="breakdown-label" data-i18n="results.exactFabric">${escapeHtml(copy.results.exactFabric)}</div>
                <div class="breakdown-value" id="bdFabricVal">${formatInchesDisplay(defRes.fabricInches)}"</div>
                <div class="breakdown-sub" id="bdFabricSub">${formatInchesDisplay(defRes.stripsFabricInches)}" + ${formatInchesDisplay(defRes.squaring)}" squaring</div>
              </div>
              <div class="breakdown-cell">
                <div class="breakdown-label" id="bdCountLabel">${escapeHtml(copy.results.stripsLabel)}</div>
                <div class="breakdown-value" id="bdCountVal">${defRes.strips} ${escapeHtml(copy.results.stripPlural)}</div>
                <div class="breakdown-sub" id="bdCountSub">at ${formatInchesDisplay(DEFAULTS.stripWidth)}" each</div>
              </div>
            </div>

            <div class="action-row">
              <button type="button" class="btn-print" id="btnPrint" data-i18n="actions.printCard">${escapeHtml(copy.actions.printCard)}</button>
              <button type="button" class="btn-copy" id="btnCopy" data-i18n="actions.copyPlan">${escapeHtml(copy.actions.copyPlan)}</button>
            </div>
          </div>
        </section>

        <!-- Section 4: Dynamic SVG Cutting Diagram -->
        <section class="card diagram-card" id="diagramCard">
          <h2 data-i18n="diagram.heading">${escapeHtml(copy.diagram.heading)}</h2>
          <div class="diagram-stage" id="diagramStage"></div>
          <p class="diagram-note" data-i18n="diagram.scaleNote">${escapeHtml(copy.diagram.scaleNote)}</p>
        </section>
      </div>
    </main>

    <!-- Below-the-Fold Content Sections (Single-column 760px on desktop) -->
    <div class="content-sections no-print">
      <!-- Section 5: 3 Before-You-Cut Tips -->
      <section class="card" id="before-you-cut">
        <h2 class="section-heading" data-i18n="tips.heading">${escapeHtml(copy.tips.heading)}</h2>
        <ol class="tips-list" id="tipsList">
${tipsHtml}
        </ol>
      </section>

      <!-- Section 6: Helpful Tools & Guides (v1 Internal References) -->
      <section class="card" id="helpful-tools">
        <h2 class="section-heading" data-i18n="recommendations.heading">${escapeHtml(copy.recommendations.heading)}</h2>
        <p class="rec-disclosure" data-i18n="recommendations.disclosure">${escapeHtml(copy.recommendations.disclosure)}</p>
        <div class="rec-grid" id="recGrid">
${recsHtml}
        </div>
      </section>

      <!-- Section 7: SEO Copy + Standard Quilt Quick Chart + FAQ -->
      <section class="card" id="guide-section">
        <div id="seoBlocks">
${seoHtml}
        </div>

        <div class="chart-wrap" id="quick-chart">
          <h2 data-i18n="seo.chartHeading">${escapeHtml(copy.seo.chartHeading)}</h2>
          <p class="chart-note" data-i18n="seo.chartNote">${escapeHtml(copy.seo.chartNote)}</p>
          <div class="table-scroll">
            <table class="quick-table" id="quickChartTable">
${chartTableHtml}
            </table>
          </div>
        </div>
      </section>

      <section class="card" id="faq-section">
        <h2 class="section-heading" data-i18n="faq.heading">${escapeHtml(copy.faq.heading)}</h2>
        <div class="faq-list" id="faqList">
${faqHtml}
        </div>
      </section>

      <footer class="site-footer">
        <span data-i18n="footer.copyright">${escapeHtml(copy.footer.copyright)}</span>
        <a href="../about/" data-i18n="footer.aboutLink">${escapeHtml(copy.footer.aboutLink)}</a>
      </footer>
    </div>

    <!-- Mobile Sticky Bottom Result Bar -->
    <button type="button" class="sticky-result-bar no-print" id="stickyResultBar" hidden>
      <span class="sticky-bar-main" id="stickyBarText"></span>
      <span class="sticky-bar-cta" data-i18n="stickyBar.viewDetails">${escapeHtml(copy.stickyBar.viewDetails)}</span>
    </button>

    <!-- Dedicated Print Cutting Card (@media print only) -->
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
console.log("Pre-rendered quilt-binding-calculator/index.html successfully from en.json!");
