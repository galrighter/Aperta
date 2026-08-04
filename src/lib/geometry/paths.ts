import type { Pt, Ring } from "./types";

// פרסור ודגימה של path `d` לפוליגונים. קווים נשארים קווים; עקומות (C/S/Q/T/A)
// נדגמות אדפטיבית בסיבולת שגיאת מיתר של 0.05 מ"מ (חוזה סעיף 5.7).

export const SAMPLING_TOLERANCE_MM = 0.05;

export interface ParsedSubpath {
  ring: Ring;
  closed: boolean;
}

interface Cmd {
  op: string;
  args: number[];
}

const ARG_COUNTS: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

export function tokenizePath(d: string): Cmd[] {
  const cmds: Cmd[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
  let m: RegExpExecArray | null;
  let cur: string | null = null;
  let buf: number[] = [];
  const flush = () => {
    if (cur === null) return;
    const n = ARG_COUNTS[cur.toUpperCase()];
    if (n === 0) {
      if (buf.length !== 0) throw new Error(`Z takes no arguments`);
      cmds.push({ op: cur, args: [] });
      return;
    }
    if (buf.length === 0 || buf.length % n !== 0) {
      throw new Error(`Command ${cur} has wrong number of arguments (${buf.length})`);
    }
    for (let i = 0; i < buf.length; i += n) {
      // חזרה מובלעת: M נוסף הופך ל-L
      let op = cur;
      if (i > 0 && (cur === "M" || cur === "m")) op = cur === "M" ? "L" : "l";
      cmds.push({ op, args: buf.slice(i, i + n) });
    }
  };
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      flush();
      cur = m[1];
      buf = [];
    } else {
      if (cur === null) throw new Error("Path data does not start with a command");
      // שני הדגלים של הקשת הם **תו אחד** כל אחד ("0"/"1"), ולכן מותר לכתוב
      // אותם בלי מפריד: `a1 1 0 011 0` הוא large-arc=0, sweep=1, x=1. הסורק
      // קורא מספרים בחמדנות, ולכן הוא בלע את `011` כמספר 11 — ואז ספירת
      // הארגומנטים יצאה 6 במקום 7 וכל הנתיב נדחה כ"invalid path data".
      //
      // זה תחביר חוקי שאנחנו לא מייצרים (הווקטורייזר פולט M/L/Z בלבד), אבל
      // כל SVG שעבר אופטימיזציה — SVGO וחבריו דוחסים בדיוק ככה — נכנס לכאן
      // דרך ייבוא או share-adopt. הקשחה, לא באג שנצפה בייצור.
      if ((cur === "A" || cur === "a") && buf.length % 7 >= 3 && buf.length % 7 <= 4) {
        const tok = m[2];
        if (tok[0] !== "0" && tok[0] !== "1") {
          throw new Error(`Arc flag must be 0 or 1, got "${tok.slice(0, 8)}"`);
        }
        buf.push(tok[0] === "1" ? 1 : 0);
        // מה שנשאר מהאסימון חוזר לזרם: הדגל צרך תו אחד בלבד.
        if (tok.length > 1) re.lastIndex = m.index + 1;
        continue;
      }
      buf.push(parseFloat(m[2]));
    }
  }
  flush();
  // ודא שאין תווים לא חוקיים
  const leftover = d.replace(re, "").replace(/[\s,]+/g, "");
  if (leftover.length > 0) throw new Error(`Invalid characters in path data: "${leftover.slice(0, 10)}"`);
  return cmds;
}

function sampleCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, tol: number, out: Pt[]) {
  // subdivision אדפטיבי לפי מרחק נקודות הבקרה מהמיתר
  const flatEnough = (a: Pt, b: Pt, c: Pt, d2: Pt): boolean => {
    const dx = d2[0] - a[0], dy = d2[1] - a[1];
    const len = Math.hypot(dx, dy) || 1e-12;
    const dist = (p: Pt) => Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
    return Math.max(dist(b), dist(c)) <= tol;
  };
  const rec = (a: Pt, b: Pt, c: Pt, d2: Pt, depth: number) => {
    if (depth > 24 || flatEnough(a, b, c, d2)) {
      out.push(d2);
      return;
    }
    const mid = (u: Pt, v: Pt): Pt => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
    const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d2);
    const abc = mid(ab, bc), bcd = mid(bc, cd);
    const abcd = mid(abc, bcd);
    rec(a, ab, abc, abcd, depth + 1);
    rec(abcd, bcd, cd, d2, depth + 1);
  };
  rec(p0, p1, p2, p3, 0);
}

function sampleArc(
  from: Pt, rx0: number, ry0: number, xRotDeg: number,
  largeArc: boolean, sweep: boolean, to: Pt, tol: number, out: Pt[],
) {
  // המרת endpoint → center לפי אלגוריתם התקן של SVG
  let rx = Math.abs(rx0), ry = Math.abs(ry0);
  if (rx < 1e-9 || ry < 1e-9 || (from[0] === to[0] && from[1] === to[1])) {
    out.push(to);
    return;
  }
  const phi = (xRotDeg * Math.PI) / 180;
  const cosP = Math.cos(phi), sinP = Math.sin(phi);
  const dx2 = (from[0] - to[0]) / 2, dy2 = (from[1] - to[1]) / 2;
  const x1p = cosP * dx2 + sinP * dy2;
  const y1p = -sinP * dx2 + cosP * dy2;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const sign = largeArc !== sweep ? 1 : -1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cosP * cxp - sinP * cyp + (from[0] + to[0]) / 2;
  const cy = sinP * cxp + cosP * cyp + (from[1] + to[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1e-12;
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const rMax = Math.max(rx, ry);
  const maxStep = rMax > tol ? 2 * Math.acos(Math.max(-1, 1 - tol / rMax)) : Math.PI / 4;
  const n = Math.max(2, Math.ceil(Math.abs(dTheta) / Math.max(maxStep, 1e-3)));
  for (let i = 1; i <= n; i++) {
    const t = theta1 + (dTheta * i) / n;
    const x = cx + rx * Math.cos(t) * cosP - ry * Math.sin(t) * sinP;
    const y = cy + rx * Math.cos(t) * sinP + ry * Math.sin(t) * cosP;
    out.push(i === n ? to : [x, y]);
  }
}

/**
 * דגימת path לרשימת תתי-נתיבים. זורק שגיאה על path לא-חוקי.
 * דורש שכל subpath יסתיים ב-Z (נאכף ע"י הקורא לפי החוזה).
 */
export function samplePathToRings(d: string, tol = SAMPLING_TOLERANCE_MM): ParsedSubpath[] {
  const cmds = tokenizePath(d);
  const subpaths: ParsedSubpath[] = [];
  let ring: Pt[] = [];
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let prevCubicCtrl: Pt | null = null;
  let prevQuadCtrl: Pt | null = null;
  let closed = false;

  const beginSubpath = (p: Pt) => {
    if (ring.length > 0) {
      subpaths.push({ ring: dedupeRing(ring), closed });
    }
    ring = [p];
    start = p;
    closed = false;
  };

  for (const { op, args } of cmds) {
    const rel = op === op.toLowerCase();
    const OP = op.toUpperCase();
    let nextCubic: Pt | null = null;
    let nextQuad: Pt | null = null;
    switch (OP) {
      case "M": {
        const p: Pt = rel ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]];
        beginSubpath(p);
        cur = p;
        break;
      }
      case "L": {
        const p: Pt = rel ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]];
        ring.push(p);
        cur = p;
        break;
      }
      case "H": {
        const p: Pt = rel ? [cur[0] + args[0], cur[1]] : [args[0], cur[1]];
        ring.push(p);
        cur = p;
        break;
      }
      case "V": {
        const p: Pt = rel ? [cur[0], cur[1] + args[0]] : [cur[0], args[0]];
        ring.push(p);
        cur = p;
        break;
      }
      case "C": {
        const a = rel ? args.map((v, i) => v + cur[i % 2]) : args;
        const c1: Pt = [a[0], a[1]], c2: Pt = [a[2], a[3]], to: Pt = [a[4], a[5]];
        sampleCubic(cur, c1, c2, to, tol, ring);
        nextCubic = c2;
        cur = to;
        break;
      }
      case "S": {
        const a = rel ? args.map((v, i) => v + cur[i % 2]) : args;
        const c1: Pt = prevCubicCtrl
          ? [2 * cur[0] - prevCubicCtrl[0], 2 * cur[1] - prevCubicCtrl[1]]
          : cur;
        const c2: Pt = [a[0], a[1]], to: Pt = [a[2], a[3]];
        sampleCubic(cur, c1, c2, to, tol, ring);
        nextCubic = c2;
        cur = to;
        break;
      }
      case "Q": {
        const a = rel ? args.map((v, i) => v + cur[i % 2]) : args;
        const q: Pt = [a[0], a[1]], to: Pt = [a[2], a[3]];
        const c1: Pt = [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])];
        const c2: Pt = [to[0] + (2 / 3) * (q[0] - to[0]), to[1] + (2 / 3) * (q[1] - to[1])];
        sampleCubic(cur, c1, c2, to, tol, ring);
        nextQuad = q;
        cur = to;
        break;
      }
      case "T": {
        const a = rel ? args.map((v, i) => v + cur[i % 2]) : args;
        const q: Pt = prevQuadCtrl
          ? [2 * cur[0] - prevQuadCtrl[0], 2 * cur[1] - prevQuadCtrl[1]]
          : cur;
        const to: Pt = [a[0], a[1]];
        const c1: Pt = [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])];
        const c2: Pt = [to[0] + (2 / 3) * (q[0] - to[0]), to[1] + (2 / 3) * (q[1] - to[1])];
        sampleCubic(cur, c1, c2, to, tol, ring);
        nextQuad = q;
        cur = to;
        break;
      }
      case "A": {
        const to: Pt = rel ? [cur[0] + args[5], cur[1] + args[6]] : [args[5], args[6]];
        sampleArc(cur, args[0], args[1], args[2], args[3] !== 0, args[4] !== 0, to, tol, ring);
        cur = to;
        break;
      }
      case "Z": {
        closed = true;
        cur = start;
        if (ring.length > 0) {
          subpaths.push({ ring: dedupeRing(ring), closed: true });
          ring = [];
        }
        break;
      }
      default:
        throw new Error(`Unsupported path command: ${op}`);
    }
    prevCubicCtrl = nextCubic;
    prevQuadCtrl = nextQuad;
  }
  if (ring.length > 0) subpaths.push({ ring: dedupeRing(ring), closed });
  return subpaths.filter((s) => s.ring.length >= 3 || !s.closed);
}

function dedupeRing(ring: Pt[]): Ring {
  const out: Pt[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) out.push(p);
  }
  // הסרת נקודת סגירה כפולה
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-6) out.pop();
  }
  return out;
}

/** המרת ring לפקודת path (M...L...Z) בדיוק 3 ספרות */
export function ringToPathD(ring: Ring): string {
  const fmt = (v: number) => {
    const r = Math.round(v * 1000) / 1000;
    return Object.is(r, -0) ? "0" : String(r);
  };
  return (
    ring.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p[0])} ${fmt(p[1])}`).join("") + "Z"
  );
}
