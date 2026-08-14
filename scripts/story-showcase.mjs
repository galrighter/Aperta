// מחולל נתוני הוויטרינה של `/story` — `src/lib/story/showcaseData.ts`.
//
// **למה מחולל ולא ציור ביד.** מה שהוויטרינה מציגה אינו איור אלא **עיצוב**:
// אותו SVG קנוני בדיוק שגרסה אמיתית נושאת (viewBox במ"מ, שכבת `cutouts`,
// נתיבים סגורים במילוי שחור). מהצורה הזו נגזרים שני הדברים שעל המסך — הפריסה
// השטוחה של כל הצעה, וההדמיה התלת-ממדית של הנבחרת — בדיוק כמו במסע היצירה.
// כתיבה של מאות קואורדינטות ביד אינה ניתנת לתחזוקה, ולכן הצורות מוגדרות כאן
// כפרמטרים ונפלטות פעם אחת.
//
// **מה זה כן ומה זה לא.** הצורות כאן נכתבו על ידינו כדוגמאות, ואינן פלט חי של
// הצינור. הן כן נשמעות לחוקי הייצור שהמנוע אוכף (docs/REMOVED_CONSTRAINTS.md)
// ונחתכות כפי שהן. ברגע שיהיו עיצובים אמיתיים להציג, ההחלפה היא הדבקה של
// מחרוזת: `svg` של גרסה מהאדמין נכנס במקום מה שכאן, והמסך לא משתנה.
//
// הרצה:  node scripts/story-showcase.mjs
import { writeFileSync } from "node:fs";

const r2 = (n) => Math.round(n * 100) / 100;
const pathD = (ring) => "M" + ring.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L") + "Z";

/* ===== צורות בסיס — כולן מחזירות טבעת סגורה של נקודות במ"מ ===== */

/** מלבן עם פינות מעוגלות. `rad=0` נותן מלבן חד (ברוטליזם). */
function roundRect(x, y, w, h, rad = 0, seg = 5) {
  const r = Math.min(rad, w / 2, h / 2);
  if (r <= 0.001) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (Math.PI / 2) * (i / seg);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return pts;
}

function ellipse(cx, cy, rx, ry, n = 20) {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

/** עדשה — שתי קשתות שנפגשות בחוד משני הצדדים. */
function lens(cx, cy, halfW, halfH, n = 12) {
  const arc = (sign) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = -1 + (2 * i) / n;
      return [cx + t * halfW, cy + sign * halfH * Math.cos((t * Math.PI) / 2)];
    });
  return [...arc(-1), ...arc(1).reverse()];
}

/** רצועה בעובי קבוע לאורך עקומה y=f(x), עם קצוות מעוגלים. */
function band(f, x0, x1, thick, step = 3.5) {
  const half = thick / 2;
  const xs = [];
  for (let x = x0; x < x1; x += step) xs.push(x);
  xs.push(x1);
  const cap = (cx, from) => {
    const out = [];
    for (let i = 1; i < 6; i++) {
      const a = from + (Math.PI * i) / 6;
      out.push([cx + half * Math.cos(a), f(cx) + half * Math.sin(a)]);
    }
    return out;
  };
  return [
    ...xs.map((x) => [x, f(x) - half]),
    ...cap(x1, -Math.PI / 2),
    ...xs.map((x) => [x, f(x) + half]).reverse(),
    ...cap(x0, Math.PI / 2),
  ];
}

/** מקבילית — חתך אנכי בזווית. */
function shear(x, y, w, h, lean) {
  return [[x, y], [x + w, y], [x + w - lean, y + h], [x - lean, y + h]];
}

/* ===== המסגרות ===== */

// המידות הן ברירות המחדל של המוצר (FAB.products): צמיד 160×18 בפתח 25.4,
// טבעת 55.5×6 בפתח 3. כלומר פריט אמיתי בגודל אמיתי, ולא קנה מידה של איור.
const BRACELET = { product: "bracelet", lengthMm: 160, widthMm: 18, gapMm: 25.4 };
const RING = { product: "ring", lengthMm: 55.5, widthMm: 6, gapMm: 3 };

// שדה העיצוב שנבחר לדוגמאות. **רחב מהמינימום שהמנוע אוכף** (שוליים 1 מ"מ,
// קצוות 2 מ"מ) — כאן 3/5 בצמיד ו-1.5/5 בטבעת, כי דוגמה שנוגעת כמעט בקצה
// נקראת כטעות ולא ככוונה.
const B = { cy: 9, y0: 3, y1: 15 };
const R = { cy: 3 };

/* ===== 1. הים ===== */

const seaWave = () => {
  // שתי רצועות בפאזה אחת: הגשר ביניהן קבוע (3.8 מ"מ) לכל אורך הצמיד, ולכן
  // אפשר להרשות להן עובי אמיתי. רצועה בודדת ודקה נקראה כשריטה ולא כעיצוב.
  const wave = (mid) => (x) => mid + 1.4 * Math.sin((x - 10) / 12);
  return [band(wave(5.8), 10, 150, 2.6), band(wave(12.2), 10, 150, 2.6)];
};

const seaTide = () => {
  // פסים אנכיים שגובהם עולה ויורד לאורך הצמיד — גאות, לא דוגמה חוזרת.
  const out = [];
  for (let i = 0; i < 17; i++) {
    const env = 0.55 + 0.45 * Math.sin((i / 16) * Math.PI * 2 - Math.PI / 2);
    const h = 3.6 + 6.4 * env;
    out.push(roundRect(9 + i * 8.6 - 1.15, B.cy - h / 2, 2.3, h, 1.15));
  }
  return out;
};

const seaHorizon = () => {
  // שני קווים אופקיים בעוביים שונים, שבורים בהיסט — קו מים וקו חוף.
  const out = [];
  for (const [x, w] of [[10, 46], [62, 44], [112, 38]]) out.push(roundRect(x, 5.2, w, 2.0, 1.0));
  for (const [x, w] of [[16, 58], [82, 62]]) out.push(roundRect(x, 10.4, w, 3.2, 1.6));
  return out;
};

/* ===== 2. יפן ===== */

const jpMa = () =>
  // חמישה חתכים רחבים במרווחים לא-שווים: מה שנושא את הסיפור הוא החלל שביניהם.
  [[10, 16], [34, 9], [55, 22], [92, 13], [117, 30]].map(([x, w]) =>
    roundRect(x, 6.4, w, 5.2, 2.6),
  );

const jpColumns = () => {
  const out = [];
  for (const c of [12, 58, 104]) {
    for (let i = 0; i < 3; i++) out.push(roundRect(c + i * 5.4, 4.2, 2.2, 9.6, 1.1));
  }
  return out;
};

const jpGarden = () => {
  // קו מגרפה אחד לאורך כל הפריט, ואבנים בגדלים יורדים מתחתיו.
  const out = [roundRect(10, 4.0, 140, 1.9, 0.95)];
  for (const [cx, r] of [[22, 2.4], [46, 1.6], [64, 2.9], [96, 1.4], [112, 2.1], [138, 1.3]]) {
    out.push(ellipse(cx, 11.0, r, r));
  }
  return out;
};

/* ===== 3. ברוטליזם ===== */

const brBlocks = () => {
  // גושים חדי-פינות, כל אחד נצמד לשפה אחרת — הא־סימטריה היא בין למעלה ללמטה.
  const spec = [
    [10, 14, "t", 5.4], [27, 9, "b", 7.2], [39, 18, "t", 8.0],
    [60, 7, "b", 4.6], [70, 21, "t", 5.0], [94, 11, "b", 8.4],
    [108, 15, "t", 6.6], [126, 8, "b", 5.2], [137, 13, "t", 7.8],
  ];
  return spec.map(([x, w, side, h]) =>
    roundRect(x, side === "t" ? B.y0 : B.y1 - h, w, h, 0.3),
  );
};

const brShear = () => {
  const out = [];
  for (let i = 0; i < 12; i++) {
    out.push(shear(11 + i * 12.2, B.y0, i % 3 === 0 ? 4.6 : 2.6, 12, 3.4));
  }
  return out;
};

const brNotch = () => {
  // שלוש מסות גדולות, וביניהן ניקוד קטן: א־סימטריה של קנה מידה ולא של מיקום.
  const out = [[11, 27, 4.4, 7.2], [58, 34, 6.0, 6.0], [107, 24, 3.4, 8.6]].map(
    ([x, w, y, h]) => roundRect(x, y, w, h, 0.3),
  );
  for (const [x, y] of [[44, 6.2], [48, 10.4], [96, 7.0], [100, 11.2], [137, 6.0], [141, 10.2], [145, 6.0]]) {
    out.push(roundRect(x, y, 2.6, 2.6, 0.3));
  }
  return out;
};

/* ===== 4. חזק אבל לא כבד — טבעת ===== */

const ringLens = () => {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const k = Math.sin(((i + 0.5) / 7) * Math.PI);
    out.push(lens(8.5 + i * 6.4, R.cy, 1.5 + 1.0 * k, 0.75 + 0.65 * k));
  }
  return out;
};

const ringTaper = () => {
  const out = [];
  for (let i = 0; i < 11; i++) {
    const k = Math.sin(((i + 0.5) / 11) * Math.PI);
    const h = 1.6 + 1.4 * k;
    out.push(roundRect(7 + i * 4.0 - 0.85, R.cy - h / 2, 1.7, h, 0.85));
  }
  return out;
};

const ringDuo = () => {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const x = 8 + i * 8.8;
    out.push(roundRect(x, R.cy - 1.5, 1.6, 3.0, 0.8));
    out.push(roundRect(x + 3.2, R.cy - 1.0, 2.6, 2.0, 1.0));
  }
  return out;
};

/* ===== הסיפורים ===== */

const STORIES = [
  {
    id: "sea", kind: "זיכרון", ...BRACELET, chosen: 0,
    story: "הקיץ שהיינו נוסעים בכל ערב לים, וחוזרים רק כשכבר חשוך.",
    options: [
      { note: "גל אחד, לכל האורך", holes: seaWave() },
      { note: "גאות", holes: seaTide() },
      { note: "קו המים", holes: seaHorizon() },
    ],
  },
  {
    id: "japan", kind: "חוויה", ...BRACELET, chosen: 0,
    story: "טיול ביפן — שקט, סדר והרבה חלל.",
    options: [
      { note: "החלל שבין", holes: jpMa() },
      { note: "עמודים", holes: jpColumns() },
      { note: "גן אבנים", holes: jpGarden() },
    ],
  },
  {
    id: "brutalism", kind: "עיצוב", ...BRACELET, chosen: 2,
    story: "קווים חדים, א־סימטריה ואדריכלות ברוטליסטית.",
    options: [
      { note: "גושים", holes: brBlocks() },
      { note: "גזירה", holes: brShear() },
      { note: "מסה וניקוד", holes: brNotch() },
    ],
  },
  {
    id: "light", kind: "רגש", ...RING, chosen: 0,
    story: "משהו שמרגיש חזק אבל לא כבד.",
    options: [
      { note: "עדשות", holes: ringLens() },
      { note: "התחדדות", holes: ringTaper() },
      { note: "צמדים", holes: ringDuo() },
    ],
  },
];

/* ===== בדיקה לפני פליטה =====
   המנוע אוכף פתח מינימלי 0.5 מ"מ ורצפת גשר 0.75 מ"מ בלבד. הספים כאן גבוהים
   ממנו בכוונה: אלה דוגמאות שמייצגות את המוצר, ופרט שנראה כשערה על המסך אינו
   מייצג אותו. חריגה עוצרת את הפליטה במקום להיכתב בשקט. */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return dist(p, [a[0] + t * vx, a[1] + t * vy]);
}

/** מרחק בין שתי טבעות — נקודות של כל אחת מול הצלעות של השנייה. */
function ringGap(r1, r2) {
  let m = Infinity;
  const scan = (pts, ring) => {
    for (const p of pts) {
      for (let i = 0; i < ring.length; i++) m = Math.min(m, segDist(p, ring[i], ring[(i + 1) % ring.length]));
    }
  };
  scan(r1, r2);
  scan(r2, r1);
  return m;
}

function check(s, opt) {
  const bad = [];
  const edge = s.product === "ring" ? 1.5 : 3.0;
  const end = 5.0;
  const minGap = s.product === "ring" ? 1.2 : 2.0;
  for (const ring of opt.holes) {
    for (const [x, y] of ring) {
      if (y < edge - 1e-6 || y > s.widthMm - edge + 1e-6) bad.push(`${s.id}/${opt.note}: y=${r2(y)} מפר שוליים ${edge}`);
      if (x < end - 1e-6 || x > s.lengthMm - end + 1e-6) bad.push(`${s.id}/${opt.note}: x=${r2(x)} מפר קצה ${end}`);
    }
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if (Math.min(w, h) < 0.5) bad.push(`${s.id}/${opt.note}: פתח ${r2(w)}×${r2(h)} מתחת למינימום 0.5`);
  }
  for (let i = 0; i < opt.holes.length; i++) {
    for (let j = i + 1; j < opt.holes.length; j++) {
      const g = ringGap(opt.holes[i], opt.holes[j]);
      if (g < minGap - 1e-6) bad.push(`${s.id}/${opt.note}: גשר ${r2(g)} < ${minGap} בין חתכים ${i},${j}`);
    }
  }
  return [...new Set(bad)];
}

const problems = STORIES.flatMap((s) => s.options.flatMap((o) => check(s, o)));
if (problems.length) {
  console.error("הפליטה נעצרה:\n" + problems.join("\n"));
  process.exit(1);
}

/* ===== פליטה ===== */

const svgOf = (s, o) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.lengthMm} ${s.widthMm}">` +
  `<g id="cutouts">${o.holes.map((r) => `<path d="${pathD(r)}" fill="black"/>`).join("")}</g></svg>`;

const body = STORIES.map((s) => `  {
    id: ${JSON.stringify(s.id)},
    kind: ${JSON.stringify(s.kind)},
    story: ${JSON.stringify(s.story)},
    product: ${JSON.stringify(s.product)},
    lengthMm: ${s.lengthMm},
    widthMm: ${s.widthMm},
    gapMm: ${s.gapMm},
    chosen: ${s.chosen},
    options: [
${s.options.map((o) => `      {
        note: ${JSON.stringify(o.note)},
        svg:
          ${JSON.stringify(svgOf(s, o))},
      },`).join("\n")}
    ],
  },`).join("\n");

const file = `// נוצר על ידי scripts/story-showcase.mjs. אין לערוך ביד — הריצו את המחולל.
//
// כל \`svg\` כאן הוא SVG קנוני של עיצוב, בדיוק בפורמט שגרסה אמיתית נושאת
// (\`designs.versions[].svg\`). לכן החלפה של דוגמה בעיצוב אמיתי היא הדבקה של
// מחרוזת אחת, בלי נגיעה ברכיב.
import type { ShowcaseStory } from "./showcase";

export const SHOWCASE_DATA: ShowcaseStory[] = [
${body}
];
`;

const out = new URL("../src/lib/story/showcaseData.ts", import.meta.url);
writeFileSync(out, file);
console.log(
  `נכתבו ${STORIES.length} סיפורים, ${STORIES.reduce((n, s) => n + s.options.length, 0)} הצעות, ` +
  `${file.length} תווים → src/lib/story/showcaseData.ts`,
);
