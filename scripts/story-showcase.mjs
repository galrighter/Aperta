// מחולל נתוני הוויטרינה — `src/lib/story/showcaseData.ts`.
//
// **גלגול שני: עיצובים אמיתיים.** הגרסה הראשונה של המחולל ציירה דוגמאות
// פרמטריות (roundRect/band/lens — בהיסטוריית git), כי עוד לא היו עיצובים
// להציג. עכשיו יש: גל בחר חמישה עיצובים מהסטודיו (16.8), והמחולל מושך אותם
// מהמסד ופולט אותם בדיוק באותו פורמט. הוויטרינה מציגה מעכשיו את מה שהמשפט
// שלה תמיד טען — עיצובים שנחתכים כמו שהם, לא איורים "בהשראת".
//
// **מה המחולל עושה לכל עיצוב:**
// 1. מושך את כל הגרסאות (SVG קנוני, viewBox במ"מ, שכבת `cutouts` של M/L/Z
//    בלבד — פלט הווקטורייזר הוא פוליגונלי) ומשמיט גרסאות זהות-ביט (שכפול
//    הזמנה יוצר כאלה).
// 2. **מדלל** את הנקודות (Douglas–Peucker, ε=0.04 מ"מ) ומעגל ל-2 ספרות —
//    עיצוב אורגני צפוף (AP-0149) שוקל 107KB כלשונו, וזה משקל שדף הבית משלם
//    בכל טעינה. ב-ε הזה הסטייה קטנה מעשירית עובי החיתוך של הלייזר; הצורה
//    שנחתכת אינה משתנה, רק הדגימה שלה על המסך.
// 3. **מחשב מראש את גוף החומר** (חיסור בוליאני מלבן⊖חיתוכים, polygon-clipping
//    — אותה ספרייה של צינור הייצור). לדוגמאות הפרמטריות זה לא היה נחוץ: כל
//    החיתוכים ישבו בתוך המסגרת, והחורים היו הטבעות עצמן. עיצוב אמיתי גוזר
//    גם את קו המתאר (חיתוכי קצה שמתחילים ב-M0 0), וחור שנוגע בשפה מפיל את
//    הטריאנגולציה של ההדמיה. החישוב רץ כאן, פעם אחת, כדי שהדף לא יישא את
//    polygon-clipping בחבילה שלו — בדיוק הטעם שהיה למסלול הישן.
//
// **AP-0171 → AP-0170.** ברשימה המקורית נכלל 171, אבל אין לו אף גרסה שהושלמה
// (היצירה נקטעה לפני שנשמרה). עיצוב 170 נושא בדיוק את אותה בקשה ("אני אוהבת
// פרחוני ושמח…") עם שלוש גרסאות תקינות — כנראה אותה יצירה שנוסתה פעמיים.
//
// הרצה:  APERTA_SUPABASE_KEY=sbp_… node scripts/story-showcase.mjs
// הטוקן: docs/OPS_SUPABASE.md — נקודת הקצה היא ה-Management API לקריאה בלבד.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import pc from "polygon-clipping";

/* ===== הוולידטור של המנוע, בתוך המחולל =====
   הדילול חייב לעבור את אותה בדיקת ייצוריות שכל גרסה עוברת — וניחוש ספים
   הוכיח את עצמו כמשחק עיוור (ε שעבד לעיצוב אחד צבט זנב דק באחר). לכן המחולל
   מקמפל את הוולידטור האמיתי ומריץ אותו על כל תוצר: מתחילים ב-ε החסכוני,
   ואם הבדיקה נופלת יורדים בסולם עד שהיא עוברת. */
const CACHE = new URL("../node_modules/.cache/showcase/", import.meta.url);
mkdirSync(CACHE, { recursive: true });
writeFileSync(
  new URL("entry.ts", CACHE),
  `export { validateDesign } from "@/lib/geometry/validate";\nexport { FAB } from "@/lib/fabrication.config";\n`,
);
execSync(
  `npx esbuild ${new URL("entry.ts", CACHE).pathname} --bundle --platform=node --format=esm --alias:@=./src --outfile=${new URL("validate.mjs", CACHE).pathname}`,
  { cwd: new URL("..", import.meta.url).pathname, stdio: "pipe" },
);
const { validateDesign, FAB } = await import(new URL("validate.mjs", CACHE).href);

const PROJECT = "yyonyypptptqznjepytg";
const TOKEN = process.env.APERTA_SUPABASE_KEY;
if (!TOKEN) {
  console.error("APERTA_SUPABASE_KEY חסר — ראו docs/OPS_SUPABASE.md");
  process.exit(1);
}

/** העיצובים שנבחרו, בסדר שבו הם מוצגים. `tag` הוא מה שכתוב מעל הציטוט —
 *  שני שערי דף הבית מיוצגים: "סיפור" (מסלול הסטורי) ו"תיאור" (העורך). */
const PICKS = [
  { serial: 249, id: "ap0249", tag: "סיפור · רגש", kind: "רגש" },
  { serial: 229, id: "ap0229", tag: "סיפור · סגנון", kind: "סגנון" },
  { serial: 252, id: "ap0252", tag: "תיאור · מדויק", kind: "תיאור מדויק" },
  { serial: 170, id: "ap0170", tag: "תיאור · סגנון", kind: "סגנון" },
  { serial: 149, id: "ap0149", tag: "תיאור · חוויה", kind: "חוויה" },
];

/** סולם הדילול: מתחילים חסכוני ויורדים עד שהוולידציה עוברת. 0 = בלי דילול
 *  (רק איחוד, סינון רסיסים ועיגול). עשירית עובי חיתוך ומטה — הצורה שנחתכת
 *  אינה משתנה, רק הדגימה שלה. */
const EPSILON_LADDER_MM = [0.04, 0.02, 0.01, 0];

const r2 = (n) => Math.round(n * 100) / 100;

/* ===== שליפה ===== */

async function query(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT}/database/query/read-only`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!res.ok) throw new Error(`query failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.result ?? data.rows ?? [];
}

/* ===== גאומטריה ===== */

/** "M… L… Z" → טבעות נקודות. הקלט פוליגונלי בלבד; פקודת עקומה היא שגיאה. */
function parseRings(d) {
  if (/[^MLZmlz0-9 .,-]/.test(d)) throw new Error(`פקודה לא פוליגונלית ב-path: ${d.slice(0, 60)}`);
  const rings = [];
  for (const sub of d.split(/M/).slice(1)) {
    const pts = sub
      .replace(/[Zz]/g, "")
      .split(/L/)
      .map((p) => p.trim().split(/[ ,]+/).map(Number))
      .filter((p) => p.length === 2 && p.every(Number.isFinite));
    if (pts.length >= 3) rings.push(pts);
  }
  return rings;
}

/** Douglas–Peucker על טבעת סגורה: מפצלים בנקודה הרחוקה מקו העוגן, רקורסיבית. */
function simplifyRing(ring, eps) {
  if (ring.length <= 4) return ring;
  // חיתוך זעיר נשאר כלשונו: ב-ε של 0.04 מ"מ טבעת בקוטר מילימטרים ספורים
  // מאבדת אחוזים ניכרים מהשטח שלה — מספיק כדי ליפול מתחת לסף הפתח המינימלי
  // של בדיקת הייצוריות (V5 על AP-0170 היא שתפסה את זה). הדילול נועד לעיצוב
  // האורגני הצפוף, לא לחורים שכל כולם עשר נקודות.
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  if (Math.max(...xs) - Math.min(...xs) < 3 && Math.max(...ys) - Math.min(...ys) < 3) return ring;
  const dist = ([px, py], [ax, ay], [bx, by]) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    let maxD = 0;
    let idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
    return [...dp(pts.slice(0, idx + 1)).slice(0, -1), ...dp(pts.slice(idx))];
  };
  // טבעת: מקבעים שני עוגנים מנוגדים כדי שהסגירה לא תקרוס לקו.
  const half = Math.floor(ring.length / 2);
  const a = dp(ring.slice(0, half + 1));
  const b = dp(ring.slice(half));
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : ring;
}

const roundRing = (ring) => ring.map(([x, y]) => [r2(x), r2(y)]);
const ringD = (ring) => "M" + ring.map(([x, y]) => `${x} ${y}`).join("L") + "Z";

const ringArea = (ring) => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
};
const ringPerimeter = (ring) => {
  let p = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    p += Math.hypot(x2 - x1, y2 - y1);
  }
  return p;
};

/**
 * ניקוי אחרי הדילול: איחוד בוליאני של הטבעות, וסינון רסיסים.
 *
 * הדילול יכול לקפל טבעת גדולה לכדי חפיפה-עצמית זעירה, והחפיפה הזו נקראת
 * אחר כך כחיתוך נפרד ודק — בדיוק מה ש-V5 תפס על AP-0170 (סליבר ברוחב אפסי
 * ליד הקצה, שלא קיים בעיצוב המקורי). האיחוד מפרק את הצורה לרכיבים נקיים,
 * והסינון משמיט רכיב שרוחבו האפקטיבי (2·שטח/היקף) קטן מ-0.12 מ"מ — הרבה
 * מתחת לפתח החוקי הקטן ביותר (0.5 מ"מ, רוחב אפקטיבי 0.25), והרבה מעל רוחבו
 * של סליבר.
 */
function cleanRings(rings) {
  const out = [];
  for (const poly of pc.union(...rings.map((r) => [[r]]))) {
    if (poly.length > 1)
      throw new Error("איחוד החיתוכים הוליד חור — אי של חומר בתוך פתח, וזה לא היה בקלט");
    const ring = poly[0];
    const area = ringArea(ring);
    if (area < 0.05) continue;
    if ((2 * area) / ringPerimeter(ring) < 0.12) continue;
    out.push(ring);
  }
  if (out.length === 0) throw new Error("הניקוי רוקן את כל החיתוכים");
  return out;
}

/** viewBox של SVG קנוני. */
function frameOf(svg) {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!m) throw new Error("SVG בלי viewBox קנוני");
  return { lengthMm: Number(m[1]), widthMm: Number(m[2]) };
}

/** ולידציית המנוע, כפי שכל גרסה עוברת אותה. */
function validates(svg, product, frame) {
  const { report } = validateDesign(svg, {
    productType: product,
    lengthMm: frame.lengthMm,
    widthMm: frame.widthMm,
    thicknessMm: FAB.defaultThicknessMm,
  });
  return report.status !== "fail" ? null : report.checks.filter((c) => c.status === "fail");
}

/** גרסה שמורה → אפשרות ויטרינה: SVG מדולל + גוף החומר המחושב.
 *  מחזיר null אם אפילו המקור אינו עובר את הוולידטור של היום — גרסה כזו לא
 *  מוצגת: הוויטרינה מבטיחה "נחתכת בדיוק כמו שהיא". */
function toOption(svg, note, product) {
  const frame = frameOf(svg);
  const inner = /<g id="cutouts"[^>]*>([\s\S]*?)<\/g>/.exec(svg)?.[1] ?? "";
  const rings = [];
  for (const m of inner.matchAll(/\sd="([^"]*)"/g)) rings.push(...parseRings(m[1]));

  const original = validates(svg, product, frame);
  if (original) {
    console.log(`  ${note}: המקור עצמו נופל בוולידציה של היום — הושמט`, JSON.stringify(original.map((c) => c.check)));
    return null;
  }

  for (const eps of EPSILON_LADDER_MM) {
    const slim = cleanRings(rings.map((r) => (eps > 0 ? simplifyRing(r, eps) : r))).map(roundRing);
    const outSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.lengthMm} ${frame.widthMm}">` +
      `<g id="cutouts">` +
      slim.map((r) => `<path d="${ringD(r)}" fill="black"/>`).join("") +
      `</g></svg>`;
    if (validates(outSvg, product, frame)) continue; // הדילול קלקל — יורדים בסולם

    const frameRing = [
      [0, 0],
      [frame.lengthMm, 0],
      [frame.lengthMm, frame.widthMm],
      [0, frame.widthMm],
    ];
    const material = pc
      .difference([[frameRing]], ...slim.map((r) => [[r]]))
      .map((poly) => poly.map(roundRing));
    if (material.length === 0) throw new Error("החיסור הבוליאני רוקן את הרצועה");

    return {
      note,
      svg: outSvg,
      material,
      eps,
      points: rings.reduce((n, r) => n + r.length, 0),
      kept: slim.reduce((n, r) => n + r.length, 0),
    };
  }

  // אף עיבוד לא שרד — יש עיצובים שפתח שלהם יושב בדיוק על סף ה-0.5 מ"מ, וכל
  // הזזה (אפילו עיגול ל-2 ספרות) מפילה אותם. הם נכנסים כלשונם: ה-SVG המקורי
  // בדיוק, וגוף החומר מחושב מהטבעות הלא-מעוגלות.
  const frameRing = [
    [0, 0],
    [frame.lengthMm, 0],
    [frame.lengthMm, frame.widthMm],
    [0, frame.widthMm],
  ];
  const material = pc.difference([[frameRing]], ...rings.map((r) => [[r]]));
  if (material.length === 0) throw new Error(`${note}: החיסור הבוליאני רוקן את הרצועה`);
  const points = rings.reduce((n, r) => n + r.length, 0);
  return { note, svg, material, eps: "as-is", points, kept: points };
}

/* ===== הרצה ===== */

const rows = await query(`
  select d.serial, d.product_type, d.length_mm, d.width_mm, d.gap_mm,
         v.id = d.current_version_id as is_current, v.version_no, v.svg, v.user_prompt
  from designs d join design_versions v on v.design_id = d.id
  where d.serial in (${PICKS.map((p) => p.serial).join(",")})
  order by d.serial, v.version_no`);

/** מה שמוצג כציטוט: הטקסט של הלקוחה, בלי עטיפת הפרומפט של המשפך. */
function customerText(prompt) {
  const i = prompt.indexOf("תיאור הלקוחה:");
  const raw = i >= 0 ? prompt.slice(i + "תיאור הלקוחה:".length) : prompt;
  return raw.replace(/\s+/g, " ").trim();
}

const stories = PICKS.map((pick) => {
  const versions = rows.filter((r) => Number(r.serial) === pick.serial);
  if (versions.length === 0) throw new Error(`אין גרסאות לעיצוב ${pick.serial}`);

  // הרשומה מצהירה מסגרת אחת, והוולידציה של המנוע דורשת שה-viewBox יהיה
  // בדיוק היא. מקור האמת הוא הגרסה הנוכחית — לא `designs.width_mm`, שנמצא
  // סוטה ממנה בסנטימאות (18 מול 18.01 ב-AP-0252) — וגרסה שחיה במסגרת אחרת
  // מושמטת: אי אפשר לצייר אותה במסגרת שאינה שלה בלי לחתוך אותה.
  const current = versions.find((v) => v.is_current) ?? versions[versions.length - 1];
  const frame = frameOf(current.svg);
  const sameFrame = (v) => {
    const f = frameOf(v.svg);
    return f.lengthMm === frame.lengthMm && f.widthMm === frame.widthMm;
  };

  // גרסאות זהות-ביט (שכפול הזמנה) מוצגות פעם אחת.
  const kept = [];
  for (const v of versions) {
    if (!sameFrame(v)) {
      console.log(`AP-${String(pick.serial).padStart(4, "0")} ${v.version_no}: מסגרת שונה — הושמטה`);
      continue;
    }
    if (kept.some((k) => k.svg === v.svg)) {
      if (v.is_current) kept.find((k) => k.svg === v.svg).is_current = true;
      continue;
    }
    kept.push({ ...v });
  }

  const code = `AP-${String(pick.serial).padStart(4, "0")}`;
  const built = kept
    .map((v) => ({ v, opt: toOption(v.svg, `גרסה ${v.version_no}`, versions[0].product_type) }))
    .filter((b) => b.opt !== null);
  if (built.length === 0) throw new Error(`${code}: אף גרסה לא שרדה את הוולידציה`);

  const options = built.map((b) => b.opt);
  // הנוכחית אם שרדה; אחרת האחרונה ששרדה — עדיין גרסה אמיתית של אותו עיצוב.
  const curIdx = built.findIndex((b) => b.v.is_current);
  const chosen = curIdx >= 0 ? curIdx : built.length - 1;
  const prompt = versions.find((v) => v.user_prompt)?.user_prompt ?? "";

  for (const [i, o] of options.entries())
    console.log(
      `${code} ${built[i].v.version_no}: ε=${o.eps} · ${o.points} → ${o.kept} נק' · ` +
        `svg ${o.svg.length}B · material ${JSON.stringify(o.material).length}B`,
    );

  return {
    id: pick.id,
    serial: pick.serial,
    kind: pick.kind,
    tag: pick.tag,
    story: customerText(prompt),
    product: versions[0].product_type,
    // המסגרת של הגרסה הנוכחית — לא מידות הרשומה. ראו למעלה.
    lengthMm: frame.lengthMm,
    widthMm: frame.widthMm,
    gapMm: Number(versions[0].gap_mm),
    chosen,
    options: options.map(({ note, svg, material }) => ({ note, svg, material })),
  };
});

// קומפקטי, שורה לעיצוב: הדפסה מרווחת של מערכי ה-material שילשה את הקובץ
// (193KB מול 55KB) על רווחים בלבד — והקובץ הזה נטען בדף הבית.
const body = stories.map((s) => "  " + JSON.stringify(s)).join(",\n");

writeFileSync(
  new URL("../src/lib/story/showcaseData.ts", import.meta.url),
  `// נוצר על ידי scripts/story-showcase.mjs. אין לערוך ביד — הריצו את המחולל.
//
// עיצובים אמיתיים מהסטודיו (נבחרו על ידי גל, 16.8): כל \`svg\` הוא הגרסה
// השמורה של העיצוב, מדוללת ל-ε=0.04 מ"מ לתצוגה, ו-\`material\` הוא גוף החומר
// המחושב מראש (מלבן⊖חיתוכים) — ראו את כותרת המחולל למה שני אלה קיימים.
import type { ShowcaseStory } from "./showcase";

export const SHOWCASE_DATA: ShowcaseStory[] = [
${body},
];
`,
);
console.log(`נכתב: src/lib/story/showcaseData.ts (${stories.length} עיצובים)`);
