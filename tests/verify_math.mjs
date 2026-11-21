import assert from "node:assert/strict";
import {
  calculateBinding,
  DEFAULTS,
  parseFractionOrNumber,
  formatInchesDisplay,
  formatInputFromInches,
  cmToInches,
  inchesToCm
} from "../quilt-binding-calculator/calculator.js";

// =========================================================================
// Straight-of-Grain Regression Cases (0–4, unchanged from v1.0)
// =========================================================================

// Case 0: Default (Throw 50x65, S=2.5, WOF=42)
const c0 = calculateBinding(DEFAULTS);
assert.equal(c0.valid, true);
assert.equal(c0.totalLength, 242);
assert.equal(c0.strips, 7);
assert.equal(c0.fabricInches, 19.5);
assert.equal(c0.buyYardsLabel, "5/8");
assert.equal(c0.buyMetresLabel, "0.50");

// Case 1: 60x72, S=2.5, WOF=42
const c1 = calculateBinding({ ...DEFAULTS, width: 60, length: 72 });
assert.equal(c1.valid, true);
assert.equal(c1.totalLength, 276);
assert.equal(c1.strips, 7);
assert.equal(c1.fabricInches, 19.5);
assert.equal(c1.buyYardsLabel, "5/8");
assert.equal(c1.buyMetresLabel, "0.50");

// Case 2: 60x72, S=2.5, WOF=40
const c2 = calculateBinding({ ...DEFAULTS, width: 60, length: 72, wof: 40 });
assert.equal(c2.valid, true);
assert.equal(c2.strips, 8);
assert.equal(c2.fabricInches, 22);
assert.equal(c2.buyYardsLabel, "5/8");
assert.equal(c2.buyMetresLabel, "0.60");

// Case 3: 40x50, S=2.5, WOF=42
const c3 = calculateBinding({ ...DEFAULTS, width: 40, length: 50 });
assert.equal(c3.valid, true);
assert.equal(c3.totalLength, 192);
assert.equal(c3.strips, 5);
assert.equal(c3.fabricInches, 14.5);
assert.equal(c3.buyYardsLabel, "1/2");

// Case 4: 60x72, S=3.0, WOF=42
const c4 = calculateBinding({ ...DEFAULTS, width: 60, length: 72, stripWidth: 3.0 });
assert.equal(c4.valid, true);
assert.equal(c4.strips, 8);
assert.equal(c4.fabricInches, 26);
assert.equal(c4.buyYardsLabel, "3/4");

// =========================================================================
// Bias New Acceptance Cases (B1–B5, v1.1 Continuous Bias Square + panels)
// =========================================================================

// B1: 60x72, S=2.5, WOF=42, Bias -> sq 28", fabric 30", 7/8 yd, 0.80 m
const b1 = calculateBinding({ ...DEFAULTS, width: 60, length: 72, cutStyle: "bias" });
assert.equal(b1.valid, true);
assert.equal(b1.biasSquareInches, 28);
assert.equal(b1.panels, 1);
assert.equal(b1.fabricInches, 30);
assert.equal(b1.buyYardsLabel, "7/8");
assert.equal(b1.buyMetresLabel, "0.80");

// B2: 60x80, S=2.5, WOF=42, Bias -> total 292", sq 29", fabric 31", 7/8 yd, 0.80 m
const b2 = calculateBinding({ ...DEFAULTS, width: 60, length: 80, cutStyle: "bias" });
assert.equal(b2.valid, true);
assert.equal(b2.totalLength, 292);
assert.equal(b2.biasSquareInches, 29);
assert.equal(b2.panels, 1);
assert.equal(b2.fabricInches, 31);
assert.equal(b2.buyYardsLabel, "7/8");
assert.equal(b2.buyMetresLabel, "0.80");

// B3: Throw 50x65, S=2.5, WOF=42, Bias -> sq 26", fabric 28", 7/8 yd, 0.75 m
const b3 = calculateBinding({ ...DEFAULTS, width: 50, length: 65, cutStyle: "bias" });
assert.equal(b3.valid, true);
assert.equal(b3.biasSquareInches, 26);
assert.equal(b3.panels, 1);
assert.equal(b3.fabricInches, 28);
assert.equal(b3.buyYardsLabel, "7/8");
assert.equal(b3.buyMetresLabel, "0.75");

// B4: Queen 90x108, S=2.5, WOF=42, Bias -> sq 34", fabric 36", 1 yd, 0.95 m
const b4 = calculateBinding({ ...DEFAULTS, width: 90, length: 108, cutStyle: "bias" });
assert.equal(b4.valid, true);
assert.equal(b4.biasSquareInches, 34);
assert.equal(b4.panels, 1);
assert.equal(b4.fabricInches, 36);
assert.equal(b4.buyYardsLabel, "1");
assert.equal(b4.buyMetresLabel, "0.95");

// B5: King 108x108, S=3.0, WOF=36, Bias -> sq 39" > 36 -> panels=2, fabric 82", 2 3/8 yd
const b5 = calculateBinding({
  ...DEFAULTS,
  width: 108,
  length: 108,
  stripWidth: 3.0,
  wof: 36,
  cutStyle: "bias"
});
assert.equal(b5.valid, true);
assert.equal(b5.biasSquareInches, 39);
assert.equal(b5.panels, 2);
assert.equal(b5.fabricInches, 82);
assert.equal(b5.buyYardsLabel, "2 3/8");

// =========================================================================
// Fraction Parsing & 1/8-Inch Display Cases (F1–F2)
// =========================================================================

// F1: "2 1/8" -> 2.125 -> "2⅛"
assert.equal(parseFractionOrNumber("2 1/8", true), 2.125);
assert.equal(formatInchesDisplay(2.125), "2⅛");
assert.equal(parseFractionOrNumber("100 1/2", true), 100.5);
assert.equal(parseFractionOrNumber("3/8", true), 0.375);

// F2: 2.625 -> "2⅝", 0.375 -> "⅜"
assert.equal(formatInchesDisplay(2.625), "2⅝");
assert.equal(formatInchesDisplay(0.375), "⅜");
assert.equal(formatInchesDisplay(0.875), "⅞");

// Unit conversion round-trip without drift
assert.equal(formatInputFromInches(60, "cm"), "152.4");
assert.equal(formatInputFromInches(60, "in"), "60");
assert.ok(Math.abs(cmToInches(inchesToCm(50)) - 50) < 1e-12);

// Field-level validation checks
const e1 = calculateBinding({ ...DEFAULTS, width: 0 });
assert.equal(e1.valid, false);
assert.equal(e1.fieldErrors.width, "widthPositive");

const e2 = calculateBinding({ ...DEFAULTS, stripWidth: 42, wof: 42 });
assert.equal(e2.valid, false);
assert.equal(e2.fieldErrors.stripWidth, "stripTooWide");

const e3 = calculateBinding({ ...DEFAULTS, joinType: "straight", seam: 21, wof: 42 });
assert.equal(e3.valid, false);
assert.equal(e3.fieldErrors.seam, "invalidSeam");

console.log("ALL v1.1 REGRESSION (0-4) + BIAS (B1-B5) + FRACTION (F1-F2) + VALIDATION TESTS PASSED!");
