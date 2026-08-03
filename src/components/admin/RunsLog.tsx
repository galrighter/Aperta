"use client";

// יומן היצירות — כל פעולת יצירה באתר, כולל הנכשלות, ומה שצריך כדי להסביר אותה:
// הפרומפט המלא שיצא למודל, הקובץ שהמשתמש צירף, ההדמיה שחזרה, שלבי הצינור,
// המועמדים וה-SVG הסופי — עם הורדה.
//
// הוצא מ-`/debug` כדי שגם פורטל הניהול (`/admin/runs`) יציג בדיוק את אותו יומן:
// שני מסכים שמראים את אותו מידע אחרת הם שני מסכים שמתחזקים אחרת. `/debug` נשאר
// מעבדת ההרצה (להריץ פרומפט או תמונה) ומשתמש באותם רכיבי אבחון.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Stage = { name: string; status: string; detail: string };

export type Candidate = {
  candidate_id: string; iou: number; mean_dev_mm: number; max_dev_mm: number;
  source_holes: number; vector_holes: number; anchors: number; topology_ok: boolean;
  hole_budget?: number; source_components?: number; vector_components?: number;
  component_budget?: number; metal_svg?: string; cutouts_svg?: string;
  score: number; rejected_reason: string | null; selected: boolean;
};

export type DebugMeta = {
  status?: string; width_mm?: number; height_mm?: number; smooth_iters?: number; color_key?: string | null;
  gates?: Record<string, number>;
  candidates?: Candidate[];
  stages?: Stage[];
  warnings?: string[];
};

/** תגובת ההרצה החיה: debug כולל images ב-base64. */
export type RunDebug = DebugMeta & { images?: Record<string, string> };

export type StageUrls = {
  /** הקובץ שהמשתמש צירף — הקלט, להבדיל מההדמיה שיצאה ממנו. */
  input?: string | null;
  /** תמונת הייחוס שנמסרה למודל: הכיתוב שנחתך מהפונט, או העיצוב שנערך. */
  reference?: string | null;
  render?: string | null; conditioned?: string | null; overlay?: string | null;
  difference?: string | null; rendered?: string | null;
};

/** המאפיינים שקבעו את ההרצה — מה שצריך כדי להסביר אותה או לשחזר אותה. */
export type RunInputs = {
  productType?: string; lengthMm?: number; widthMm?: number; thicknessMm?: number;
  rows?: number; cols?: number; calls?: number; minHoleMm?: number; colorKey?: string;
  /** צורת הקנבס שנשלחה למודל, `"1536x1024"`. חסר בהרצות מלפני התיעוד. */
  canvasSize?: string;
  imageCount?: number; imageUpload?: boolean; promptOverride?: boolean;
  /** הקובץ צורף ולא נשלח למודל: הכיתוב או העיצוב הקיים תפסו את מקום הייחוס. */
  imageDropped?: "lettering" | "edit";
  /** האם ההרצה יצאה מהעיצוב הקיים (עריכה) או מאפס. */
  editedFromCurrent?: boolean;
  /** מספר הגרסה שנמסרה למודל כבסיס לעריכה. חסר בהרצות שנשמרו לפני שהוא נרשם. */
  editedFromVersion?: number;
  /**
   * הכיתוב שנחתך מהפונט ונמסר למודל כתמונת ייחוס — כולל הגשרים שנחתכו בו.
   * אלה **התכנון**: מה שהמודל התבקש להעתיק, להבדיל מ-`bridges` שבפירוט,
   * שהוא מה שתוקן אחרי שהוא צייר. `bridges` חסר בהרצות מלפני התיעוד הזה.
   */
  lettering?: {
    text?: string;
    rows: Array<{
      fontId: string;
      letterHeightMm: number;
      textWidthMm: number;
      bridges?: Array<{ char: string | null; widthMm: number; counterMm: number; sideways: boolean }>;
    }>;
  } | null;
};

/** הבעלים של ההרצה, לקיבוץ היומן לפי משתמש. */
export type Owner = { id: string; name: string; color: string; email: string | null };

export type LogItem = {
  id: string; createdAt: string; source: string; productType: string | null;
  prompt: string | null; colorKey: string | null; status: string; error: string | null;
  durationMs: number | null; renderModel: string | null; renderUrl: string | null;
  /** מה שהמשתמש צירף בעצמו, להבדיל מההדמיה שנוצרה ממנו. */
  inputImageUrl?: string | null;
  inputs?: RunInputs | null;
  owner?: Owner | null;
  designId?: string | null;
  /** `RM-0047` — המספר הסידורי של העיצוב, הרפרנס שתלונה מגיעה איתו. */
  ref?: string | null;
  stages: {
    reference: string | null; conditioned: string | null;
    overlay: string | null; difference: string | null; rendered: string | null;
  };
  /** הרשימה לא נושאת SVG — רק האם קיים. הפירוט נטען בפתיחה. */
  hasSvg: boolean;
  metrics: { iou?: number; holes?: number; meanDeviationMm?: number; maxDeviationMm?: number } | null;
  debug: DebugMeta | null;
};

/** מה שנעשה לאי מתכת שחזר מהמעקב. `letter` = הוחזר גשר שאנחנו חתכנו,
 *  `ornament` = חובר לנקודה הקרובה, `dropped` = נמחק כי לא היה לאן,
 *  `kept` = גדול מכדי להיות אי, ולכן לא גושר ולא נמחק,
 *  `thickened` = גשר של המודל שהיה דק מהמינימום והורחב אליו. */
export type BridgeRecord = {
  kind: "letter" | "ornament" | "dropped" | "kept" | "thickened";
  x: number; y: number; widthMm: number; heightMm: number;
  bridgeMm?: number; fromMm?: number; spanMm?: number; char?: string | null; matchMm?: number;
  /** הגשר עצמו, לציור מעל העיצוב. חסר במחיקה. */
  pathD?: string;
};

/** הפירוט הכבד של הרצה אחת, נטען לפי דרישה מ-/api/debug/log/<id>. */
export type LogDetail = {
  /** הגאומטריה **שנשמרה** — מה שהלקוחה מקבלת ומה שייחתך. */
  svg: string | null;
  /**
   * הפלט הגולמי של הווקטורייזר, לפני מתיחה, גישור ועיבוי.
   *
   * זה מה שהוצג כאן עד היום ככותרת "SVG סופי" — ולכן כל גשר שהצינור מוסיף היה
   * בלתי נראה בבק־אופיס. ב-RM-0075 הלקוחה ראתה פס על ה-G והיומן הראה אות
   * נקייה, ואי אפשר היה להעמיד תלונה מול שום דבר. `null` בהרצה שלא נשמרה
   * ממנה גרסה — שם אין "אחרי", והגולמי הוא כל מה שיש.
   */
  rawSvg?: string | null;
  /** מספר הגרסה שנשמרה מההרצה הזו. */
  versionNo?: number | null;
  debug: DebugMeta | null;
  /** הפרומפט המלא שיצא למודל התמונה. null בהרצות שנשמרו לפני 0009. */
  renderPrompt?: string | null;
  prompt?: string | null;
  inputs?: RunInputs | null;
  /** הגשרים שנוצרו אחרי המעקב, מהגרסה שנשמרה. */
  bridges?: BridgeRecord[] | null;
  /** ההצעות שהוצעו לצד הגרסה — כל אחת עם הגישור שלה. הזוכה הוא הראשונה, ולכן
   *  `bridges` למעלה חוזר גם כאן; מה שנוסף הן החלופות. */
  offered?: OfferedCandidate[] | null;
};

/** הצעה מההרצה כפי שהיומן צריך אותה. */
export type OfferedCandidate = {
  svg: string;
  bridges?: BridgeRecord[] | null;
  report?: { status?: string } | null;
};

const detailOf = (d: LogDetail | "loading" | "error" | undefined): LogDetail | null =>
  d && d !== "loading" && d !== "error" ? d : null;

export const STATUS_COLOR: Record<string, string> = {
  ok: "bg-green-100 text-green-800 border-green-300",
  pass: "bg-green-100 text-green-800 border-green-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  skip: "bg-porcelain text-ink60 border-graphite/20",
  warn: "bg-amber-100 text-amber-800 border-amber-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  error: "bg-red-100 text-red-800 border-red-300",
  fail: "bg-red-100 text-red-800 border-red-300",
};

const BRIDGE_KIND: Record<string, string> = {
  letter: "חלל של אות — הוחזר",
  ornament: "עיטור — חובר",
  dropped: "נמחק",
  kept: "גדול מכדי להיות אי — לא נגענו",
  thickened: "גשר של המודל — הורחב",
};

/** צבע לכל סוג בשכבת הגשרים. הצבע הוא איך מבדילים גשר ששוחזר מגשר שהורחב. */
const BRIDGE_COLOR: Record<string, string> = {
  letter: "#e11d48",
  ornament: "#0ea5e9",
  thickened: "#10b981",
};

/** שורת הסיכום של חלופה. מה שחשוב לראות בלי לפתוח הוא כמה **נמחקו**. */
function bridgeSummary(bridges: BridgeRecord[]): string {
  const count = (kind: string) => bridges.filter((b) => b.kind === kind).length;
  const dropped = count("dropped");
  // עיבוי אינו גישור: שם היה גשר, הוא רק היה דק מדי. ספירה אחת לשניהם הייתה
  // מציגה אי שניצל ואי שנגע בו כאותו דבר.
  const thickened = count("thickened");
  const kept = count("kept");
  const parts = [];
  const bridged = bridges.length - dropped - thickened - kept;
  if (bridged) parts.push(`${bridged} גושרו`);
  if (thickened) parts.push(`${thickened} הורחבו`);
  if (dropped) parts.push(`${dropped} נמחקו`);
  // מה שנשאר מנותק הוא הדבר היחיד כאן שמשאיר פריט שאי אפשר לייצר.
  if (kept) parts.push(`${kept} נשארו מנותקים`);
  return parts.join(", ");
}

/**
 * הגשרים שנחתכו בכיתוב — **התכנון**, לפני שהמודל צייר משהו.
 *
 * `BridgeTable` מציגה את מה שנוסף אחרי המעקב. הגשרים שנחתכו מהפונט הם אלה
 * שהמודל מעתיק, כלומר אלה שנראים ברוב העיצובים — והם לא הופיעו כאן בכלל.
 * תלונה על גשר שבולע אות נבחנת מול העמודה האחרונה: היחס בין הגשר לחלל.
 */
function PlannedBridgeTable({ rows }: { rows: NonNullable<RunInputs["lettering"]>["rows"] }) {
  const all = rows.flatMap((r, i) => (r.bridges ?? []).map((b) => ({ ...b, row: i + 1, fontId: r.fontId })));
  if (all.length === 0) return null;
  return (
    <table className="w-full text-right text-xs">
      <thead className="text-ink60">
        <tr>
          <th className="p-1">שורה</th><th className="p-1">אות</th><th className="p-1">כיוון</th>
          <th className="p-1">רוחב הגשר</th><th className="p-1">החלל</th><th className="p-1">נתח מהחלל</th>
        </tr>
      </thead>
      <tbody>
        {all.map((b, i) => {
          const share = b.counterMm > 0 ? b.widthMm / b.counterMm : 0;
          return (
            <tr key={i} className={`border-t border-graphite/10 ${share >= 0.5 ? "text-amber-700" : ""}`}>
              <td className="p-1">{b.row} · {b.fontId}</td>
              <td className="p-1" dir="ltr">{b.char ?? "—"}</td>
              <td className="p-1">{b.sideways ? "מהצד" : "מלמעלה"}</td>
              <td className="p-1">{b.widthMm.toFixed(2)} מ״מ</td>
              <td className="p-1">{b.counterMm.toFixed(2)} מ״מ</td>
              <td className="p-1">{Math.round(share * 100)}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** טבלת הגישור. אותה טבלה לזוכה ולכל חלופה — אחרת שתיים מהן מספרות אחרת. */
function BridgeTable({ bridges }: { bridges: BridgeRecord[] }) {
  return (
    <table className="w-full text-right text-xs">
      <thead className="text-ink60">
        <tr>
          <th className="p-1">סוג</th><th className="p-1">אות</th><th className="p-1">גודל האי</th>
          <th className="p-1">רוחב הגשר</th><th className="p-1">אורך</th>
          <th className="p-1">התאמה</th><th className="p-1">מיקום</th>
        </tr>
      </thead>
      <tbody>
        {bridges.map((b, i) => (
          <tr key={i} className={`border-t border-graphite/10 ${b.kind === "dropped" ? "text-red-700" : ""}`}>
            <td className="p-1">{BRIDGE_KIND[b.kind]}</td>
            <td className="p-1" dir="ltr">{b.char ?? "—"}</td>
            <td className="p-1">{b.widthMm.toFixed(2)}×{b.heightMm.toFixed(2)}</td>
            <td className="p-1" dir={b.fromMm != null ? "ltr" : undefined}>
              {b.bridgeMm == null
                ? "—"
                : b.fromMm != null
                  ? `${b.fromMm.toFixed(2)} → ${b.bridgeMm.toFixed(2)}`
                  : `${b.bridgeMm.toFixed(2)} מ״מ`}
            </td>
            <td className="p-1">{b.spanMm != null ? `${b.spanMm.toFixed(2)} מ״מ` : "—"}</td>
            <td className="p-1">{b.matchMm != null ? `${b.matchMm.toFixed(2)} מ״מ` : "—"}</td>
            <td className="p-1" dir="ltr">{b.x.toFixed(1)}, {b.y.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  studio: "אתר", debug: "מעבדה", upload: "העלאה",
};

/** סינון היומן. "נכשלו" הוא השאלה שנשאלת בפועל כשמגיעה תלונה. מסונן בשרת,
 *  כדי שהתשובה תהיה על כל ההיסטוריה ולא רק על מה שנטען למסך. */
type StatusFilter = "" | "approved" | "problem";

/** כמה שורות בכל טעינה. */
const PAGE = 20;

/**
 * הסינון מגיע גם מהכתובת (`?status=problem`), כדי שהמספר "יצירות שנכשלו" במסך
 * הסקירה יוביל לשורות שהוא מדבר עליהן — ולא לראש היומן. הבדיקה על `window`
 * היא לרינדור בשרת: היומן עצמו נטען רק אחרי שהשער אישר, אבל אין טעם לתלות את
 * זה בהתנהגות של רכיב אחר.
 */
const statusFromUrl = (): StatusFilter => {
  if (typeof window === "undefined") return "";
  const q = new URLSearchParams(window.location.search).get("status");
  return q === "problem" || q === "approved" ? q : "";
};

/**
 * הורדת SVG כקובץ.
 *
 * blob ולא `data:` — קובץ SVG ב-data URI נפתח בטאב במקום להישמר, וגם נחתך
 * בכתובות ארוכות. השם נושא את מזהה ההרצה כדי שקובץ שהורד לא יתבלבל עם אחר.
 */
export function downloadSvg(filename: string, svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // שחרור מושהה: ריבוקיישן מיידי מבטל הורדה שעוד לא התחילה בחלק מהדפדפנים.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function RunsLog({
  /** קיים רק במעבדה (`/debug`): טעינת ההדמיה של ההרצה לתוך הטופס והרצה מחדש. */
  onRerun,
}: {
  onRerun?: (renderUrl: string) => void;
} = {}) {
  const [log, setLog] = useState<LogItem[] | null>(null);
  const [logBusy, setLogBusy] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  /** הסמן לעמוד הבא (`before`), ו-null כשאין עוד. */
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  /** סך ההרצות והכשלים — מהשרת, כי הרשימה כבר לא מחזיקה את כולן. */
  const [counts, setCounts] = useState<{ total: number; failed: number } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, LogDetail | "loading" | "error">>({});
  /** לפי זמן (ברירת מחדל) או מרוכז לפי משתמש. */
  const [groupBy, setGroupBy] = useState<"time" | "user">("time");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(statusFromUrl);
  /** ההרצה שחלון הפרומפט פתוח עליה. חלון ולא הרחבה — הפרומפט ארוך משאר השורה. */
  const [promptFor, setPromptFor] = useState<LogItem | null>(null);

  /**
   * עמוד יומן. `before=null` הוא עמוד ראשון (מחליף), אחרת המשך (מוסיף).
   *
   * המונה הוא מי שמונע החלפת סינון שמסתיימת בתשובה של הסינון הקודם: שתי לחיצות
   * מהירות הן שתי בקשות, והאחרונה שנשלחה — לא האחרונה שחזרה — היא הנכונה.
   */
  const seq = useRef(0);
  const loadLog = useCallback(
    async (before: string | null) => {
      const mine = ++seq.current;
      setLogBusy(true);
      setLogError(null);
      // עמוד ראשון: הסמן הישן שייך לרשימה שעומדת להיעלם.
      if (!before) setNextBefore(null);
      try {
        const qs = new URLSearchParams({ limit: String(PAGE) });
        if (statusFilter) qs.set("status", statusFilter);
        if (before) qs.set("before", before);
        const resp = await fetch(`/api/debug/log?${qs}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as {
          items?: LogItem[];
          nextBefore?: string | null;
        };
        if (mine !== seq.current) return;
        const items = data.items ?? [];
        setLog((prev) => {
          if (!before || !prev) return items;
          // הרצה שנכתבה בין עמוד לעמוד יכולה לחזור פעמיים; המזהה מכריע.
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...items.filter((i) => !seen.has(i.id))];
        });
        setNextBefore(data.nextBefore ?? null);
      } catch (e) {
        // בעבר כל כשל תורגם ל-log=[] והדף הציג "אין הרצות" — תקלה שנראית כמו
        // יומן ריק. עכשיו הכשל נאמר במפורש והרשימה הקודמת נשמרת.
        if (mine === seq.current) setLogError((e as Error).message);
      } finally {
        if (mine === seq.current) setLogBusy(false);
      }
    },
    [statusFilter],
  );

  /** הספירה נטענת בנפרד: היא לא משתנה בין עמוד לעמוד, והכשל בה לא מפיל יומן. */
  const loadCounts = useCallback(async () => {
    try {
      const resp = await fetch("/api/debug/log/counts");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setCounts((await resp.json()) as { total: number; failed: number });
    } catch {
      setCounts(null);
    }
  }, []);

  // שינוי סינון הוא שאילתה חדשה בשרת, ולכן טעינה מהתחלה ולא סינון של הטעון.
  useEffect(() => {
    void loadLog(null);
  }, [loadLog]);

  // הסינון נשמר בכתובת, כך שמסך היומן ניתן לשליחה כמו שהוא. `replaceState`
  // ולא ניווט: אין כאן מעבר עמוד, ולא צריך צעד נוסף בהיסטוריית הדפדפן.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (statusFilter) url.searchParams.set("status", statusFilter);
    else url.searchParams.delete("status");
    window.history.replaceState(null, "", url);
  }, [statusFilter]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const refresh = () => {
    void loadLog(null);
    void loadCounts();
  };

  /** פירוט הרצה (SVG סופי, SVG לכל מועמד, והפרומפט המלא) — נטען רק לפי דרישה.
   *  ה-ref הוא מי שמונע טעינה כפולה: בדיקה מתוך פונקציית העדכון של ה-state
   *  הייתה נשענת על תופעת לוואי בתוכה, ו-React רשאי לקרוא לה פעמיים. */
  const requested = useRef<Set<string>>(new Set());
  const loadDetail = useCallback(async (id: string) => {
    if (requested.current.has(id)) return;
    requested.current.add(id);
    setDetails((d) => ({ ...d, [id]: "loading" }));
    try {
      const resp = await fetch(`/api/debug/log/${id}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as LogDetail;
      setDetails((d) => ({
        ...d,
        [id]: {
          svg: data.svg ?? null,
          rawSvg: data.rawSvg ?? null,
          versionNo: data.versionNo ?? null,
          debug: data.debug ?? null,
          renderPrompt: data.renderPrompt ?? null,
          prompt: data.prompt ?? null,
          inputs: data.inputs ?? null,
        },
      }));
    } catch {
      // כשל אינו סופי: מסירים מהרשימה כדי שסגירה ופתיחה ינסו שוב.
      requested.current.delete(id);
      setDetails((d) => ({ ...d, [id]: "error" }));
    }
  }, []);

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    await loadDetail(id);
  };

  const openPrompt = (it: LogItem) => {
    setPromptFor(it);
    void loadDetail(it.id);
  };

  /**
   * קיבוץ היומן. ברירת המחדל היא זמן — סדר ההרצות. "לפי משתמש" עונה על שאלה
   * אחרת לגמרי: מה עשה מי, ברצף אחד, בלי לרדוף אחרי שורות שמפוזרות בין
   * משתמשים. הקבוצה הפעילה ביותר קודם.
   *
   * מקבץ את מה שנטען, לא את כל היומן — בתצוגה מעומדת "כל ההרצות של פלונית"
   * פירושו "מבין העמודים שנפתחו". הסינון, לעומת זאת, קורה בשרת.
   */
  const groups = useMemo(() => {
    const items = log ?? [];
    if (groupBy === "time" || items.length === 0) {
      return [{ key: "all", owner: null as Owner | null, items }];
    }
    const by = new Map<string, { key: string; owner: Owner | null; items: LogItem[] }>();
    for (const it of items) {
      const key = it.owner?.id ?? "unassigned";
      const g = by.get(key) ?? { key, owner: it.owner ?? null, items: [] };
      g.items.push(it);
      by.set(key, g);
    }
    return [...by.values()].sort((a, b) => b.items[0].createdAt.localeCompare(a.items[0].createdAt));
  }, [log, groupBy]);

  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="grid gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-[2px] border border-graphite/20 px-3 py-1 text-xs hover:bg-porcelain"
          onClick={refresh}
        >
          רענון
        </button>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-mist">תצוגה:</span>
          {([["time", "לפי זמן"], ["user", "לפי משתמש"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setGroupBy(k)}
              className={`rounded-[2px] border px-2 py-1 ${
                groupBy === k ? "border-graphite bg-graphite text-white" : "border-graphite/20 hover:bg-porcelain"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-mist">סינון:</span>
          {([["", "הכול"], ["problem", "נכשלו"], ["approved", "הצליחו"]] as const).map(([k, label]) => (
            <button
              key={k || "all"}
              type="button"
              onClick={() => setStatusFilter(k)}
              className={`rounded-[2px] border px-2 py-1 ${
                statusFilter === k ? "border-graphite bg-graphite text-white" : "border-graphite/20 hover:bg-porcelain"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {logBusy && <span className="text-xs text-ink60">טוען…</span>}
        {log && (
          <span className="text-xs text-mist">
            {shown} שורות טעונות
            {counts && ` · ${counts.total} הרצות ביומן, ${counts.failed} נכשלו`}
          </span>
        )}
      </div>

      {logError && (
        <div className="rounded-[2px] border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          טעינת היומן נכשלה: {logError}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} className="grid gap-2">
          {groupBy === "user" && <OwnerHeader owner={g.owner} count={g.items.length} />}
          {g.items.map((it) => (
            <LogRow
              key={it.id}
              it={it}
              expanded={expanded === it.id}
              detail={details[it.id]}
              onToggle={() => void toggleExpand(it.id)}
              onPrompt={() => openPrompt(it)}
              onRerun={onRerun && it.renderUrl ? () => onRerun(it.renderUrl!) : undefined}
            />
          ))}
        </div>
      ))}

      {log && shown === 0 && !logBusy && <div className="text-mist">אין הרצות שתואמות את הסינון.</div>}

      {/* המשך היומן. הכפתור מופיע רק כשהשרת אמר שיש עוד — "אין עוד" הוא מידע
          שהוא מחזיק, לא ניחוש מספירת השורות שהתקבלו. */}
      {nextBefore && (
        <button
          type="button"
          disabled={logBusy}
          onClick={() => void loadLog(nextBefore)}
          className="mt-1 self-center rounded-[2px] border border-graphite/20 px-4 py-1.5 text-xs hover:bg-porcelain disabled:opacity-50"
        >
          {logBusy ? "טוען…" : `עוד ${PAGE} הרצות`}
        </button>
      )}
      {log && shown > 0 && !nextBefore && !logBusy && (
        <div className="mt-1 text-center text-[11px] text-mist">סוף היומן.</div>
      )}

      {promptFor && (
        <PromptDialog
          subtitle={`${promptFor.ref ? `${promptFor.ref} · ` : ""}${new Date(promptFor.createdAt).toLocaleString("he-IL")}${
            promptFor.owner ? ` · ${promptFor.owner.name}` : ""
          }`}
          userPrompt={promptFor.prompt ?? detailOf(details[promptFor.id])?.prompt ?? null}
          imageUrl={promptFor.inputImageUrl ?? null}
          referenceUrl={promptFor.stages.reference}
          renderModel={promptFor.renderModel}
          inputs={detailOf(details[promptFor.id])?.inputs ?? promptFor.inputs ?? null}
          renderPrompt={detailOf(details[promptFor.id])?.renderPrompt ?? null}
          state={
            details[promptFor.id] === "loading"
              ? "loading"
              : details[promptFor.id] === "error"
                ? "error"
                : "ready"
          }
          onClose={() => setPromptFor(null)}
        />
      )}
    </div>
  );
}

/** כותרת קבוצה בתצוגה "לפי משתמש". */
function OwnerHeader({ owner, count }: { owner: Owner | null; count: number }) {
  return (
    <div className="mt-2 flex items-center gap-2 border-b border-graphite/10 pb-1">
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: owner?.color ?? "#c9ccd1" }}
      />
      <span className="font-semibold">{owner?.name ?? "ללא שיוך"}</span>
      {owner?.email && <bdi className="text-xs text-ink60">{owner.email}</bdi>}
      <span className="text-xs text-mist">· {count} הרצות</span>
    </div>
  );
}

/** המאפיינים שקבעו את ההרצה, כשורת תגיות. */
export function InputChips({ inputs }: { inputs: RunInputs }) {
  const chips: string[] = [];
  if (inputs.lengthMm != null && inputs.widthMm != null) {
    chips.push(`${round(inputs.lengthMm)}×${round(inputs.widthMm)} מ״מ`);
  }
  if (inputs.thicknessMm != null) chips.push(`עובי ${round(inputs.thicknessMm)}`);
  if (inputs.minHoleMm != null) chips.push(`פתח מ׳ ${round(inputs.minHoleMm)}`);
  // רשת ולא שורות בלבד: מספר החלופות הוא המכפלה, וכשהוא 1 זו התשובה לשאלה
  // "למה חזרה חלופה אחת".
  if (inputs.rows != null) {
    chips.push(
      inputs.cols != null && inputs.cols > 1
        ? `${inputs.rows}×${inputs.cols} פריטים`
        : `${inputs.rows} שורות`,
    );
  }
  if (inputs.calls != null) chips.push(`${inputs.calls} קריאות`);
  // צורת הקנבס שנשלחה למודל. היא נשמרה מאז שנוסף הקנבס לאורך אבל לא הוצגה —
  // ותלונה על פריט חתוך מתחילה בדיוק בשאלה "על איזה קנבס זה רץ".
  if (inputs.canvasSize) {
    const [w, h] = inputs.canvasSize.split("x").map(Number);
    const orient = w > 0 && h > 0 ? (w < h ? "קנבס לאורך" : "קנבס לרוחב") : "קנבס";
    chips.push(`${orient} ${inputs.canvasSize.replace("x", "×")}`);
  }
  if (inputs.colorKey) chips.push(`צבע ${inputs.colorKey}`);
  // עריכה מול יצירה מאפס — ההבחנה שקובעת אם מה שהמשתמש ראה היה אמור להישמר.
  // כשידוע *על איזו* גרסה השינוי נשלח, זה מה שנכתב: "עריכה של הקיים" לבדו לא
  // מאפשר להעמיד את הפרומפט מול התמונה שהמודל קיבל.
  if (inputs.editedFromVersion != null) chips.push(`עריכה של גרסה ${inputs.editedFromVersion}`);
  else if (inputs.editedFromCurrent) chips.push("עריכה של הקיים");
  if (inputs.imageUpload) chips.push("תמונה שהועלתה");
  if (inputs.promptOverride) chips.push("פרומפט ידני");
  if (inputs.imageCount) chips.push(`${inputs.imageCount} קבצים`);
  // ההבחנה בין "לא צורפה תמונה" ל"צורפה ולא נשלחה". השנייה היא תלונה.
  if (inputs.imageDropped) {
    chips.push(
      inputs.imageDropped === "lettering"
        ? "⚠ התמונה לא נשלחה — הכיתוב תפס את הייחוס"
        : "⚠ התמונה לא נשלחה — העיצוב הקיים תפס את הייחוס",
    );
  }
  // הכיתוב והגשרים שנחתכו בו. הרוחב המרבי הוא מה שמחפשים בעין כשמגיעה תלונה
  // על אות שנבלעה — הפירוט המלא בטבלה שבחלון הפרומפט.
  if (inputs.lettering) {
    chips.push(`כיתוב "${inputs.lettering.text ?? ""}"`);
    const planned = inputs.lettering.rows.flatMap((r) => r.bridges ?? []);
    if (planned.length) {
      const worst = Math.max(...planned.map((b) => (b.counterMm > 0 ? b.widthMm / b.counterMm : 0)));
      chips.push(`${planned.length} גשרי כיתוב · עד ${Math.round(worst * 100)}% מהחלל`);
    }
  }
  if (chips.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className="rounded-[2px] bg-porcelain px-1.5 py-0.5 text-[11px] text-ink60">{c}</span>
      ))}
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

/** שורה אחת ביומן: הסיכום, המאפיינים, ומה שהמשתמש נתן. */
function LogRow({ it, expanded, detail, onToggle, onPrompt, onRerun }: {
  it: LogItem;
  expanded: boolean;
  detail: LogDetail | "loading" | "error" | undefined;
  onToggle: () => void;
  onPrompt: () => void;
  onRerun?: () => void;
}) {
  const d = detailOf(detail);
  const svg = d?.svg ?? null;
  return (
    <div className="overflow-hidden rounded-[2px] border border-graphite/10 bg-white">
      {/* שורת סיכום.
          נערמת במסך צר: התמונות והכפתורים הם ברוחב קבוע, ובטלפון הם לא
          משאירים לטור האמצעי רוחב אמיתי — הטקסט נדחס לאות בשורה והמסך נשבר.
          מ-`sm` ומעלה חוזרת השורה האחת, שבה ההדמיה עומדת מול הטקסט שלה. */}
      <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-start sm:gap-3">
        {/* התמונות נשארות זו לצד זו גם כשהשורה נערמת — ההשוואה ביניהן היא
            כל הטעם שלהן. */}
        <div className="flex shrink-0 flex-wrap gap-2">
          {it.renderUrl ? (
            <a href={it.renderUrl} target="_blank" rel="noreferrer" className="shrink-0" title="ההדמיה שנוצרה">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.renderUrl} alt="" className="h-14 w-24 rounded bg-porcelain object-contain" />
            </a>
          ) : (
            <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded bg-porcelain text-[10px] text-mist">אין הדמיה</div>
          )}
          {/* מה שהמשתמש צירף, ליד ההדמיה שיצאה ממנו — ההשוואה היחידה שאפשר
              לעשות בעין על תלונה מסוג "זה לא מה ששלחתי". */}
          {it.inputImageUrl && (
            <a href={it.inputImageUrl} target="_blank" rel="noreferrer" className="shrink-0" title="הקובץ שהמשתמש צירף">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.inputImageUrl} alt="קובץ שצורף" className="h-14 w-14 rounded border border-cobalt/40 bg-porcelain object-contain" />
            </a>
          )}
          {/* התמונה שנמסרה למודל — הכיתוב שנחתך מהפונט, או העיצוב שנערך. ליד
              ההדמיה שחזרה ממנה: זו ההשוואה שעונה על "מה איבדנו ומי איבד". */}
          {it.stages.reference && (
            <a href={it.stages.reference} target="_blank" rel="noreferrer" className="shrink-0" title="התמונה שנשלחה למודל">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.stages.reference} alt="ייחוס" className="h-14 w-24 rounded border border-amber-400/60 bg-porcelain object-contain" />
            </a>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* המספר קודם לכל השאר: הוא מה שמחפשים בעין כשמגיעה תלונה. */}
            {it.ref && (
              <span className="font-display text-xs font-bold tracking-[0.12em] text-cobalt" dir="ltr">
                {it.ref}
              </span>
            )}
            <span className={`rounded border px-1.5 text-xs ${STATUS_COLOR[it.status] ?? ""}`}>{it.status}</span>
            <span className="rounded border border-graphite/20 bg-porcelain px-1.5 text-xs text-ink60">{SOURCE_LABEL[it.source] ?? it.source}</span>
            {it.owner && (
              <span className="flex items-center gap-1 text-xs text-ink60">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: it.owner.color }} />
                {it.owner.name}
              </span>
            )}
            {it.productType && <span className="text-xs text-ink60">{it.productType === "ring" ? "טבעת" : "צמיד"}</span>}
            {/* לאיזה מודל זה נשלח. שתי הרצות שנראות זהות יכולות להיבדל רק בזה,
                ובלי המספר הזה ההשוואה ביניהן היא ניחוש. */}
            {it.renderModel && (
              <span className="rounded border border-amber-400/60 bg-amber-50 px-1.5 text-xs text-amber-800" dir="ltr">
                {it.renderModel}
              </span>
            )}
            {it.metrics?.iou != null && <span className="text-xs text-ink60">IoU {it.metrics.iou.toFixed(3)}</span>}
            {it.metrics?.holes != null && <span className="text-xs text-ink60">· {it.metrics.holes} חורים</span>}
            {it.durationMs != null && <span className="text-xs text-mist">· {(it.durationMs / 1000).toFixed(1)}s</span>}
          </div>
          {it.prompt && <div className="mt-0.5 break-words text-xs text-ink60">{it.prompt}</div>}
          {it.inputs && <InputChips inputs={it.inputs} />}
          {it.error && <div className="mt-0.5 break-words text-xs text-red-600">שגיאה: {it.error}</div>}
          <div className="mt-0.5 text-[10px] text-mist">
            {new Date(it.createdAt).toLocaleString("he-IL")}
            {it.colorKey ? ` · צבע ${it.colorKey}` : ""}
          </div>
        </div>
        {/* טור הפעולות. במסך צר הוא שורה שנשברת מתחת לשורה: טור צר בן מילה
            אחת היה מה שדחס את שאר השורה לאות בשורה. */}
        <div className="flex flex-wrap gap-1 sm:shrink-0 sm:flex-col sm:flex-nowrap">
          <button className="rounded-[2px] border border-graphite/20 px-2 py-1 text-xs hover:bg-porcelain"
            onClick={onToggle}>{expanded ? "סגור" : "שלבים"}</button>
          <button className="rounded-[2px] border border-cobalt px-2 py-1 text-xs text-cobalt hover:bg-cobalt/5"
            onClick={onPrompt}>פרומפט</button>
          {/* ההדמיה שהלקוחה עצמה רואה במסך התוצאה — הגרסה החיה של העיצוב הזה. */}
          {it.designId && (
            <a
              className="rounded-[2px] border border-graphite/20 px-2 py-1 text-center text-xs hover:bg-porcelain"
              href={`/design?resume=${it.designId}`}
              target="_blank"
              rel="noreferrer"
              title="פתיחת העיצוב כפי שהלקוחה רואה אותו"
            >
              העיצוב
            </a>
          )}
          {onRerun && (
            <button
              className="rounded-[2px] border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
              onClick={onRerun}
            >
              הרץ מחדש
            </button>
          )}
          {/* הורדת ה-SVG הסופי. הכפתור מופיע כשידוע שיש SVG; ההורדה עצמה
              דורשת את הפירוט, שנטען בלחיצה אם עוד לא נטען. */}
          {it.hasSvg && (
            <DownloadSvgButton
              svg={svg}
              filename={`run-${it.id.slice(0, 8)}`}
              onNeedDetail={onToggle}
            />
          )}
        </div>
      </div>

      {/* פירוט מלא */}
      {expanded && (
        <div className="border-t border-graphite/10 bg-porcelain p-3">
          {detail === "loading" && <div className="text-xs text-ink60">טוען פירוט…</div>}
          {detail === "error" && (
            <div className="text-xs text-red-600">טעינת הפירוט נכשלה. אפשר לסגור ולפתוח שוב.</div>
          )}
          <Diagnostics
            images={{
              input: it.inputImageUrl ?? null,
              reference: it.stages.reference,
              render: it.renderUrl,
              conditioned: it.stages.conditioned,
              overlay: it.stages.overlay,
              difference: it.stages.difference,
              rendered: it.stages.rendered,
            }}
            renderModel={it.renderModel}
            svg={svg}
            rawSvg={d?.rawSvg ?? null}
            versionNo={d?.versionNo ?? null}
            // undefined = הפירוט עוד לא נטען (אין מה להגיד); null = נטען ואין
            // נתוני גישור — וזה מצב שמוצג, לא שתיקה. ראה ההערה ב-Diagnostics.
            bridges={d ? d.bridges ?? null : undefined}
            offered={d?.offered ?? null}
            // המדדים מגיעים עם הרשימה; ה-SVG של המועמדים רק מהפירוט.
            debug={d?.debug ?? it.debug}
            svgName={`run-${it.id.slice(0, 8)}`}
          />
        </div>
      )}
    </div>
  );
}

/** הורדת ה-SVG של הרצה. כל עוד הפירוט לא נטען, הלחיצה פותחת אותו. */
function DownloadSvgButton({
  svg, filename, onNeedDetail,
}: {
  svg: string | null;
  filename: string;
  onNeedDetail: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-[2px] border border-graphite/20 px-2 py-1 text-xs hover:bg-porcelain"
      title={svg ? "הורדת ה-SVG הסופי" : "פתיחת הפירוט כדי להוריד את ה-SVG"}
      onClick={() => (svg ? downloadSvg(filename, svg) : onNeedDetail())}
    >
      {svg ? "⭳ SVG" : "SVG"}
    </button>
  );
}

/**
 * הפרומפט המלא בחלון נפרד. הוא כ-3KB של טקסט — בתוך השורה הוא מסתיר את היומן,
 * וברשימה הוא משקל מיותר על כל שורה. כאן הוא נטען לפי דרישה, יחד עם מה
 * שהמשתמש עצמו נתן: הטקסט שלו, הקובץ שצירף, והמאפיינים שבנו את הפרומפט.
 */
export function PromptDialog({
  subtitle, userPrompt, imageUrl, referenceUrl = null, renderModel = null,
  inputs, renderPrompt, state, onClose,
}: {
  subtitle: string;
  userPrompt: string | null;
  imageUrl: string | null;
  /** התמונה שנמסרה למודל. חלק ממה שנשלח בדיוק כמו הטקסט, ולכן באותו סעיף. */
  referenceUrl?: string | null;
  /** לאיזה מודל תמונה זה נשלח. */
  renderModel?: string | null;
  inputs: RunInputs | null;
  renderPrompt: string | null;
  /** "loading"/"error" רק כשהפרומפט נטען לפי דרישה (היומן). */
  state: "ready" | "loading" | "error";
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!renderPrompt) return;
    try {
      await navigator.clipboard.writeText(renderPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-3xl rounded-[2px] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="font-semibold">
            הפרומפט המלא <span className="text-xs font-normal text-mist">· {subtitle}</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-[2px] border border-graphite/30 px-2 py-0.5 text-xs">
            סגירה
          </button>
        </div>

        <div className="grid gap-3">
          <section>
            <div className="mb-1 text-xs font-medium text-ink60">מה שהמשתמש כתב</div>
            <div className="whitespace-pre-wrap break-words rounded-[2px] border border-graphite/10 bg-porcelain p-2 text-sm">
              {userPrompt || <span className="text-mist">— (לא נשלח טקסט)</span>}
            </div>
          </section>

          {imageUrl && (
            <section>
              <div className="mb-1 text-xs font-medium text-ink60">הקובץ שהמשתמש צירף</div>
              <a href={imageUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="קובץ שצורף" className="max-h-56 rounded border border-graphite/10 bg-porcelain object-contain" />
              </a>
            </section>
          )}

          {referenceUrl && (
            <section>
              <div className="mb-1 text-xs font-medium text-ink60">
                התמונה שנמסרה למודל — מה שהוא התבקש להעתיק
              </div>
              <a href={referenceUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={referenceUrl} alt="תמונת הייחוס" className="max-h-56 rounded border border-amber-400/60 bg-porcelain object-contain" />
              </a>
            </section>
          )}

          {inputs && (
            <section>
              <div className="mb-1 text-xs font-medium text-ink60">מאפייני ההרצה</div>
              <InputChips inputs={inputs} />
            </section>
          )}

          {/* הגשרים שנחתכו בכיתוב — יושבים כאן ולא בשלבים, כי הם חלק ממה
              שנמסר למודל ולא ממה שתוקן אחריו. זו הטבלה שעונה על "למה נוצר
              גשר על האות הזאת" ועל "למה הוא רחב ממה שהוא מחזיק". */}
          {inputs?.lettering && (
            <section>
              <div className="mb-1 text-xs font-medium text-ink60">הגשרים שנחתכו בכיתוב (התכנון)</div>
              {inputs.lettering.rows.some((r) => r.bridges?.length) ? (
                <div className="overflow-x-auto rounded-[2px] border border-graphite/10 p-1">
                  <PlannedBridgeTable rows={inputs.lettering.rows} />
                </div>
              ) : (
                <div className="text-xs text-mist">
                  לא נחתך אף גשר בכיתוב — כל גשר שנראה בעיצוב הוא של המודל, או נוסף אחרי המעקב.
                </div>
              )}
            </section>
          )}

          <section>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink60">
                מה שנשלח למודל התמונה
                {renderModel && (
                  <span className="ms-1 rounded border border-amber-400/60 bg-amber-50 px-1.5 py-px text-amber-800" dir="ltr">
                    {renderModel}
                  </span>
                )}
              </span>
              {renderPrompt && (
                <button type="button" onClick={() => void copy()} className="rounded-[2px] border border-graphite/20 px-2 py-0.5 text-xs hover:bg-porcelain">
                  {copied ? "הועתק ✓" : "העתקה"}
                </button>
              )}
            </div>
            {state === "loading" && <div className="text-xs text-ink60">טוען…</div>}
            {state === "error" && <div className="text-xs text-red-600">טעינת הפרומפט נכשלה.</div>}
            {state === "ready" && (
              renderPrompt ? (
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-[2px] border border-graphite/10 bg-porcelain p-2 text-xs" dir="ltr">
                  {renderPrompt}
                </pre>
              ) : (
                <div className="rounded-[2px] border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                  הפרומפט המלא לא נשמר להרצה הזו — או שהקלט היה תמונה שהועלתה
                  ולא נוצרה בה הדמיה. הפרומפט נשמר מהמיגרציה 0009 והלאה; הרצות
                  ישנות יותר שמרו רק את הטקסט של המשתמש.
                </div>
              )
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** רכיב אבחון משותף לתצוגת הרצה חיה וליומן. images כבר כתובות URL/dataURL מוכנות. */
export function Diagnostics({ images, renderModel, svg, rawSvg = null, versionNo = null, debug, bridges, offered = null, svgName = "design" }: {
  images: StageUrls; renderModel: string | null; svg: string | null; debug: DebugMeta | null;
  /** הפלט הגולמי, לפני מסגור. מוצג לצד `svg` — ההפרש ביניהם הוא מה שהצינור
   *  עשה אחרי שהמודל צייר, וזה מה שלא היה נראה כאן. */
  rawSvg?: string | null;
  versionNo?: number | null;
  /** גשרים שנוצרו אחרי המעקב — לא חלק ממה שהמודל צייר. שלושה מצבים, בכוונה
   *  בלי ברירת מחדל שממזגת אותם: מערך = יש נתונים (גם ריק הוא נתון); `null` =
   *  אין נתוני גישור להרצה, וזה מוצג; `undefined` = הנתונים עוד לא כאן
   *  (הפירוט בטעינה), ואז שותקים. */
  bridges?: BridgeRecord[] | null;
  /** ההצעות שהוצעו בהרצה. הראשונה היא הזוכה ומוצגת למעלה. */
  offered?: OfferedCandidate[] | null;
  /** בסיס שם הקובץ להורדות מהמסך הזה. */
  svgName?: string;
}) {
  const stages = debug?.stages ?? [];
  const candidates = debug?.candidates ?? [];
  // הראשונה היא הגרסה שנשמרה, וכבר יש לה אוברליי וטבלה למעלה.
  const alternatives = (offered ?? []).slice(1);
  const gates = debug?.gates ?? {};
  const warnings = debug?.warnings ?? [];
  // הגאומטריה של מועמד נבחר — מה שיצא בפועל מהמעקב, לבדיקה בעין.
  const [svgView, setSvgView] = useState<{ id: string; metal: string; cutouts: string } | null>(null);
  const [svgLayer, setSvgLayer] = useState<"metal" | "cutouts">("metal");
  return (
    <div className="grid gap-4">
      {/* timeline */}
      {(stages.length > 0 || debug?.status) && (
        <div className="rounded-[2px] border border-graphite/10 bg-white p-3">
          <div className="mb-2 font-semibold">
            שלבים — סטטוס כללי:{" "}
            <span className={`rounded border px-2 py-0.5 ${STATUS_COLOR[debug?.status ?? ""] ?? STATUS_COLOR.fail}`}>{debug?.status ?? "—"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stages.map((st, i) => (
              <div key={i} className={`rounded-[2px] border px-3 py-2 ${STATUS_COLOR[st.status] ?? ""}`}>
                <div className="font-medium">{st.name}</div>
                <div className="text-xs opacity-80">{st.detail}</div>
              </div>
            ))}
          </div>
          {warnings.length > 0 && (
            <div className="mt-2 break-words text-xs text-amber-700">אזהרות: {warnings.join(" · ")}</div>
          )}
          {(gates.min_iou_hard != null || debug?.color_key != null) && (
            <div className="mt-2 text-xs text-ink60">
              צבע־מפתח: {debug?.color_key ?? "—"}
              {gates.min_iou_hard != null && <> · שערים: IoU≥{gates.min_iou_hard} · סטייה ממוצעת≤{gates.max_mean_deviation_mm}מ״מ · מקס≤{gates.max_max_deviation_mm}מ״מ</>}
              {debug?.smooth_iters != null && <> · החלקה x{debug.smooth_iters}</>}
              {debug?.width_mm != null && <> · אורך נגזר {debug.width_mm}מ״מ</>}
            </div>
          )}
        </div>
      )}

      {/* images */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {/* הקלט לפני הפלט: בלי הכרטיס הזה אי אפשר לראות בשלבים מה המשתמש נתן,
            רק מה חזר — וזו השאלה הראשונה כשהדמיה לא דומה למה שביקשו. */}
        {images.input && <ImgCard title="קובץ שהמשתמש צירף (קלט)" src={images.input} />}
        {images.render && <ImgCard title={`הדמיית AI${renderModel ? ` (${renderModel})` : ""}`} src={images.render} />}
        {images.conditioned && <ImgCard title="דו־גוני (קונדישנינג)" src={images.conditioned} />}
        {images.overlay && <ImgCard title="Overlay (טרייס מול מקור)" src={images.overlay} />}
        {images.difference && <ImgCard title="Difference" src={images.difference} />}
        {images.rendered && <ImgCard title="רינדור חוזר של ה-SVG" src={images.rendered} />}
        {/* מה שנשמר, ולא מה שהמעקב החזיר. `generation_runs.svg` הוא הגולמי —
            לפני מתיחה למידה שהוזמנה, לפני גישור ולפני עיבוי — והוא הוצג כאן
            ככותרת "SVG סופי". לכן כל גשר שהצינור מוסיף היה בלתי נראה: הלקוחה
            ראתה פס על האות, והיומן הראה אות נקייה. */}
        {svg && (
          <SvgCard
            title={versionNo != null ? `SVG שנשמר · גרסה ${versionNo}` : "SVG סופי"}
            svg={svg}
            filename={svgName}
          />
        )}
        {rawSvg && (
          <SvgCard title="גולמי — לפני מסגור וגישור" svg={rawSvg} filename={`${svgName}-raw`} />
        )}
      </div>

      {/* גשרים שנוצרו אחרי המעקב */}
      {bridges && bridges.length > 0 && svg && (
        <BridgeOverlayCard svg={svg} bridges={bridges} />
      )}
      {bridges && bridges.length > 0 && (
        <div className="overflow-x-auto rounded-[2px] border border-graphite/10 bg-white p-3">
          <div className="mb-1 font-semibold">
            גשרים שנוספו אחרי המעקב ({bridges.length})
          </div>
          {/* המשפט הזה הוא כל ההבדל: אלה לא חלק ממה שהמודל צייר. */}
          <div className="mb-2 text-xs text-ink60">
            אי מתכת שחזר מהמעקב מנותק — נגשר כאן, אחרי שהמודל סיים. חלל של אות מקבל
            בחזרה את הגשר שאנחנו חתכנו; אי בעיטור מחובר לנקודה הקרובה; ומה שרחוק מדי נמחק.
            בנוסף, גשר שהמודל צייר בעצמו וייצא דק מהמינימום לייצור מורחב אליו — שם
            עמודת הרוחב מראה מכמה למה.
          </div>
          <BridgeTable bridges={bridges} />
        </div>
      )}
      {/* אפס גשרים ולא "אין מה להציג": בלי השורה הזאת, הרצה שהגישור לא רץ בה
          נראית בדיוק כמו הרצה שלא היה בה מה לגשר — וזו בדיוק ההבחנה שנדרשה
          כשחזר עיצוב שכל אותיותיו מרחפות. */}
      {bridges?.length === 0 && (
        <div className="rounded-[2px] border border-graphite/10 bg-white p-3 text-xs text-ink60">
          לא נוסף אף גשר אחרי המעקב — כלומר לא חזר מהמעקב אף אי מנותק. אם בכל זאת
          יש בעיצוב מתכת מרחפת, היא לא זוהתה כאי.
        </div>
      )}
      {/* אין נתונים ≠ אפס גשרים: הגישור נקרא מהגרסה שההרצה שמרה, והרצה שנדחתה
          או שקדמה לתיעוד פשוט לא השאירה כלום. בלי ההודעה, היעדר שלב הצביעה
          נראה כמו באג בתצוגה במקום כמצב של ההרצה. */}
      {bridges === null && (
        <div className="rounded-[2px] border border-graphite/10 bg-white p-3 text-xs text-ink60">
          אין נתוני גישור להרצה הזו — לא נשמרה ממנה גרסה (הרצה שנדחתה או נכשלה),
          או שהגרסה נשמרה לפני שהגישור החל להירשם.
        </div>
      )}

      {/* הגישור של החלופות. הזוכה כבר למעלה — כאן מה שנעשה בשאר, שעד עכשיו
          נראו ביומן כאילו לא נגעו בהן. */}
      {alternatives.length > 0 && (
        <div className="rounded-[2px] border border-graphite/10 bg-white p-3">
          <div className="mb-2 font-semibold">החלופות ({alternatives.length})</div>
          <div className="grid gap-2">
            {alternatives.map((c, i) => {
              const list = c.bridges ?? [];
              return (
                <details key={i} className="rounded-[2px] border border-graphite/10">
                  <summary className="cursor-pointer p-2 text-xs">
                    חלופה {i + 2}
                    {c.report?.status && <span className="text-ink60"> · {c.report.status}</span>}
                    {" · "}
                    {list.length > 0 ? bridgeSummary(list) : "בלי גישור"}
                  </summary>
                  <div className="grid gap-2 p-2">
                    {list.length > 0 && <BridgeOverlayCard svg={c.svg} bridges={list} />}
                    {list.length === 0 && <SvgCard title={`חלופה ${i + 2}`} svg={c.svg} filename={`${svgName}-alt${i + 2}`} />}
                    {list.length > 0 && (
                      <div className="overflow-x-auto"><BridgeTable bridges={list} /></div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      {/* candidates */}
      {candidates.length > 0 && (
        <div className="overflow-x-auto rounded-[2px] border border-graphite/10 bg-white p-3">
          <div className="mb-2 font-semibold">מועמדים ({candidates.length})</div>
          <table className="w-full text-right text-xs">
            <thead className="text-ink60">
              <tr>
                <th className="p-1">מזהה</th><th className="p-1">IoU</th><th className="p-1">ממוצע</th><th className="p-1">מקס</th>
                <th className="p-1">חורים (מקור/וקטור)</th>
                <th className="p-1">חתיכות מתכת</th>
                <th className="p-1">טופולוגיה</th><th className="p-1">עוגנים</th>
                <th className="p-1">ציון</th><th className="p-1">נדחה</th><th className="p-1">שרטוט</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.candidate_id} className={`border-t border-graphite/10 ${c.selected ? "bg-green-50 font-medium" : ""}`}>
                  <td className="p-1">{c.candidate_id}{c.selected ? " ✓" : ""}</td>
                  <td className="p-1">{c.iou}</td>
                  <td className="p-1">{c.mean_dev_mm}</td>
                  <td className="p-1">{c.max_dev_mm}</td>
                  <td className="p-1">
                    {c.source_holes}/{c.vector_holes}
                    {c.hole_budget != null && <span className="text-ink60"> (≤{c.hole_budget})</span>}
                  </td>
                  <td className={`p-1 ${
                    c.vector_components != null && c.source_components != null &&
                    Math.abs(c.vector_components - c.source_components) > (c.component_budget ?? 1)
                      ? "font-semibold text-red-600" : ""}`}>
                    {c.source_components != null ? `${c.source_components}/${c.vector_components}` : "—"}
                  </td>
                  <td className="p-1">{c.topology_ok ? "✓" : "✗"}</td>
                  <td className="p-1">{c.anchors}</td>
                  <td className="p-1">{c.score}</td>
                  <td className="p-1 text-red-600">{c.rejected_reason ?? ""}</td>
                  <td className="p-1">
                    {c.metal_svg ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSvgView({ id: c.candidate_id, metal: c.metal_svg!, cutouts: c.cutouts_svg ?? "" })}
                          className="rounded-[2px] border border-cobalt px-2 py-0.5 text-cobalt hover:bg-cobalt/5"
                        >
                          הצג
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadSvg(`${svgName}-${c.candidate_id}`, c.metal_svg!)}
                          title="הורדת ה-SVG של המועמד"
                          className="rounded-[2px] border border-graphite/20 px-2 py-0.5 hover:bg-porcelain"
                        >
                          ⭳
                        </button>
                      </div>
                    ) : (
                      <span className="text-ink60">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* גאומטריה של המועמד שנבחר לצפייה */}
      {svgView && (
        <div className="rounded-[2px] border border-cobalt/40 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">שרטוט מהמעקב · {svgView.id}</div>
            <div className="flex items-center gap-2">
              {(["metal", "cutouts"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setSvgLayer(l)}
                  className={`rounded-[2px] border px-2 py-0.5 text-xs ${
                    svgLayer === l ? "border-graphite bg-graphite text-porcelain" : "border-graphite/30"}`}
                >
                  {l === "metal" ? "מתכת" : "חיתוכים"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSvgView(null)}
                className="rounded-[2px] border border-graphite/30 px-2 py-0.5 text-xs"
              >
                סגירה
              </button>
            </div>
          </div>
          <SvgCard
            title={svgLayer === "metal" ? "המתכת שנשארת" : "מה שנחתך"}
            svg={svgLayer === "metal" ? svgView.metal : svgView.cutouts}
            filename={`${svgName}-${svgView.id}-${svgLayer}`}
          />
          <p className="mt-2 text-xs text-ink60">
            כך נראה התוצר בפועל. השוו למסכה הדו־גונית למעלה — עיוות במתאר החיצוני
            מוריד את ה-IoU ומקפיץ את הסטייה המקסימלית, גם כשהתבנית עצמה נראית תקינה.
          </p>
        </div>
      )}
    </div>
  );
}

function ImgCard({ title, src }: { title: string; src: string }) {
  return (
    <div className="rounded-[2px] border border-graphite/10 bg-white p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink60">{title}</span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="rounded-[2px] border border-graphite/20 px-1.5 py-0.5 text-[11px] text-ink60 hover:bg-porcelain"
          title="פתיחת התמונה המלאה"
        >
          מלא
        </a>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={title} className="w-full rounded bg-porcelain object-contain" />
    </div>
  );
}

/**
 * שרטוט לבדיקה בעין, עם הורדה.
 *
 * ה-SVG שיוצא מהצינור נושא `fill="black"` על כל path. `fill` על אלמנט ה-<svg>
 * אינו גובר עליו — ירושה מפסידה למאפיין מפורש — ולכן הצורות צוירו שחור על
 * הרקע האפור-כהה של הכרטיס, ובפועל לא היה אפשר להבדיל ביניהן. הכלל כאן פונה
 * לצאצאים (`[&_svg_*]`), וכלל CSS גובר על מאפיין תצוגה שבקובץ.
 *
 * שני מצבים ולא אחד: מתכת בהירה על רקע כמעט-שחור מראה את הצורה, ושחור על לבן
 * מראה קווים דקים שנבלעים בזוהר. אותה גאומטריה, שתי שאלות שונות.
 */
/**
 * העיצוב הסופי, והגשרים שנוספו אחריו צבועים מעליו.
 *
 * טבלה אומרת שנוסף גשר; היא לא אומרת אם הוא יושב נכון. זו השאלה היחידה
 * שנשאלת כשבוחנים את המנגנון, ואי אפשר לענות עליה במספרים.
 */
export function BridgeOverlayCard({ svg, bridges }: { svg: string; bridges: BridgeRecord[] }) {
  const drawn = bridges.filter((b) => b.pathD);
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (!drawn.length || !vb) return null;
  // אותו viewBox, ולכן הגשרים נופלים בדיוק על מקומם בעיצוב.
  const overlay =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">` +
    drawn
      .map((b) => `<path d="${b.pathD}" fill="${BRIDGE_COLOR[b.kind] ?? "#0ea5e9"}"/>`)
      .join("") +
    "</svg>";
  return (
    <div className="rounded-[2px] border border-graphite/10 bg-white p-2">
      <div className="mb-1 text-xs font-medium text-ink60">
        העיצוב עם הגשרים שנוספו אחרי המעקב
        <span className="ms-2 text-rose-600">■ חלל של אות</span>
        <span className="ms-2 text-sky-500">■ עיטור</span>
        <span className="ms-2 text-emerald-500">■ גשר של המודל שהורחב</span>
      </div>
      <div className="relative w-full rounded bg-[#101114] p-2">
        <div
          className="w-full [&_svg]:w-full [&_svg]:fill-[#ffd43b] [&_svg_*]:fill-[#ffd43b]"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {/* שכבה שנייה, באותן קואורדינטות — הצבע הוא כל ההבדל בין "נוסף גשר"
            לבין "הגשר יושב במקום הנכון". */}
        <div
          className="absolute inset-0 p-2 [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: overlay }}
        />
      </div>
    </div>
  );
}

export function SvgCard({ title, svg, filename }: { title: string; svg: string; filename?: string }) {
  const [light, setLight] = useState(false);
  return (
    <div className="rounded-[2px] border border-graphite/10 bg-white p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink60">{title}</span>
        <span className="flex items-center gap-1">
          {filename && (
            <button
              type="button"
              onClick={() => downloadSvg(filename, svg)}
              className="rounded-[2px] border border-graphite/20 px-1.5 py-0.5 text-[11px] text-ink60 hover:bg-porcelain"
              title="הורדת הקובץ"
            >
              ⭳ SVG
            </button>
          )}
          <button
            type="button"
            onClick={() => setLight((l) => !l)}
            className="rounded-[2px] border border-graphite/20 px-1.5 py-0.5 text-[11px] text-ink60 hover:bg-porcelain"
          >
            {light ? "רקע כהה" : "רקע בהיר"}
          </button>
        </span>
      </div>
      <div
        className={`w-full rounded p-2 [&_svg]:w-full ${
          light
            ? "bg-white [&_svg]:fill-[#101114] [&_svg_*]:fill-[#101114]"
            : "bg-[#101114] [&_svg]:fill-[#ffd43b] [&_svg_*]:fill-[#ffd43b]"
        }`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
