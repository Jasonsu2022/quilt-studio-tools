/**
 * Quilt Binding Calculator — Pure Math Engine (Inches Internally)
 * Locked specification:
 *  - TotalLength = 2 * (W + H) + Extra
 *  - Straight-of-Grain:
 *      loss = (joinType === 'diagonal') ? S : (2 * seam)
 *      Strips = max(1, ceil(TotalLength / (WOF - loss) - 1e-9))
 *      FabricInches = Strips * S + Squaring
 *  - Bias:
 *      BiasArea = TotalLength * S * 1.15
 *      BiasSquareInches = ceil(sqrt(BiasArea))
 *      FabricInches = BiasArea / WOF + Squaring
 *  - Imperial Buy:
 *      Eighths = ceil(FabricInches / 4.5 - 1e-9)
 *      BuyYards = Eighths / 8 (formatted as reduced mixed fraction)
 *  - Metric Buy:
 *      BuyMetres = ceil((FabricInches * 2.54) / 5 - 1e-9) * 0.05
 */

export const CM_PER_INCH = 2.54;
export const BIAS_ALLOWANCE_FACTOR = 1.15;

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

/**
 * Format an inch measurement nicely for display:
 * Uses common quilting fractions (¼, ½, ¾) when exact within 1e-4,
 * otherwise up to 1 decimal place.
 */
export function formatInchesDisplay(value) {
  const rounded = Math.round(value * 100) / 100;
  const whole = Math.floor(rounded + 1e-9);
  const frac = rounded - whole;

  if (Math.abs(frac) < 1e-3) {
    return `${whole}`;
  }
  if (Math.abs(frac - 0.25) < 1e-3) {
    return whole > 0 ? `${whole}¼` : `¼`;
  }
  if (Math.abs(frac - 0.5) < 1e-3) {
    return whole > 0 ? `${whole}½` : `½`;
  }
  if (Math.abs(frac - 0.75) < 1e-3) {
    return whole > 0 ? `${whole}¾` : `¾`;
  }
  return `${Number(value.toFixed(1))}`;
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
  // Keep clean precision for inches without floating noise
  const clean = Math.round(inches * 1000) / 1000;
  return String(clean);
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

  const isFinitePos = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
  const isFiniteNonNeg = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;

  if (!isFinitePos(width) || !isFinitePos(length) || !isFinitePos(stripWidth) || !isFinitePos(wof)) {
    return { valid: false, errorKey: "positiveNumber" };
  }
  if (!isFiniteNonNeg(extra) || !isFiniteNonNeg(squaring)) {
    return { valid: false, errorKey: "positiveNumber" };
  }
  if (cutStyle === "straight" && joinType === "straight" && !isFiniteNonNeg(seam)) {
    return { valid: false, errorKey: "invalidSeam" };
  }

  const perimeter = 2 * (width + length);
  const totalLength = perimeter + extra;

  if (cutStyle === "straight") {
    const loss = joinType === "diagonal" ? stripWidth : 2 * seam;
    const usableStripLength = wof - loss;
    if (usableStripLength <= 0) {
      return {
        valid: false,
        errorKey: joinType === "diagonal" ? "stripTooWide" : "invalidSeam"
      };
    }

    const strips = Math.max(1, Math.ceil(totalLength / usableStripLength - 1e-9));
    const stripsFabricInches = strips * stripWidth;
    const fabricInches = stripsFabricInches + squaring;

    const eighths = Math.ceil(fabricInches / 4.5 - 1e-9);
    const buyYards = eighths / 8;
    const buyYardsLabel = formatYardsFraction(eighths);
    const buyMetres = Math.ceil((fabricInches * CM_PER_INCH) / 5 - 1e-9) * 0.05;

    return {
      valid: true,
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

  // Bias mode
  if (stripWidth >= wof) {
    return { valid: false, errorKey: "stripTooWide" };
  }

  const biasArea = totalLength * stripWidth * BIAS_ALLOWANCE_FACTOR;
  const biasSquareInches = Math.ceil(Math.sqrt(biasArea));
  const netFabricInches = biasArea / wof;
  const fabricInches = netFabricInches + squaring;

  const eighths = Math.ceil(fabricInches / 4.5 - 1e-9);
  const buyYards = eighths / 8;
  const buyYardsLabel = formatYardsFraction(eighths);
  const buyMetres = Math.ceil((fabricInches * CM_PER_INCH) / 5 - 1e-9) * 0.05;

  return {
    valid: true,
    cutStyle: "bias",
    perimeter,
    extra,
    totalLength,
    biasArea,
    biasSquareInches,
    netFabricInches,
    squaring,
    fabricInches,
    eighths,
    buyYards,
    buyYardsLabel,
    buyMetres,
    buyMetresLabel: buyMetres.toFixed(2)
  };
}
