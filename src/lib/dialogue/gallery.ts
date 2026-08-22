import curatedFile from "@/data/gallery-curated.json";

// dialogue mode — הגלריה בראיון (‏PROMPT_SPEC §3.2): מדידה דרך בחירות.
//
// **מה הקובץ הזה מחזיק, ולמה הוא טהור.** שלושה צרכנים שונים צריכים את אותה
// רשימה מאוצרת: פרומפט הראיון (אוצר התגים שהמודל שואל בו), מסך השיחה (בחירת
// ששת העיצובים שמוצגים), ונתיב ה-API (תרגום בחירה למה שהמודל קורא בסבב הבא).
// כולם קוראים מכאן — אפס רשת, אפס LLM, אפס DB: הרשימה היא קובץ בגיט.
//
// **הגלריה היא הרשימה המאוצרת בלבד** — `src/data/gallery-curated.json`, תקציר
// שנוצר ב-`npm run gallery:export` מתוך `gallery-tags.json` (רק רשומות
// `overrides.gallery: true`). לעולם לא שאילתה על עיצובים חיים: כשיהיו לקוחות
// אמיתיים, עיצוב נכנס לגלריה רק בסימון ידני של גל, דרך PR.
//
// **למה קובץ תקציר ולא `gallery-tags.json` עצמו.** הקובץ המלא הוא 288KB של
// 226 רשומות על כל שדותיהן — והמסך הזה יושב אצל לקוחה, בבאנדל. התקציר נושא
// רק את 50 המאוצרות ורק את השדות שהשיחה צריכה, והוא גם מה שהופך את "מאוצרות
// בלבד" למבני: מה שאינו בקובץ אינו קיים מבחינת הגלריה.

/** מה שהמודל מחזיר כשהוא בוחר להציג גלריה — הזמנה בעברית ושאילתת תגים.
 *  חי כאן ולא ב-`interview.ts` כי גם המסך צריך אותו, בלי לגרור את לקוח ה-LLM. */
export interface GalleryAsk {
  /** ההזמנה, בעברית — "איזה מהם הכי מדבר אלייך?" */
  lead: string;
  /** תגי אופי מאוצר התגים — שאילתת האחזור, לא מרחב העיצוב. */
  tags: string[];
}

/** רשומה אחת בתקציר המאוצר. מספר שלא נמדד הוא `null`, לא ניחוש. */
export interface CuratedDesign {
  version_id: string;
  serial: number | null;
  product_type: "bracelet" | "ring";
  /** תגי האופי אחרי קדימות `overrides` > `read` (‏§3.2). */
  tags: string[];
  /** משפט "מה העיצוב עושה" — לשיחה, לא לפרומפט הביצוע. */
  concept: string | null;
  /** הקריאה הוויזואלית, בעברית — מה שבחירה מזרימה למפרט כ-`inferred`. */
  read: {
    outer_silhouette?: string;
    element_shapes?: string;
    rhythm?: string;
    ends_treatment?: string;
    region_map?: string;
  };
  /** הצירים המחושבים מה-SVG — הקוד צודק כשהוא והקריאה חלוקים (§3.2). */
  computed: {
    length_to_width_ratio: number | null;
    openings_count: number | null;
    metal_void_balance: number | null;
    mirror_symmetry: string | null;
  };
}

/** כמה עיצובים מוצגים בגלריה אחת. שישה: מספיק כדי שבחירה תמדוד, מעט מספיק
 *  כדי שהיא תרגיש בחירה ולא קטלוג. */
export const GALLERY_COUNT = 6;

const ALL: CuratedDesign[] = ((curatedFile as { designs?: unknown }).designs ?? []) as CuratedDesign[];

/** הרשימה המאוצרת של מוצר. */
export function curatedDesigns(productType: string): CuratedDesign[] {
  return ALL.filter((d) => d.product_type === productType);
}

/** רשומה מאוצרת לפי מזהה — מה שנתיב ה-API עושה עם `chosenVersionId`.
 *  מזהה שאינו ברשימה חוזר `null`: גוף בקשה אינו הצהרה, והגלריה היא
 *  הרשימה המאוצרת בלבד. */
export function curatedById(versionId: string): CuratedDesign | null {
  return ALL.find((d) => d.version_id === versionId) ?? null;
}

/**
 * אוצר התגים של מוצר — מה שנמסר לפרומפט כשפת השאילתה.
 *
 * שכיחים תחילה (תג נפוץ הוא שאילתה שמחזירה מבחר), ואז לפי טקסט — סדר
 * דטרמיניסטי, כדי ששתי בניות של אותו פרומפט יהיו אותו טקסט.
 */
export function galleryTagVocabulary(productType: string): string[] {
  return vocabularyOf(curatedDesigns(productType));
}

/** גרעין טהור של האוצר — נבדק על מאגר סינתטי. */
export function vocabularyOf(pool: CuratedDesign[]): string[] {
  const counts = new Map<string, number>();
  for (const d of pool) for (const t of d.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([t]) => t);
}

/** בחירת העיצובים שיוצגו — העטיפה הקשורה לנתונים האמיתיים. */
export function selectGalleryDesigns(
  productType: string,
  tags: string[],
  count = GALLERY_COUNT,
): CuratedDesign[] {
  return selectFrom(curatedDesigns(productType), tags, count);
}

/**
 * גרעין הבחירה, טהור ודטרמיניסטי.
 *
 * **התאמה קודמת, גיוון שובר שוויון.** ה-50 נבחרו בפריסה על הציר הסידורי, לא
 * לפי דמיון — כלומר שאילתה יכולה להחזיר שני אחים כמעט זהים. לכן בין מועמדים
 * עם אותה התאמה לשאילתה נבחר זה שחולק הכי מעט תגים עם מה שכבר נבחר: הגיוון
 * אינו מחליש את ההתאמה (התאמה גוברת), רק מפזר בתוכה. תג שאינו באוצר פשוט
 * לא מתאים לאף עיצוב — הבחירה ממשיכה על גיוון, והגלריה לעולם אינה ריקה
 * כשיש רשומות מאוצרות.
 *
 * שוברי שוויון קבועים (סידורי, ואז מזהה) כי בחירה אקראית הייתה הופכת כל
 * טסט להטלת קובייה — בדיוק הדבר שהמסלול כולו נבנה למחוק.
 */
export function selectFrom(pool: CuratedDesign[], tags: string[], count: number): CuratedDesign[] {
  const wanted = new Set(tags.map((t) => t.trim()).filter(Boolean));
  const matchOf = (d: CuratedDesign): number =>
    d.tags.reduce((n, t) => n + (wanted.has(t) ? 1 : 0), 0);

  const remaining = [...pool];
  const picked: CuratedDesign[] = [];
  const pickedTags = new Set<string>();

  while (picked.length < count && remaining.length > 0) {
    let bestAt = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (better(remaining[i], remaining[bestAt])) bestAt = i;
    }
    const best = remaining.splice(bestAt, 1)[0];
    picked.push(best);
    for (const t of best.tags) pickedTags.add(t);
  }
  return picked;

  function better(a: CuratedDesign, b: CuratedDesign): boolean {
    const byMatch = matchOf(a) - matchOf(b);
    if (byMatch !== 0) return byMatch > 0;
    const overlapOf = (d: CuratedDesign): number =>
      d.tags.reduce((n, t) => n + (pickedTags.has(t) ? 1 : 0), 0);
    const byOverlap = overlapOf(a) - overlapOf(b);
    if (byOverlap !== 0) return byOverlap < 0;
    const bySerial = (a.serial ?? Infinity) - (b.serial ?? Infinity);
    if (bySerial !== 0) return bySerial < 0;
    return a.version_id < b.version_id;
  }
}

/**
 * העיצוב שנבחר, כפי שפרומפט הסבב הבא קורא אותו.
 *
 * תוויות באנגלית (שפת המפרט), ערכים כפי שנרשמו — הקריאה הוויזואלית בעברית
 * והמחושבים כמספרים. המודל מתרגם את מה שהבחירה מגלה ל-`updated_spec` באנגלית
 * ומתייג `inferred`; ההנחיה לכך יושבת בפרומפט (`interview.ts`), לא כאן.
 */
export function describeGalleryChoice(d: CuratedDesign): string {
  const lines: string[] = [];
  if (d.concept) lines.push(`Concept: ${d.concept}`);
  if (d.tags.length) lines.push(`Character: ${d.tags.join(" · ")}`);
  const readLabels: ReadonlyArray<readonly [keyof CuratedDesign["read"], string]> = [
    ["outer_silhouette", "Outer silhouette"],
    ["element_shapes", "Elements"],
    ["rhythm", "Rhythm"],
    ["ends_treatment", "Ends"],
    ["region_map", "Region map"],
  ];
  for (const [key, label] of readLabels) {
    const value = d.read?.[key]?.trim();
    if (value) lines.push(`${label}: ${value}`);
  }
  const measured: string[] = [];
  const c = d.computed;
  if (c.length_to_width_ratio !== null) {
    measured.push(`length-to-width 1:${Math.round(c.length_to_width_ratio * 10) / 10}`);
  }
  if (c.openings_count !== null) measured.push(`openings ${c.openings_count}`);
  if (c.metal_void_balance !== null) {
    measured.push(`open share ${Math.round(c.metal_void_balance * 100)}%`);
  }
  if (c.mirror_symmetry) measured.push(`mirror symmetry ${c.mirror_symmetry}`);
  if (measured.length) lines.push(`Measured: ${measured.join(" · ")}`);
  return lines.join("\n");
}

/** הנתיב הסטטי לציור של עיצוב מאוצר — מה שהייצוא כותב ל-`public/gallery/`. */
export function gallerySvgPath(versionId: string): string {
  return `/gallery/${encodeURIComponent(versionId)}.svg`;
}
