import assert from "node:assert/strict";
import {
  calculateBacking,
  DEFAULTS,
  formatInchesDisplay,
  formatCmDisplay,
  matchBattingPackage
} from "../quilt-backing-calculator/calculator.js";

// =========================================================================
// Acceptance Cases C1-C7 + X1 (v1.3: +2" cutting allowance before rounding)
// Unified defaults: selvageDeduction = 2", seam = 0.5"/edge (1"/seam), +2" allowance, 1/8 yd / 0.05 m
// =========================================================================

// C1: 60x80, WOF 44 (U=42), O=3 -> Vertical, 2 panels x 86", 1 seam, 4 7/8 yd / 4.45 m, alt 5 5/8 yd, Twin
const c1 = calculateBacking({ ...DEFAULTS, width: 60, length: 80, fabricWidth: 44, overage: 3 });
assert.equal(c1.valid, true);
assert.equal(c1.chosenOrientation, "vertical");
assert.equal(c1.primary.panels, 2);
assert.equal(c1.primary.seams, 1);
assert.equal(c1.primary.cutLength, 86);
assert.equal(c1.primary.exactInches, 172);
assert.equal(c1.primary.buyInches, 174);
assert.equal(c1.primary.buyYardsLabel, "4 7/8");
assert.equal(c1.primary.buyMetresLabel, "4.45");
assert.equal(c1.alternative.buyYardsLabel, "5 5/8");
assert.equal(c1.batting.packageId, "twin");

// C2: 90x96, WOF 108 (U=106), O=4 -> Horizontal single panel 98", 0 seams, 2 7/8 yd / 2.55 m, alt 3 yd, King
const c2 = calculateBacking({ ...DEFAULTS, width: 90, length: 96, fabricWidth: 108, overage: 4 });
assert.equal(c2.valid, true);
assert.equal(c2.diagram.layoutMode, "single");
assert.equal(c2.chosenOrientation, "horizontal");
assert.equal(c2.primary.panels, 1);
assert.equal(c2.primary.seams, 0);
assert.equal(c2.primary.cutLength, 98);
assert.equal(c2.primary.buyYardsLabel, "2 7/8");
assert.equal(c2.primary.buyMetresLabel, "2.55");
assert.equal(c2.alternative.buyYardsLabel, "3");
assert.equal(c2.batting.packageId, "king");

// C3: 70x90, WOF 44 (U=42), O=4 (Longarm) -> Vertical, 2 panels x 98", 1 seam, 5 1/2 yd / 5.05 m, alt 6 5/8 yd, Queen
const c3 = calculateBacking({ ...DEFAULTS, width: 70, length: 90, fabricWidth: 44, overage: 4 });
assert.equal(c3.valid, true);
assert.equal(c3.chosenOrientation, "vertical");
assert.equal(c3.primary.panels, 2);
assert.equal(c3.primary.seams, 1);
assert.equal(c3.primary.cutLength, 98);
assert.equal(c3.primary.buyYardsLabel, "5 1/2");
assert.equal(c3.primary.buyMetresLabel, "5.05");
assert.equal(c3.alternative.buyYardsLabel, "6 5/8");
assert.equal(c3.batting.packageId, "queen");

// C4: 36x48 (Baby), WOF 44 (U=42), O=3 -> Single panel vertical 54", 0 seams, 1 5/8 yd / 1.45 m, alt 2 1/2 yd, Crib
const c4 = calculateBacking({ ...DEFAULTS, width: 36, length: 48, fabricWidth: 44, overage: 3 });
assert.equal(c4.valid, true);
assert.equal(c4.diagram.layoutMode, "single");
assert.equal(c4.chosenOrientation, "vertical");
assert.equal(c4.primary.panels, 1);
assert.equal(c4.primary.seams, 0);
assert.equal(c4.primary.cutLength, 54);
assert.equal(c4.primary.buyYardsLabel, "1 5/8");
assert.equal(c4.primary.buyMetresLabel, "1.45");
assert.equal(c4.alternative.buyYardsLabel, "2 1/2");
assert.equal(c4.batting.packageId, "crib");

// C5: 52x96, WOF 44 (U=42), O=3, isDirectional=true -> Locked Vertical 2 panels x 102", 1 seam, 5 3/4 yd / 5.25 m, alt 5 yd, Queen
const c5 = calculateBacking({ ...DEFAULTS, width: 52, length: 96, fabricWidth: 44, overage: 3, isDirectional: true });
assert.equal(c5.valid, true);
assert.equal(c5.chosenOrientation, "vertical");
assert.equal(c5.primary.panels, 2);
assert.equal(c5.primary.seams, 1);
assert.equal(c5.primary.cutLength, 102);
assert.equal(c5.primary.buyYardsLabel, "5 3/4");
assert.equal(c5.primary.buyMetresLabel, "5.25");
assert.equal(c5.alternative.buyYardsLabel, "5");
assert.equal(c5.batting.packageId, "queen");

const c5Free = calculateBacking({ ...DEFAULTS, width: 52, length: 96, fabricWidth: 44, overage: 3, isDirectional: false });
assert.equal(c5Free.chosenOrientation, "horizontal");
assert.equal(c5Free.primary.panels, 3);
assert.equal(c5Free.primary.buyYardsLabel, "5");

// C6: 106x106, WOF 108 (U=106), O=4 -> Vertical (tie-break default) 2 panels x 114", 1 seam, 6 1/2 yd / 5.85 m, alt 6 1/2 yd, King
const c6 = calculateBacking({ ...DEFAULTS, width: 106, length: 106, fabricWidth: 108, overage: 4 });
assert.equal(c6.valid, true);
assert.equal(c6.chosenOrientation, "vertical");
assert.equal(c6.primary.panels, 2);
assert.equal(c6.primary.seams, 1);
assert.equal(c6.primary.cutLength, 114);
assert.equal(c6.primary.buyYardsLabel, "6 1/2");
assert.equal(c6.primary.buyMetresLabel, "5.85");
assert.equal(c6.alternative.buyYardsLabel, "6 1/2");
assert.equal(c6.batting.packageId, "king");
assert.ok(c6.warnings.includes("widebackExceeded"));

// C7: 120x120, WOF 44 (U=42), O=3 -> Vertical 4 panels x 126", 3 seams, 14 1/8 yd / 12.90 m, alt 14 1/8 yd, Exceeds King
const c7 = calculateBacking({ ...DEFAULTS, width: 120, length: 120, fabricWidth: 44, overage: 3 });
assert.equal(c7.valid, true);
assert.equal(c7.chosenOrientation, "vertical");
assert.equal(c7.primary.panels, 4);
assert.equal(c7.primary.seams, 3);
assert.equal(c7.primary.cutLength, 126);
assert.equal(c7.primary.buyYardsLabel, "14 1/8");
assert.equal(c7.primary.buyMetresLabel, "12.90");
assert.equal(c7.alternative.buyYardsLabel, "14 1/8");
assert.equal(c7.batting.exceedKing, true);
assert.equal(c7.batting.packageId, "by-the-yard");
assert.ok(c7.warnings.includes("multiPanelWidebackTip"));

// X1: 60x90, WOF 54 (U=52), O=3, isDirectional=true -> Vertical 2 panels x 96", 1 seam, 5 1/2 yd / 4.95 m
const x1 = calculateBacking({ ...DEFAULTS, width: 60, length: 90, fabricWidth: 54, overage: 3, isDirectional: true });
assert.equal(x1.valid, true);
assert.equal(x1.chosenOrientation, "vertical");
assert.equal(x1.primary.panels, 2);
assert.equal(x1.primary.seams, 1);
assert.equal(x1.primary.cutLength, 96);
assert.equal(x1.primary.buyYardsLabel, "5 1/2");
assert.equal(x1.primary.buyMetresLabel, "4.95");

// =========================================================================
// Diagram Data Contract Verification
// =========================================================================
assert.equal(c1.diagram.backingWidth, 66);
assert.equal(c1.diagram.backingLength, 86);
assert.deepEqual(c1.diagram.quiltTopRect, { x: 3, y: 3, width: 60, height: 80 });
assert.equal(c1.diagram.panels.length, 2);
assert.equal(c1.diagram.seams.length, 1);
assert.equal(c1.diagram.seams[0].orientation, "vertical");
assert.equal(c1.diagram.seams[0].label, '1/2" seam');

assert.equal(c2.diagram.panels.length, 1);
assert.equal(c2.diagram.seams.length, 0);

assert.equal(c5Free.diagram.layoutMode, "horizontal");
assert.equal(c5Free.diagram.panels.length, 3);
assert.equal(c5Free.diagram.seams.length, 2);
assert.equal(c5Free.diagram.seams[0].orientation, "horizontal");

// =========================================================================
// Batting Package Matching & Validation Checks
// =========================================================================
assert.equal(matchBattingPackage(30, 40).packageId, "craft");
assert.equal(matchBattingPackage(96, 81).packageId, "full"); // rotated match!

const errW = calculateBacking({ ...DEFAULTS, width: 0 });
assert.equal(errW.valid, false);
assert.equal(errW.fieldErrors.width, "widthPositive");

const errU = calculateBacking({ ...DEFAULTS, fabricWidth: 44, selvageDeduction: 43 });
assert.equal(errU.valid, false);
assert.equal(errU.fieldErrors.selvageDeduction, "usableWofTooSmall");

assert.equal(formatInchesDisplay(86), "86");
assert.equal(formatCmDisplay(66), "167.6");

console.log("ALL BACKING ACCEPTANCE CASES (C1-C7, X1) + DIAGRAM CONTRACT + BATTING + VALIDATION PASSED!");
