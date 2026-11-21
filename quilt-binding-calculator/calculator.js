/**
 * Quilt Binding Calculator — Pure Math Engine (Inches Internally)
 * v1.1 Specification:
 *  - TotalLength = 2 * (W + H) + Extra
 *  - Straight-of-Grain (unchanged):
 *      loss = (joinType === 'diagonal') ? S : (2 * seam)
 *      Strips = max(1, ceil(TotalLength / (WOF - loss) - 1e-9))
 *      FabricInches = Strips * S + Squaring
 *  - Bias (v1.1 Continuous Bias Square + piecing panels):
 *      BiasArea = TotalLength * S * 1.10
 *      BiasSquareInches = ceil(sqrt(BiasArea))
 *      panels = (BiasSquareInches <= WOF) ? 1 : ceil(BiasSquareInches / (WOF - 0.5) - 1e-9)
 *      FabricInches = panels * (BiasSquareInches + Squaring)
 *  - Imperial Buy:
 *      Eighths = ceil(FabricInches / 4.5 - 1e-9)
 *      BuyYards = Eighths / 8 (formatted as reduced mixed fraction)
 *  - Metric Buy:
 *      BuyMetres = ceil((FabricInches * 2.54) / 5 - 1e-9) * 0.05
 */

export const CM_PER_INCH = 2.54;
export const BIAS_ALLOWANCE_FACTOR = 1.10;
export const LARGE_DIMENSION_WARNING_INCHES = 150;

export const PRESETS = [
  { id: "baby", width: 36, length: 52 },
  { id: "throw", width: 50, length: 65 },
  { id: "twin", width: 70, length: 90 },
  { id: "queen", width: 90, length: 108 },
  { id: "king", width: 108, length: 108 }
];

export const STRIP_PRESETS = [2.25, 2.5, 3];

export const DEFAULTS = {
  unitMode: "imperial", // "imperial" | "metric" | "mixed"
  width: 50,            // internal inches
  length: 65,           // internal inches
  cutStyle: "straight", // "straight" | "bias"
  stripWidth: 2.5,      // internal inches
  isCustomStrip: false,
  wof: 42,              // internal inches (selvedges removed)
  extra: 12,            // internal inches
  joinType: "diagonal", // "diagonal" | "straight"
  seam: 0.25,           // internal inches (used when joinType === "straight")
  squaring: 2           // internal inches
};

export function inchesToCm(inches) {
  return inches * CM_PER_INCH;
}

export function cmToInches(cm) {
  return cm / CM_PER_INCH;
}

/**
 * Parse user numeric input, supporting standard decimals as well as
 * mixed numbers and fractions such as "2 1/8", "100 1/2", "3/8", "2-1/4".
 */
export function parseFractionOrNumber(raw, allowFractions = true) {
  if (typeof raw !== "string") return NaN;
  const s = raw.trim().replace(",", ".");
  if (s === "") return NaN;

  if (allowFractions) {
    // Mixed number: e.g. "2 1/8" or "100-1/2"
    const mixedMatch = s.match(/^([+-]?\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)$/);
    if (mixedMatch) {
      const whole = Number(mixedMatch[1]);
      const num = Number(mixedMatch[2]);
      const den = Number(mixedMatch[3]);
      if (den === 0) return NaN;
      const sign = whole < 0 || s.startsWith("-") ? -1 : 1;
      return sign * (Math.abs(whole) + num / den);
    }

    // Simple fraction: e.g. "3/8"
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

/**
 * Format eighths of a yard as a reduced mixed fraction string, e.g.:
 *   4 -> "1/2"
 *   5 -> "5/8"
 *   8 -> "1"
 *  10 -> "1 1/4"
 *  19 -> "2 3/8"
 */
export function formatYardsFraction(eighths) {
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  if (rem === 0) {
    return `${whole}`;
  }
  const d = gcd(rem, 8);
  const num = rem / d;
  const den = 8 / d;
  if (whole === 0) {
    return `${num}/${den}`;
  }
  return `${whole} ${num}/${den}`;
}

const EIGHTH_GLYPHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];

/**
 * Format an inch measurement using 1/8-inch quilting fractions (⅛, ¼, ⅜, ½, ⅝, ¾, ⅞).
 * Example: 2.125 -> "2⅛", 2.625 -> "2⅝", 0.375 -> "⅜", 30 -> "30".
 */
export function formatInchesDisplay(value) {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const totalEighths = Math.round(abs * 8);
  const whole = Math.floor(totalEighths / 8);
  const rem = totalEighths % 8;
  const glyph = EIGHTH_GLYPHS[rem];

  if (rem === 0) {
    return `${sign}${whole}`;
  }
  if (whole === 0) {
    return `${sign}${glyph}`;
  }
  return `${sign}${whole}${glyph}`;
}

export function formatCmDisplay(inches) {
  const cm = inches * CM_PER_INCH;
  const rounded = Math.round(cm * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

/**
 * Format input box value from internal inches according to input unit ("in" or "cm").
 */
export function formatInputFromInches(inches, inputUnit) {
  if (!Number.isFinite(inches)) return "";
  if (inputUnit === "cm") {
    const cm = Math.round(inches * CM_PER_INCH * 10) / 10;
    return String(cm);
  }
  const clean = Math.round(inches * 1000) / 1000;
  return String(clean);
}

/**
 * Validate all fields and return a map of field-specific error keys.
 */
export function validateFields(params) {
  const {
    width,
    length,
    stripWidth,
    wof,
    extra,
    squaring,
    cutStyle,
    joinType,
    seam
  } = params;

  const isPos = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
  const isNonNeg = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;

  const fieldErrors = {};

  if (!isPos(width)) fieldErrors.width = "widthPositive";
  if (!isPos(length)) fieldErrors.length = "lengthPositive";
  if (!isPos(stripWidth)) fieldErrors.stripWidth = "stripPositive";
  if (!isPos(wof)) fieldErrors.wof = "wofPositive";
  if (!isNonNeg(extra)) fieldErrors.extra = "nonNegative";
  if (!isNonNeg(squaring)) fieldErrors.squaring = "nonNegative";

  if (cutStyle === "straight" && joinType === "straight" && !isNonNeg(seam)) {
    fieldErrors.seam = "nonNegative";
  }

  if (Object.keys(fieldErrors).length === 0) {
    if (cutStyle === "straight") {
      const loss = joinType === "diagonal" ? stripWidth : 2 * seam;
      if (wof - loss <= 0) {
        if (joinType === "diagonal") {
          fieldErrors.stripWidth = "stripTooWide";
        } else {
          fieldErrors.seam = "invalidSeam";
        }
      }
    } else {
      if (stripWidth >= wof) {
        fieldErrors.stripWidth = "stripTooWide";
      } else {
        const totalLength = 2 * (width + length) + extra;
        const biasArea = totalLength * stripWidth * BIAS_ALLOWANCE_FACTOR;
        const biasSquareInches = Math.ceil(Math.sqrt(biasArea));
        if (biasSquareInches > wof && wof <= 0.5) {
          fieldErrors.wof = "wofTooSmallForBias";
        }
      }
    }
  }

  return fieldErrors;
}

/**
 * Main calculation function.
 * All inputs are in inches.
 */
export function calculateBinding(params) {
  const {
    width,
    length,
    stripWidth,
    wof,
    extra,
    squaring,
    cutStyle,
    joinType,
    seam
  } = params;

  const fieldErrors = validateFields(params);
  const errorKeys = Object.values(fieldErrors);
  if (errorKeys.length > 0) {
    return {
      valid: false,
      errorKey: errorKeys[0],
      fieldErrors
    };
  }

  const perimeter = 2 * (width + length);
  const totalLength = perimeter + extra;

  if (cutStyle === "straight") {
    const loss = joinType === "diagonal" ? stripWidth : 2 * seam;
    const usableStripLength = wof - loss;
    const strips = Math.max(1, Math.ceil(totalLength / usableStripLength - 1e-9));
    const stripsFabricInches = strips * stripWidth;
    const fabricInches = stripsFabricInches + squaring;

    const eighths = Math.ceil(fabricInches / 4.5 - 1e-9);
    const buyYards = eighths / 8;
    const buyYardsLabel = formatYardsFraction(eighths);
    const buyMetres = Math.ceil((fabricInches * CM_PER_INCH) / 5 - 1e-9) * 0.05;

    return {
      valid: true,
      fieldErrors: {},
      cutStyle: "straight",
      perimeter,
      extra,
      totalLength,
      loss,
      usableStripLength,
      strips,
      stripsFabricInches,
      squaring,
      fabricInches,
      eighths,
      buyYards,
      buyYardsLabel,
      buyMetres,
      buyMetresLabel: buyMetres.toFixed(2)
    };
  }

  // Bias mode (v1.1 Continuous Bias Square + piecing panels)
  const biasArea = totalLength * stripWidth * BIAS_ALLOWANCE_FACTOR;
  const biasSquareInches = Math.ceil(Math.sqrt(biasArea));
  const panels =
    biasSquareInches <= wof
      ? 1
      : Math.ceil(biasSquareInches / (wof - 0.5) - 1e-9);
  const netFabricInches = panels * biasSquareInches;
  const squaringTotal = panels * squaring;
  const fabricInches = panels * (biasSquareInches + squaring);

  const eighths = Math.ceil(fabricInches / 4.5 - 1e-9);
  const buyYards = eighths / 8;
  const buyYardsLabel = formatYardsFraction(eighths);
  const buyMetres = Math.ceil((fabricInches * CM_PER_INCH) / 5 - 1e-9) * 0.05;

  return {
    valid: true,
    fieldErrors: {},
    cutStyle: "bias",
    perimeter,
    extra,
    totalLength,
    biasArea,
    biasSquareInches,
    panels,
    netFabricInches,
    squaring,
    squaringTotal,
    fabricInches,
    eighths,
    buyYards,
    buyYardsLabel,
    buyMetres,
    buyMetresLabel: buyMetres.toFixed(2)
  };
}
