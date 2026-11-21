/**
 * Quilt Backing & Batting Calculator — Pure Math Engine (Inches Internally)
 *
 * Specification:
 *  - Target dimensions: Wt = W + 2 * O, Lt = L + 2 * O
 *  - Usable fabric width: U = WOF - selvageDeduction (default 2")
 *  - Seam allowance: 0.5" per edge (1.0" net loss per seam)
 *  - Panels for span S, cut length C:
 *      if S <= U -> N = 1
 *      else      -> N = ceil((S - 1) / (U - 1) - 1e-9)
 *      seams = N - 1
 *  - Exact fabric inches: exactInches = N * C
 *  - Imperial buy: ceil((exactInches / 36) * 8 - 1e-9) / 8 (nearest 1/8 yd)
 *  - Metric buy (corrected): ceil((exactInches * 0.0254) / 0.05 - 1e-9) * 0.05 (nearest 0.05 m)
 */

export const CM_PER_INCH = 2.54;
export const SEAM_ALLOWANCE_PER_EDGE = 0.5;
export const SEAM_NET_LOSS = 1.0;
export const LARGE_DIMENSION_WARNING_INCHES = 150;

export const FABRIC_WIDTH_PRESETS = [42, 44, 54, 108];

export const QUILTING_METHODS = [
  { id: "domestic", overage: 3 },
  { id: "longarm", overage: 4 },
  { id: "custom", overage: null }
];

export const BATTING_PACKAGES = [
  { id: "craft", width: 36, length: 45 },
  { id: "crib", width: 45, length: 60 },
  { id: "twin", width: 72, length: 90 },
  { id: "full", width: 81, length: 96 },
  { id: "queen", width: 90, length: 108 },
  { id: "king", width: 120, length: 120 }
];

export const DEFAULTS = {
  unitMode: "imperial", // "imperial" | "metric" | "mixed"
  width: 60,            // internal inches
  length: 80,           // internal inches
  fabricWidth: 44,      // internal inches (bolt width)
  selvageDeduction: 2,  // internal inches (1" per edge)
  quiltingMethod: "domestic", // "domestic" | "longarm" | "custom"
  overage: 3,           // internal inches per side
  isDirectional: false
};

export function inchesToCm(inches) {
  return inches * CM_PER_INCH;
}

export function cmToInches(cm) {
  return cm / CM_PER_INCH;
}

export function parseFractionOrNumber(raw, allowFractions = true) {
  if (typeof raw !== "string") return NaN;
  const s = raw.trim().replace(",", ".");
  if (s === "") return NaN;

  if (allowFractions) {
    const mixedMatch = s.match(/^([+-]?\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)$/);
    if (mixedMatch) {
      const whole = Number(mixedMatch[1]);
      const num = Number(mixedMatch[2]);
      const den = Number(mixedMatch[3]);
      if (den === 0) return NaN;
      const sign = whole < 0 || s.startsWith("-") ? -1 : 1;
      return sign * (Math.abs(whole) + num / den);
    }

    const fracMatch = s.match(/^([+-]?\d+)\s*\/\s*(\d+)$/);
    if (fracMatch) {
      const num = Number(fracMatch[1]);
      const den = Number(fracMatch[2]);
      if (den === 0) return NaN;
      return num / den;
    }
  }

  const num = Number(s);
  return Number.isFinite(num) ? num : NaN;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function formatYardsFraction(eighths) {
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  if (rem === 0) return `${whole}`;
  const d = gcd(rem, 8);
  const num = rem / d;
  const den = 8 / d;
  if (whole === 0) return `${num}/${den}`;
  return `${whole} ${num}/${den}`;
}

const EIGHTH_GLYPHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];

export function formatInchesDisplay(value) {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const totalEighths = Math.round(abs * 8);
  const whole = Math.floor(totalEighths / 8);
  const rem = totalEighths % 8;
  const glyph = EIGHTH_GLYPHS[rem];

  if (rem === 0) return `${sign}${whole}`;
  if (whole === 0) return `${sign}${glyph}`;
  return `${sign}${whole}${glyph}`;
}

export function formatCmDisplay(inches) {
  const cm = inches * CM_PER_INCH;
  const rounded = Math.round(cm * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

export function formatInputFromInches(inches, inputUnit) {
  if (!Number.isFinite(inches)) return "";
  if (inputUnit === "cm") {
    const cm = Math.round(inches * CM_PER_INCH * 10) / 10;
    return Number.isInteger(cm) ? `${cm}` : `${cm}`;
  }
  const rounded = Math.round(inches * 1000) / 1000;
  return `${rounded}`;
}

function calcOrientation(span, cutLength, usableWof) {
  const panels =
    span <= usableWof + 1e-9
      ? 1
      : Math.ceil((span - 1) / (usableWof - 1) - 1e-9);
  const seams = panels - 1;
  const exactInches = panels * cutLength;
  const exactYards = exactInches / 36;
  const eighths = Math.ceil(exactYards * 8 - 1e-9);
  const buyYards = eighths / 8;
  const buyYardsLabel = formatYardsFraction(eighths);
  const buyMetres =
    Math.ceil((exactInches * CM_PER_INCH) / 5 - 1e-9) * 0.05;
  const buyMetresLabel = buyMetres.toFixed(2);

  return {
    panels,
    seams,
    cutLength,
    exactInches,
    exactYards,
    eighths,
    buyYards,
    buyYardsLabel,
    buyMetres,
    buyMetresLabel
  };
}

export function matchBattingPackage(targetW, targetL) {
  const minSide = Math.min(targetW, targetL);
  const maxSide = Math.max(targetW, targetL);
  for (const pkg of BATTING_PACKAGES) {
    const pkgMin = Math.min(pkg.width, pkg.length);
    const pkgMax = Math.max(pkg.width, pkg.length);
    if (minSide <= pkgMin + 1e-9 && maxSide <= pkgMax + 1e-9) {
      return {
        fitsPackage: true,
        exceedKing: false,
        packageId: pkg.id,
        packageWidth: pkg.width,
        packageLength: pkg.length
      };
    }
  }
  return {
    fitsPackage: false,
    exceedKing: true,
    packageId: "by-the-yard",
    packageWidth: null,
    packageLength: null
  };
}

function buildDiagramData({
  width,
  length,
  overage,
  backingWidth,
  backingLength,
  usableWof,
  orientation,
  plan
}) {
  const layoutMode = plan.panels === 1 ? "single" : orientation;
  const cuttingDirection = orientation === "vertical" ? "lengthwise" : "crosswise";
  const panels = [];
  const seams = [];

  if (orientation === "vertical") {
    // Panels sit side-by-side along X (width), each running full backingLength along Y
    const stepX = backingWidth / plan.panels;
    for (let i = 0; i < plan.panels; i++) {
      panels.push({
        index: i + 1,
        cutWidth: usableWof,
        cutLength: backingLength,
        x: i * stepX,
        y: 0,
        drawWidth: stepX,
        drawHeight: backingLength
      });
      if (i > 0) {
        seams.push({
          index: i,
          orientation: "vertical",
          x1: i * stepX,
          y1: 0,
          x2: i * stepX,
          y2: backingLength,
          label: '1/2" seam'
        });
      }
    }
  } else {
    // Panels stack top-to-bottom along Y (length), each running full backingWidth along X
    const stepY = backingLength / plan.panels;
    for (let i = 0; i < plan.panels; i++) {
      panels.push({
        index: i + 1,
        cutWidth: usableWof,
        cutLength: backingWidth,
        x: 0,
        y: i * stepY,
        drawWidth: backingWidth,
        drawHeight: stepY
      });
      if (i > 0) {
        seams.push({
          index: i,
          orientation: "horizontal",
          x1: 0,
          y1: i * stepY,
          x2: backingWidth,
          y2: i * stepY,
          label: '1/2" seam'
        });
      }
    }
  }

  return {
    backingWidth,
    backingLength,
    quiltTopRect: {
      x: overage,
      y: overage,
      width,
      height: length
    },
    layoutMode,
    orientation,
    cuttingDirection,
    panelCount: plan.panels,
    seamCount: plan.seams,
    seamAllowancePerEdge: SEAM_ALLOWANCE_PER_EDGE,
    panels,
    seams
  };
}

export function calculateBacking(rawInput = {}) {
  const input = { ...DEFAULTS, ...rawInput };
  const {
    width,
    length,
    fabricWidth,
    selvageDeduction,
    overage,
    isDirectional
  } = input;

  const fieldErrors = {};

  if (!Number.isFinite(width) || width <= 0) {
    fieldErrors.width = "widthPositive";
  }
  if (!Number.isFinite(length) || length <= 0) {
    fieldErrors.length = "lengthPositive";
  }
  if (!Number.isFinite(fabricWidth) || fabricWidth <= 4) {
    fieldErrors.fabricWidth = "fabricWidthTooSmall";
  }
  if (!Number.isFinite(selvageDeduction) || selvageDeduction < 0) {
    fieldErrors.selvageDeduction = "nonNegative";
  }
  if (!Number.isFinite(overage) || overage < 0) {
    fieldErrors.overage = "nonNegative";
  }

  const usableWof = fabricWidth - selvageDeduction;
  if (
    !fieldErrors.fabricWidth &&
    !fieldErrors.selvageDeduction &&
    usableWof <= 1
  ) {
    fieldErrors.selvageDeduction = "usableWofTooSmall";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { valid: false, fieldErrors, warnings: [] };
  }

  const backingWidth = width + 2 * overage;
  const backingLength = length + 2 * overage;

  const vertical = calcOrientation(backingWidth, backingLength, usableWof);
  const horizontal = calcOrientation(backingLength, backingWidth, usableWof);

  let chosenOrientation = "vertical";
  if (!isDirectional) {
    if (horizontal.exactInches < vertical.exactInches - 1e-9) {
      chosenOrientation = "horizontal";
    } else if (vertical.exactInches < horizontal.exactInches - 1e-9) {
      chosenOrientation = "vertical";
    } else if (horizontal.seams < vertical.seams) {
      chosenOrientation = "horizontal";
    } else {
      chosenOrientation = "vertical";
    }
  }

  const primary = chosenOrientation === "vertical" ? vertical : horizontal;
  const alternative = chosenOrientation === "vertical" ? horizontal : vertical;
  const alternativeOrientation =
    chosenOrientation === "vertical" ? "horizontal" : "vertical";

  const diagram = buildDiagramData({
    width,
    length,
    overage,
    backingWidth,
    backingLength,
    usableWof,
    orientation: chosenOrientation,
    plan: primary
  });

  const battingMatch = matchBattingPackage(backingWidth, backingLength);
  const batting = {
    width: backingWidth,
    length: backingLength,
    ...battingMatch
  };

  const warnings = [];
  if (
    width > LARGE_DIMENSION_WARNING_INCHES ||
    length > LARGE_DIMENSION_WARNING_INCHES
  ) {
    warnings.push("largeDimension");
  }
  if (primary.panels >= 3) {
    warnings.push("multiPanelWidebackTip");
  }
  if (fabricWidth >= 90 && primary.panels > 1) {
    warnings.push("widebackExceeded");
  }

  return {
    valid: true,
    fieldErrors: {},
    warnings,
    usableWof,
    backingWidth,
    backingLength,
    isDirectional: Boolean(isDirectional),
    chosenOrientation,
    alternativeOrientation,
    primary,
    alternative,
    diagram,
    batting
  };
}
