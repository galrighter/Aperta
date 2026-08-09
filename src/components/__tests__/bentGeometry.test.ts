import { describe, expect, it } from "vitest";
import { buildBentGeometry } from "../Preview3D";
import { neutralRadiusFromBlank } from "@/lib/sizing";
import { FAB, resolveFab } from "@/lib/fabrication.config";
import type { MultiPolygon } from "@/lib/geometry/types";

// הדופן נבנית ידנית: winding, נורמלים ושבירת קצה נקבעים בקוד ולא ע"י three.
// טעות בהם לא זורקת — היא מצללת הפוך, או מנפחת את העובי הנראה. לכן בדיקה
// מספרית על הגיאומטריה עצמה.

const L = 155;
const W = 18;
const GAP = 25.4;
const T = FAB.defaultThicknessMm;
const K = resolveFab(T, "bracelet").kFactor;

/** רצועה מלבנית עם חלון מלבני — טבעת חיצונית + חור, כמו סטנסיל אמיתי */
const material: MultiPolygon = [
  [
    [
      [0, 0],
      [L, 0],
      [L, W],
      [0, W],
    ],
    [
      [60, 6],
      [60, 12],
      [95, 12],
      [95, 6],
    ],
  ],
];

const geo = buildBentGeometry(material, L, W, GAP, T, K);
const pos = geo.getAttribute("position");
const nrm = geo.getAttribute("normal");

describe("buildBentGeometry", () => {
  it("שומר על העובי המדויק — טווח רדיאלי של t בדיוק, בלי ניפוח", () => {
    const rInner = neutralRadiusFromBlank(L, GAP) - K * T;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (r < min) min = r;
      if (r > max) max = r;
    }
    // סבולת 1e-4 מ"מ — רצפת ה-float32 של באפר המיקומים היא ~2e-6 ברדיוס 28.
    // עדיין קטנה פי אלפים מהאפקט שנבדק כאן (10% מ-1.5 מ"מ = 0.15 מ"מ).
    expect(min).toBeCloseTo(rInner, 4);
    expect(max).toBeCloseTo(rInner + T, 4);
    // זה הלב: שבירת הקצה היא הצללה בלבד ולא מוסיפה חומר
    expect(max - min).toBeCloseTo(T, 4);
  });

  it("כל הנורמלים מנורמלים", () => {
    for (let i = 0; i < nrm.count; i++) {
      const len = Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it("ה-winding מסכים עם הנורמלים — אין פאה שתתהפך ב-DoubleSide", () => {
    let checked = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
      const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
      const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      // נורמל גיאומטרי מה-winding
      const gx = uy * vz - uz * vy;
      const gy = uz * vx - ux * vz;
      const gz = ux * vy - uy * vx;
      const glen = Math.hypot(gx, gy, gz);
      if (glen < 1e-9) continue; // משולש מנוון מהפריסה לפרוסות
      // ממוצע הנורמלים שהוקצו למשולש
      let nx = 0, ny = 0, nz = 0;
      for (let c = 0; c < 3; c++) {
        nx += nrm.getX(i + c);
        ny += nrm.getY(i + c);
        nz += nrm.getZ(i + c);
      }
      const dot = (gx * nx + gy * ny + gz * nz) / glen;
      expect(dot).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("הפאות פונות רדיאלית, והדופן האמצעית ניצבת לרדיוס", () => {
    const rInner = neutralRadiusFromBlank(L, GAP) - K * T;
    const edge = Math.min(FAB.edgeBreakRadiusMm, T / 4);
    let faces = 0;
    let midWall = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      // רכיב הנורמל בכיוון הרדיוס
      const radial = (nrm.getX(i) * x + nrm.getZ(i) * z) / r;
      if (r <= rInner + 1e-6) {
        // הפאה הפנימית — נורמל פנימה
        expect(radial).toBeCloseTo(-1, 4);
        faces++;
      } else if (r >= rInner + T - 1e-6) {
        expect(radial).toBeCloseTo(1, 4);
        faces++;
      } else if (r > rInner + edge + 1e-6 && r < rInner + T - edge - 1e-6) {
        // הדופן עצמה, בין שתי השבירות — לרוחב, בלי רכיב רדיאלי
        expect(Math.abs(radial)).toBeLessThan(1e-4);
        midWall++;
      }
    }
    expect(faces).toBeGreaterThan(100);
    expect(midWall).toBeGreaterThan(0);
  });

  it("שבירת הקצה מייצרת מעבר הדרגתי ולא קפיצה", () => {
    // בדופן יש קודקודים בדיוק בגבולות השבירה, ושם הנורמל כבר לרוחב מלא;
    // בקצה עצמו (z=0 / z=t) הוא רדיאלי. זה הגרדיאנט שמחליף את קפיצת ההצללה.
    const rInner = neutralRadiusFromBlank(L, GAP) - K * T;
    const edge = Math.min(FAB.edgeBreakRadiusMm, T / 4);
    expect(edge).toBeGreaterThan(0);
    let atBreak = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (Math.abs(r - (rInner + edge)) < 1e-6) {
        const radial = (nrm.getX(i) * x + nrm.getZ(i) * z) / r;
        expect(Math.abs(radial)).toBeLessThan(1e-4);
        atBreak++;
      }
    }
    expect(atBreak).toBeGreaterThan(0);
  });
});
