import assert from "node:assert/strict";
import {
  calculateBinding,
  DEFAULTS,
  formatInputFromInches,
  cmToInches,
  inchesToCm
} from "../quilt-binding-calculator/calculator.js";

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

// Case 5: 60x72, S=2.5, WOF=42, Bias
const c5 = calculateBinding({ ...DEFAULTS, width: 60, length: 72, cutStyle: "bias" });
assert.equal(c5.valid, true);
assert.equal(c5.biasSquareInches, 29);
assert.ok(Math.abs(c5.fabricInches - 20.892857) < 0.01);
assert.equal(c5.buyYardsLabel, "5/8");
assert.equal(c5.buyMetresLabel, "0.55");

// Case 6: Unit conversion display without mutating internalInches
const internalW = 60;
const asCm = formatInputFromInches(internalW, "cm");
assert.equal(asCm, "152.4");
const backIn = formatInputFromInches(internalW, "in");
assert.equal(backIn, "60");
assert.ok(Math.abs(cmToInches(inchesToCm(50)) - 50) < 1e-12);

// Edge / Validation cases
const e1 = calculateBinding({ ...DEFAULTS, width: 0 });
assert.equal(e1.valid, false);
assert.equal(e1.errorKey, "positiveNumber");

const e2 = calculateBinding({ ...DEFAULTS, stripWidth: 42, wof: 42 });
assert.equal(e2.valid, false);
assert.equal(e2.errorKey, "stripTooWide");

const e3 = calculateBinding({ ...DEFAULTS, joinType: "straight", seam: 21, wof: 42 });
assert.equal(e3.valid, false);
assert.equal(e3.errorKey, "invalidSeam");

console.log("ALL 7 ACCEPTANCE CASES + 3 VALIDATION CASES PASSED!");
