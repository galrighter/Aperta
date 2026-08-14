"use client";

// מסע היצירה — handoff_design_flow/HANDOFF.md.
// מחובר למנוע האמיתי: יצירת עיצוב, גנרציה, ולידציה וגרסאות עוברים דרך ה-API,
// ולא דרך state מדומה. שמירת העיצובים נוספה מעבר ל-handoff (לבקשת גל).
import { useCallback, useEffect, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { FAB } from "@/lib/fabrication.config";
import { api, ClientApiError, DISCONNECTED_STAGE } from "@/lib/client/api";
import {
  clearMyDesigns, listMyDesigns, markMyDesignDone, mergeMyDesign, removeMyDesign, saveMyDesign,
  setMyDesignPreview,
  type SavedDesign,
} from "@/lib/client/myDesigns";
import { designCode } from "@/lib/designCode";
import { formatPhone } from "@/lib/phone";
import { isShareToken } from "@/lib/shareToken";
import { SITE } from "@/lib/site.config";
import type { Account } from "@/lib/client/types";
import { StepRail } from "@/components/create/ui";
import { ProductScreen } from "@/components/create/ProductScreen";
import { SizesScreen } from "@/components/create/SizesScreen";
import { BriefScreen } from "@/components/create/BriefScreen";
import { ProcessingScreen } from "@/components/create/ProcessingScreen";
import { ResultScreen } from "@/components/create/ResultScreen";
import { SummaryScreen } from "@/components/create/SummaryScreen";
import { CheckoutScreen } from "@/components/create/CheckoutScreen";
import { DoneScreen } from "@/components/create/DoneScreen";
import { SavedDesigns } from "@/components/create/SavedDesigns";
import { OpeningScreen } from "@/components/create/OpeningScreen";
import { AccountBar, AccountGate } from "@/components/create/AccountGate";
import { clearCreateState, popCreateState, stashCreateState } from "@/lib/client/pendingCreate";
import { popStoryHandoff } from "@/lib/client/storyHandoff";
import { story } from "@/i18n/story";
import { clearAddrDraft, loadAddrDraft, saveAddrDraft } from "@/lib/client/addrDraft";
import { clearFunnelDraft, loadFunnelDraft, saveFunnelDraft } from "@/lib/client/funnelDraft";
import { shrinkReferenceImage } from "@/lib/client/referenceImage";
import {
  beatPendingJob, clearPendingJob, setPendingJob,
} from "@/lib/client/pendingJob";
import { authConfigured, supabaseBrowser } from "@/lib/client/supabaseBrowser";
import {
  INITIAL, activeEntry, buildEditPrompt, buildPrompt, candidatesByGeneration,
  candidatesOf, circumferenceMm, entryDesignId, entryFromGeneration,
  canGenerate, countCuts, frameLengthMm, frameWidthMm, gapOf, invalidateDesign, mmLabel, mpToPreviewPath, priceOf,
  newOrderKey, railFor, railIndex, sizeReallyChanged, stripLengthMm, switchProduct, widthOf,
  type CreateState, type EditEntry, type Product, type Screen,
} from "@/components/create/model";

const d = he.design;

/** המסך הראשון של כל שלב בסרגל — לניווט מהסרגל. תלוי במסלול: ל-story סדר
 *  שלבים משלו (`STORY_RAIL`), ולכן גם יעדי ניווט משלו. */
const railTarget = (storyMode: boolean): Screen[] =>
  railFor(storyMode).map((r) => r.screens[0]);

/** ערך מהאחסון המקומי חוזר כמחרוזת — מאמתים אותו מול הקבוצה המותרת. */
function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * מה שאנחנו כותבים על רשומת היסטוריה.
 *
 * `idx` הוא העומק שלנו בתוך המשפך, והוא נוסף כדי שנדע **כמה** רשומות נצרכו
 * בלחיצת Back אחת. אנדרואיד מאחד לחיצות רצופות לקפיצה אחת (`popstate` יחיד עם
 * דלתא גדולה מאחת), ובלי המספר הזה אין דרך לדעת זאת מתוך האירוע.
 */
interface HistState {
  screen?: Screen;
  idx?: number;
}

/** העומק שאנחנו עומדים בו עכשיו. נשמר בצד כי `popstate` מדווח רק על היעד. */
let atIdx = 0;

const idxOf = (raw: unknown): number => {
  const n = (raw as HistState | null)?.idx;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

/**
 * רישום המסך על רשומת ההיסטוריה **הנוכחית** — בלי להוסיף רשומה.
 *
 * כל מסך שמוצג בלי `go` (הכניסה למשפך, חזרה מגוגל, פתיחה מכתובת) חייב לעבור
 * כאן: `popstate` מזהה לאן לחזור רק לפי `state.screen`, ורשומה שאין לה אחד
 * כזה היא לחיצת Back שמנווטת באמת אבל לא משנה כלום על המסך.
 */
function markScreen(screen: Screen, url?: string): void {
  if (typeof window === "undefined") return;
  // העומק נשאר של הרשומה שמוחלפת — סימון אינו תזוזה בהיסטוריה.
  atIdx = idxOf(window.history.state);
  const st: HistState = { screen, idx: atIdx };
  if (url === undefined) window.history.replaceState(st, "");
  else window.history.replaceState(st, "", url);
}

/** דחיפת רשומה חדשה למסך. כל דחיפה במשפך עוברת כאן, כדי שהעומק יישאר רציף. */
function pushHist(screen: Screen): void {
  if (typeof window === "undefined") return;
  atIdx = idxOf(window.history.state) + 1;
  window.history.pushState({ screen, idx: atIdx } satisfies HistState, "");
}

/**
 * דחיפת רשומה למסך שנקבע בלי `go` — פתיחת עיצוב שמור, לינק שיתוף.
 *
 * דחיפה ולא סימון: מתחת למסך שנפתח נשארת רשומת הכניסה, ולכן Back ממנו חוזר
 * לתחילת המשפך. סימון היה מוחק אותה, ואז Back מעיצוב שנפתח מהרשימה היה מקפיץ
 * מהאתר כולו.
 */
function pushScreen(screen: Screen): void {
  if (typeof window === "undefined") return;
  if ((window.history.state as HistState | null)?.screen === screen) return;
  pushHist(screen);
}

/**
 * גלילה לראש העמוד — **אנכית בלבד**, וזה כל העניין.
 *
 * `window.scrollTo(0, 0)` קובע גם את המיקום האופקי, ומעבר בין מסכים במשפך אינו
 * צריך לגעת בציר הזה מעולם. כל עוד העמוד נכנס בדיוק לרוחב החלון אין לזה ביטוי,
 * ולכן זה עבר בשקט — אבל ברגע שיש בכלל גלילה אופקית (דפדפן מוטמע שפורס לרוחב
 * שולחני — וקישור ממייל נפתח באחד כזה, אלמנט שגלש, הגדלת טקסט של המערכת) הקפיצה
 * הזו נוחתת על "אפס אופקי". בעמוד RTL זו לא נקודת ההתחלה: מנועים שונים אינם
 * מסכימים בכלל היכן יושב האפס הזה — כרום ופיירפוקס סופרים אותו מקצה התוכן
 * (הימני) ואילו WebKit ישן ו-WebView של אנדרואיד סופרים מהקצה השמאלי, כלומר מהצד
 * שאין בו תוכן. הקוד לא צריך להכריע בין המוסכמות; הוא צריך לא להיכנס לוויכוח.
 *
 * `scrollTo({ top })` נוגע רק בציר האנכי, והמיקום האופקי נשאר איפה שהמשתמשת
 * העמידה אותו.
 */
function scrollToTop(): void {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
}

export default function DesignPage() {
  const [s, setState] = useState<CreateState>(INITIAL);
  const [maxReached, setMaxReached] = useState(0);
  const [saved, setSaved] = useState<SavedDesign[]>([]);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  /**
   * העמוד נפתח מכתובת של עיצוב מסוים (`?resume=<id>`), והשליפה עוד באוויר.
   *
   * כל עוד זה דלוק המשפך אינו מוצג — במקומו `OpeningScreen`. הדגל הזה קיים
   * בנפרד מ-`resumingId` כי הם עונים על שתי שאלות שונות: `resumingId` אומר
   * *איזה* עיצוב נשלף עכשיו, וגם כשנלחץ מהרשימה — ושם החיווי הנכון הוא ספינר
   * על הכרטיס, לא השתלטות על העמוד. כאן אין מסך אחר להיות בו.
   *
   * המספר נשמר לצידו כדי שהמסך יוכל לומר *איזה* עיצוב נפתח — אותו מספר שכתוב
   * במייל. ידוע רק כשהעיצוב מוכר לדפדפן הזה; מקישור שנפתח במכשיר אחר הוא null.
   */
  const [opening, setOpening] = useState(false);
  const [openingCode, setOpeningCode] = useState<string | null>(null);
  /** נכנסו דרך "העיצובים שלי" בכותרת — הרשימה נפתחת מעצמה. */
  const [savedOpen, setSavedOpen] = useState(false);
  /**
   * מזהה ההרצה שרצה עכשיו. נשמר גם ב-localStorage (`pendingJob`) כדי שמי
   * שיצאה מהמסך תקבל חיווי כשהעיצוב מוכן; כאן הוא נדרש לפעימת הלב שאומרת
   * "יש מסך שמחכה", כדי שהחלון הקופץ לא יופיע על מסך שמראה את אותו דבר.
   */
  const jobRef = useRef<string | null>(null);

  /* ===== זיהוי =====
     החשבון נטען פעם אחת בכניסה; השער עצמו נפתח רק כשמבקשים ליצור. */
  const [account, setAccount] = useState<Account | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  /** נדלק כשהשער נפתח מתוך ניסיון ליצור — כדי להמשיך אוטומטית אחרי הכניסה. */
  const startAfterSignIn = useRef(false);
  /**
   * *מה* להמשיך אחרי הכניסה. שלושה מסלולים מגיעים לשער: יצירה מהתיאור, העתקת
   * עיצוב ששותף ("להזמין כזה"), ופתיחת עיצוב קיים. נשמר בנפרד מ-`startAfterSignIn`
   * ונוסע גם ב-stash של ה-OAuth — אחרת מי שנדרש להזדהות באמצע הזמנת עיצוב
   * משותף היה חוזר מגוגל היישר לתוך יצירה חדשה מאפס.
   */
  const pendingAction = useRef<"generate" | "adopt" | "resume">("generate");
  /** איזה עיצוב לפתוח אחרי הכניסה. המזהה בלבד — השאר נקרא מהאחסון המקומי,
   *  וכך זה שורד גם טעינת עמוד מחדש בדרך חזרה מגוגל. */
  const resumeTarget = useRef<string | null>(null);

  const set = useCallback((patch: Partial<CreateState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  /**
   * ה-set של מסך המידות. שינוי מידה **בפועל** על עיצוב קיים מבטל אותו — הגאומטריה
   * נחתכה למידה הישנה — ונועל חזרה את השלבים שקדימה, כדי שקפיצה בסרגל לא תוביל
   * לתוצאה ישנה שתוזמן במידה החדשה. שאר ה-set (למשל פתיחת מדריך המדידה) נשאר רגיל.
   */
  const setSizes = useCallback((patch: Partial<CreateState>) => {
    // story mode — כאן המידה נבחרת **אחרי** שיש תוצאה, ולכן היא אינה מבטלת
    // אותה: אין רוחב שנבחר ואין מאפיינים, ולכן שינוי מידה הוא קנה מידה אחיד
    // על אותה צורה בדיוק — מה שקורה במסגור מחדש (`applyStorySize`). ביטול
    // כאן היה מוחק את התרגום שהלקוחה כבר בחרה, בדיוק כשהיא מזמינה אותו.
    const invalidates = !s.story && s.designId !== null && sizeReallyChanged(s, patch);
    setState((prev) => (invalidates ? { ...prev, ...patch, ...invalidateDesign() } : { ...prev, ...patch }));
    // חוזרים לנעילת השלב אחרי המידה: משם ה"המשך" מייצר מחדש למידה החדשה.
    if (invalidates) setMaxReached(1);
  }, [s]);

  /**
   * המצב העדכני, לקריאה מתוך המשך שרץ **אחרי** שהמצב הוחלף.
   *
   * החזרה מגוגל טוענת את העמוד מחדש: אפקט אחד משחזר את המשפך מה-stash
   * (`setState(stash.state)`) וקורא מיד ל-`afterSignedIn`, שממשיך את היצירה
   * כשהחשבון חוזר מהשרת. `afterSignedIn` נתפס באותו רגע יחד עם ה-closure של
   * `startGeneration`, ובו `s` הוא עדיין `INITIAL` — כי `setState` טרם עברה
   * רינדור. כלומר היצירה שהמשיכה מעצמה בדקה טופס **ריק**, נפלה על
   * `canGenerate` והחזירה למסך הבריף: הלקוח נכנס, ראה את התיאור שלו שלם על
   * המסך, ונדרש ללחוץ "שליחה" שוב בלי שדבר יסביר למה.
   *
   * מסלול הקוד במייל לא סבל מזה (אין טעינה מחדש, ה-closure עדכני), ולכן הכשל
   * נראה כאילו הוא של גוגל בלבד. הרפרנס פותר את שניהם באותה דרך: מי שממשיך
   * פעולה קורא את המצב ברגע ההמשך, לא ברגע שבו נוצרה הפונקציה.
   *
   * נכתב באפקט ולא בגוף הרינדור — הוא רץ בסיום כל רינדור, הרבה לפני שהתשובה
   * של `/api/account` חוזרת מהרשת.
   */
  const stateRef = useRef(s);
  useEffect(() => {
    stateRef.current = s;
  });

  useEffect(() => setSaved(listMyDesigns()), []);

  /**
   * רשומת הכניסה מקבלת את המסך שהיא מציגה.
   *
   * בלעדיה היא נטענת עם `state` ריק, ואז Back ממסך המידות מנווט באמת — ולא
   * משנה כלום על המסך. לחיצה מתה, ורק הלחיצה שאחריה יוצאת מהאתר. גם רענון
   * נכנס לכאן: המצב בזיכרון חוזר ל-INITIAL בעוד הרשומה עדיין נושאת את המסך
   * שממנו רועננו. האפקטים שמשחזרים מצב (חזרה מגוגל, פתיחה מכתובת) מוגדרים
   * אחרי זה, ולכן רצים אחרי — וסימון משלהם גובר.
   */
  useEffect(() => {
    markScreen(INITIAL.screen);
  }, []);

  /* ===== הציור של כרטיס שהמכשיר הזה לא יצר =====
     ה-path נשמר מקומית רק אחרי גרסה שחזרה כאן. עיצוב שנמשך מהשרת (כניסה
     ממכשיר אחר, אחסון שנוקה, יצירה שהלקוחה יצאה ממנה באמצע) הגיע בלי ציור
     ובלי מספר חיתוכים — כלומר ריבוע ריק עם "0 חיתוכים". משלימים מהשרת, פעם
     אחת לעיצוב, ושומרים מקומית כדי שהחישוב לא יחזור בכל פתיחה. */
  const [previewsWanted, setPreviewsWanted] = useState(false);
  const previewTried = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!previewsWanted) return;
    // pending = עוד אין גרסה, ולכן אין מה לצייר. רשומה שיש לה ציור אבל אין לה
    // עדיין רשימת תוצאות נמשכת גם היא: היא נשמרה לפני שהכרטיס ידע להציג את כל
    // מה שהעיצוב הזה ייצר, ובלעדיה הוא ממשיך להראות תוצאה אחת מתוך שלוש.
    const missing = saved.filter(
      (x) => (!x.path || !x.results) && !x.pending && !previewTried.current.has(x.id),
    );
    if (missing.length === 0) return;
    // מסמנים הכול מראש: הריצה מעדכנת את `saved`, ובלי זה כל תשובה הייתה
    // מפעילה את האפקט מחדש על מה שכבר בדרך.
    for (const item of missing) previewTried.current.add(item.id);

    let alive = true;
    void (async () => {
      // בזה אחר זה: זו השלמה שקטה של תצוגה, ולא סיבה לפתוח שבע-עשרה בקשות
      // במקביל מטלפון.
      for (const item of missing) {
        if (!alive) return;
        try {
          const { preview, results } = await api.designPreview(item.id);
          if (!preview) continue;
          setMyDesignPreview(
            item.id,
            preview,
            results?.map((r) => ({
              versionId: r.versionId,
              versionNo: r.versionNo,
              path: r.path,
              cuts: r.cuts,
            })),
          );
          if (!alive) return;
          setSaved(listMyDesigns());
        } catch {
          // כרטיס בלי ציור עדיין פותח את העיצוב. אין מה להציג על זה שגיאה.
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [previewsWanted, saved]);

  /**
   * הבדיקה הראשונית "מי מחובר", כפרומיס — כדי שפעולה שיוצאת לדרך לפני שהיא
   * חזרה תוכל להמתין לה, במקום להסיק מ-`account === null` שאין חשבון.
   *
   * במסלול הרגיל ההבדל אינו קיים: בין הכניסה לעמוד לבין הלחיצה על "ליצור"
   * עוברים שלושה מסכים, והתשובה חזרה מזמן. במסלול הסיפור היצירה יוצאת לדרך
   * **בטעינת העמוד עצמה** — `/design?story=1` נכנס ישר להמתנה ומריץ — כלומר
   * תמיד לפני שהתשובה הגיעה. התוצאה: כל יצירה במסלול הזה פתחה את שער החשבון,
   * גם למי שמחוברת כבר, ומבחוץ זה נראה כאילו הכניסה לסיפור מוציאה אותך
   * מהחשבון ודורשת הרשמה מחדש בכל פעם.
   *
   * מתאפס ל-`null` ברגע שהתשובה חזרה: מכאן `account` הוא המקור היחיד, והמתנה
   * מאוחרת לפרומיס הזה הייתה מחזירה תשובה שקדמה ליציאה מהחשבון או להחלפת
   * משתמש — כלומר יצירה בשם מי שכבר יצא.
   */
  const accountProbe = useRef<Promise<Account | null> | null>(null);
  useEffect(() => {
    const probe = api
      .account()
      .then(({ account: a }) => a)
      // אין חשבון או שהבדיקה נכשלה — השער ייפתח בזמן היצירה ממילא.
      .catch(() => null);
    accountProbe.current = probe;
    void probe.then((a) => {
      setAccount(a);
      accountProbe.current = null;
    });
  }, []);

  /**
   * פרטי החשבון יורדים לטופס הכתובת.
   *
   * המייל כבר אומת בכניסה (קוד חד־פעמי / גוגל), ולבקש מהלקוחה להקליד אותו שוב
   * בסוף המשפך זה לבקש ממנה להמציא הזדמנות לטעות — מייל שגוי כאן פירושו אישור
   * הזמנה שלא מגיע. השדה נשאר רגיל וניתן לעריכה: יש מי שמזמינה לכתובת אחרת.
   *
   * **רק שדות ריקים.** הבדיקה חוזרת מהשרת אחרי כמה מאות מילישניות, ובזמן הזה
   * אפשר כבר להקליד; דריסה של מה שהוקלד היא בדיוק הבאג שקשה לשחזר.
   *
   * השם מושלם רק כשהוא שם. מסלול המייל יוצר פרופיל עם החלק שלפני ה-@, ואז
   * "שם מלא" היה מתמלא ב-`dana` — ערך שנראה מוכן ולכן לא מתוקן, ומגיע ככה
   * לתווית המשלוח.
   */
  useEffect(() => {
    if (!account) return;
    setState((prev) => {
      const patch: Partial<typeof prev.addr> = {};
      const local = account.email.split("@")[0];
      if (!prev.addr.email.trim() && account.email) patch.email = account.email;
      if (!prev.addr.name.trim() && account.name && account.name !== local) {
        patch.name = account.name;
      }
      if (!prev.addr.phone.trim() && account.phone) patch.phone = account.phone;
      // הכתובת מההזמנה הקודמת (0020). אותו כלל בדיוק: רק שדות ריקים.
      if (!prev.addr.street.trim() && account.street) patch.street = account.street;
      if (!prev.addr.city.trim() && account.city) patch.city = account.city;
      if (!prev.addr.zip.trim() && account.zip) patch.zip = account.zip;
      if (!Object.keys(patch).length) return prev;
      return { ...prev, addr: { ...prev.addr, ...patch } };
    });
  }, [account]);

  /**
   * הטיוטה שבדפדפן — מה שהוקלד עכשיו, לפני שהייתה הזמנה שתשמור אותו.
   *
   * נטענת פעם אחת בעלייה, ולפני שהחשבון חוזר מהשרת: היא הספציפית מבין השתיים,
   * ומה שהוקלד גובר על מה שנשמר בפעם הקודמת. הכתיבה חלה על כל שינוי בטופס —
   * זול, ומכסה גם את מי שסוגרת את הלשונית באמצע.
   */
  useEffect(() => {
    const draft = loadAddrDraft();
    if (!draft) return;
    setState((prev) => ({ ...prev, addr: { ...prev.addr, ...draft } }));
  }, []);

  useEffect(() => {
    saveAddrDraft(s.addr);
  }, [s.addr]);

  /**
   * טיוטת המשפך — המידות, המאפיינים, התיאור והכיתוב שהוקלדו עכשיו.
   *
   * נטענת פעם אחת בעלייה, ובכוונה **לפני** האפקטים של החזרה מגוגל ושל
   * הפרמטרים בכתובת (הם מוגדרים אחריה ולכן רצים אחריה): מה שהם קובעים —
   * מצב ששוחזר מה-stash, עיצוב שנפתח מקישור — גובר על הטיוטה.
   *
   * למה זה קיים: המשפך חי ב-state בזיכרון, ולכן יצירה שנכשלה לפני שנוצרה
   * רשומה בשרת — או סתם רענון — מחקה את כל מה שמולא. מי שמדדה, כיוונה וכתבה
   * איבדה הכול בדיוק כשמשהו אחר כבר השתבש.
   */
  useEffect(() => {
    const draft = loadFunnelDraft();
    if (!draft) return;
    setState((prev) => ({ ...prev, ...draft }));
    // מוצר כבר נבחר בטיוטה — הסרגל נפתח עד שלב העיצוב, כדי שאפשר יהיה לקפוץ
    // ישר לתיאור במקום ללחוץ שוב את כל הדרך.
    if (draft.product) setMaxReached((m) => Math.max(m, 2));
  }, []);

  useEffect(() => {
    saveFunnelDraft(s);
  }, [s]);

  const go = useCallback((screen: Screen) => {
    setState((prev) => {
      // כניסה להיסטוריה לכל מעבר מסך. כל שמונת המסכים חיים על כתובת אחת
      // ובמצב בזיכרון, ולכן בלי זה Back בנייד יוצא מ-`/design` לגמרי — כלומר
      // כתובת המשלוח, אישור התנאים וטקסט העריכה נעלמים ביחד. הכתובת עצמה לא
      // משתנה: מה שנדחף הוא רק המסך, כדי ש-`popstate` יידע לאן לחזור.
      //
      // בתוך ה-updater ולא לצידו: `screen` הקודם נקרא כאן מהמצב עצמו, כך
      // שהדחיפה לא תלויה ב-closure שיכול להיות ישן (אותה סיבה שבגללה `go`
      // חסר תלויות).
      if (prev.screen !== screen) pushHist(screen);
      return { ...prev, screen };
    });
    const i = railIndex(stateRef.current.story, screen);
    if (i >= 0) setMaxReached((m) => Math.max(m, i));
    scrollToTop();
  }, []);

  /**
   * מעבר מסך שמחליף את הרשומה הנוכחית במקום להוסיף אחת — היציאה ממסך ההמתנה.
   *
   * `processing` דוחף רשומה משלו (בלי זה Back באמצע הרצה נופל למסך המידות),
   * ואם התוצאה הייתה דוחפת רשומה נוספת מעליה, Back מהתוצאה היה נוחת דווקא על
   * רשומת ההמתנה — שאליה אנחנו מסרבים לחזור, כלומר עוד לחיצה מתה. ההחלפה
   * משאירה את המבנה שהיה תמיד: מתחת לתוצאה יושב הבריף.
   */
  const goReplacing = useCallback((screen: Screen) => {
    setState((prev) => {
      if (prev.screen !== screen) markScreen(screen);
      return { ...prev, screen };
    });
    const i = railIndex(stateRef.current.story, screen);
    if (i >= 0) setMaxReached((m) => Math.max(m, i));
    scrollToTop();
  }, []);

  /**
   * יציאה ממסך ההמתנה חזרה לעיצוב — נסיגה אמיתית ולא דחיפה.
   *
   * למסך ההמתנה יש רשומת היסטוריה משלו (היא זו שמחזיקה את הנעילה), ומתחתיה
   * יושב הבריף. דחיפת רשומת בריף שנייה מעליה הייתה הופכת את ה-Back הבא ללחיצה
   * מתה. `go` נשאר כנפילה-לאחור למקרה שאין רשומה כזו.
   */
  const leaveProcessing = useCallback(() => {
    if ((window.history.state as HistState | null)?.screen === "processing") {
      window.history.back();
    } else go("brief");
  }, [go]);

  /**
   * הרצת מנוע באוויר — יצירה ראשונה (מסך ההמתנה בלי שגיאה) או שינוי שנשלח
   * ממסך התוצאה. זה הזמן שבו המסע נעול: לא Back, לא סרגל שלבים.
   *
   * למה בכלל: העיצוב נוצר בשרת ועולה כסף. מי שחזרה אחורה באמצע ההמתנה נחתה
   * על מסך העיצוב עם התיאור שלה, לחצה "שלחו" שוב — וקיבלה הרצה שנייה על אותו
   * תיאור בדיוק: מספר עיצוב שני, ועוד יחידה מהמכסה היומית. הראשונה בינתיים
   * הסתיימה בשרת בלי שאיש רואה אותה.
   */
  // story mode — `resizing` הוא בקשה שרצה בשרת ומסתיימת במעבר מסך; יציאה
  // באמצעה הייתה מקפיצה את הלקוחה לסיכום מתוך מסך אחר לגמרי.
  const running = (s.screen === "processing" && !s.procError) || s.applying || s.resizing;
  /**
   * אותו דבר עבור המאזין — ובכוונה לא נגזר מהמצב.
   *
   * המאזין נרשם פעם אחת, ולכן `running` שנקרא ממנו היה קפוא על הרינדור
   * הראשון; אבל גם סנכרון באפקט לא היה נכון כאן. "חזרה לעיצוב" ממסך השגיאה
   * מנקה את השגיאה ורק אז נסוג, וברגע שבין השניים המצב הנגזר אומר "רצה" —
   * כלומר הנעילה הייתה דוחפת את הלקוחה בחזרה למסך שממנו ביקשה לצאת. הדגל
   * נדלק ונכבה סביב קריאת המנוע עצמה, ששם הוא נכון תמיד.
   */
  const runningRef = useRef(false);
  /** ניסו לצאת בזמן הרצה. ההודעה מוצגת רק כל עוד הנעילה בתוקף. */
  const [lockNotice, setLockNotice] = useState(false);
  useEffect(() => {
    if (!lockNotice) return;
    const t = setTimeout(() => setLockNotice(false), 8000);
    return () => clearTimeout(t);
  }, [lockNotice]);

  /**
   * Back של הדפדפן חוזר מסך אחד במשפך במקום לצאת ממנו.
   *
   * מסך שאינו בהיסטוריה שלנו (`state.screen` ריק) הוא הכניסה למשפך, ושם Back
   * *צריך* לצאת — לכן אין כאן `preventDefault` ואין דחיפה מחדש. מה שכן:
   * `processing` לא נכנס לרשימת היעדים החוקיים, כי חזרה אליו הייתה מציגה
   * ספינר של הרצה שכבר הסתיימה.
   */
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as HistState | null;
      const at = typeof st?.idx === "number" ? st.idx : null;

      // הרצה באוויר — המסע נעול. הדפדפן כבר ביצע את הניווט (popstate אינו
      // ניתן לביטול), ולכן "לא לזוז" פירושו לחזור **קדימה** אל הרשומה שממנה
      // יצאנו.
      //
      // קדימה ולא דחיפה מחדש, וזה ההבדל בין נעילה לבין שחיקה: דחיפה מוחקת את
      // כל מה שקדימה, ולכן לחיצה שאיחדה שתי רשומות (אנדרואיד עושה זאת כשלוחצים
      // מהר, ומדווח `popstate` אחד עם קפיצה של שתיים) החזירה רשומה אחת במקום
      // שתיים. כך ההיסטוריה של המשפך התקצרה בלחיצה — המסך שמתחת התחלף בכל
      // פעם, ואחרי מספיק לחיצות הלחיצה הבאה יצאה מהאתר יחד עם ההרצה שרצה.
      // `go` חוזר בדיוק לאותה רשומה בלי לגעת במבנה, כמה שלבים שלא נצרכו.
      if (runningRef.current) {
        const back = at === null ? 1 : atIdx - at;
        if (back > 0) window.history.go(back);
        setLockNotice(true);
        // ההודעה יושבת בתחתית המסך, וללא זה הדפדפן משחזר את הגלילה של הרשומה
        // שאליה קפצנו — כלומר הלחיצה נראית כמו קפיצה אקראית בתוך העמוד.
        scrollToTop();
        return;
      }
      if (at !== null) atIdx = at;
      const screen = st?.screen;
      if (!screen || screen === "processing") return;
      setState((prev) => (prev.screen === screen ? prev : { ...prev, screen }));
      scrollToTop();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** הרשומה המקומית של עיצוב. נכתבת פעמיים: פעם עם יצירת העיצוב (pending),
   *  ושוב עם כל גרסה שחוזרת. בלי הכתיבה הראשונה, כל הפרעה בין היצירה לתשובה
   *  מנתקת את הלקוחה מעיצוב שכבר קיים בשרת — וזה בדיוק מה שקרה. */
  const remember = useCallback((st: CreateState, entry: EditEntry | null) => {
    if (!st.designId) return;
    const path = entry ? mpToPreviewPath(entry.geometry?.material) : "";
    saveMyDesign({
      id: st.designId,
      serial: st.designSerial ?? undefined,
      name: `${st.product === "ring" ? he.ring : he.bracelet} ${Math.round(circumferenceMm(st))}`,
      product: st.product ?? "bracelet",
      circMm: Math.round(circumferenceMm(st)),
      widthMm: widthOf(st),
      cuts: entry ? countCuts(entry.svg) : 0,
      updatedAt: new Date().toISOString(),
      path: path && path.length < 40_000 ? path : undefined,
      lengthMm: entry?.lengthMm && entry.lengthMm > 0 ? entry.lengthMm : stripLengthMm(st),
      pending: entry ? undefined : true,
      brief: st.brief.trim() || undefined,
      lettering: st.lettering.trim() || undefined,
      symmetry: st.symmetry,
      density: st.density,
      feel: st.feel,
      fit: st.fit,
      attrsAuto: st.attrsAuto || undefined,
    });
    setSaved(listMyDesigns());
  }, []);

  /** רישום גרסה שחזרה מהמנוע + שמירה מקומית. */
  const pushEntry = useCallback(
    (st: CreateState, entry: EditEntry) => {
      const edits = [...st.edits, entry];
      setState((prev) => ({ ...prev, edits, activeEdit: edits.length - 1 }));
      remember(st, entry);
    },
    [remember],
  );

  /** עדכון שורה קיימת ביומן. משמש מעבר בין ההצעות של אותה הרצה, שבו השרת
   *  מעדכן את שורת הבחירה במקום להוסיף אחת — היומן חייב לשקף את אותו דבר. */
  const replaceEntry = useCallback(
    (st: CreateState, index: number, entry: EditEntry) => {
      const edits = st.edits.map((e, i) => (i === index ? entry : e));
      setState((prev) => ({ ...prev, edits, activeEdit: index }));
      remember(st, entry);
    },
    [remember],
  );

  /* ===== גאומטריה להדמיה המעורגלת =====
     ההדמיה בתלת-ממד צריכה את ה-material, וגרסאות שנשלפו מיומן הגרסאות (או
     מעיצוב שמור) מגיעות בלעדיו. משלימים אותו לפי דרישה מהוולידציה. */
  const geomTried = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (s.screen !== "result" || s.resultMode !== "render") return;
    const entry = activeEntry(s);
    if (!entry?.svg || entry.geometry || geomTried.current.has(entry.versionId)) return;
    geomTried.current.add(entry.versionId);

    api
      .validate({
        svg: entry.svg,
        productType: s.product ?? "bracelet",
        lengthMm: frameLengthMm(s, entry),
        widthMm: frameWidthMm(s, entry),
        thicknessMm: FAB.defaultThicknessMm,
      })
      .then(({ geometry }) => {
        if (!geometry) return;
        setState((prev) => ({
          ...prev,
          edits: prev.edits.map((e) =>
            e.versionId === entry.versionId && !e.geometry ? { ...e, geometry } : e,
          ),
        }));
      })
      .catch(() => {
        // נשארים עם התצוגה השטוחה — עדיף מלהפיל את המסך.
      });
  }, [s]);

  /* ===== יצירה ראשונה ===== */
  const startGeneration = useCallback(async (signedIn?: Account) => {
    // עד כאן אפשר להתקדם בלי להזדהות. מכאן והלאה נוצרת רשומה שצריכה בעלים,
    // ורצה הרצת מנוע שעולה כסף — ולכן זה הרגע שבו נפתח השער.
    //
    // ו-`null` אינו "אין חשבון" כל עוד הבדיקה באוויר: במסלול הסיפור היצירה
    // מתחילה בטעינת העמוד, לפני שהיא חזרה. ההמתנה כאן היא ההפרש בין שער
    // שנפתח למי שכבר מחוברת לבין מסך המתנה שממשיך כרגיל (ראו `accountProbe`).
    const who = signedIn ?? account ?? (await accountProbe.current);
    // המצב מהרפרנס ולא מה-closure: הקריאה שממשיכה אחרי כניסה לחשבון נתפסה לפני
    // שהמשפך שוחזר מה-stash. ראו `stateRef`.
    const cur = stateRef.current;
    if (!who) {
      startAfterSignIn.current = true;
      pendingAction.current = "generate";
      setGateError(null);
      setGateOpen(true);
      return;
    }

    // אין ממה לייצר. הכפתור חוסם את זה, אבל לכאן מגיעים גם אחרי כניסה לחשבון
    // (`startAfterSignIn`) — מסלול שלא עבר בכפתור מעולם. ב-AP-0074 הבקשה הגיעה
    // לשרת בלי תיאור ובלי תמונה, עם ברירות המחדל בלבד (`imageCount: 0`,
    // והפרומפט היה שורת המאפיינים לבדה), והלקוחה קיבלה אחרי המתנה עיצוב שלא
    // ביקשה — והוא נספר במכסה היומית שלה. חזרה למסך הבריף היא התשובה הנכונה:
    // מה שמילאה אבד, ולפחות היא רואה זאת מיד ולא אחרי דקה.
    if (!canGenerate(cur)) {
      go("brief");
      return;
    }

    // רשומת היסטוריה משלו למסך ההמתנה. היא זו שנדחפת בחזרה כשלוחצים Back
    // באמצע ההרצה, והיא זו שמוחלפת בתוצאה כשההרצה נגמרת — כך שמתחת לתוצאה
    // נשאר הבריף, בדיוק כמו לפני הנעילה. "נסו שוב" אינו דוחף עוד אחת: הוא
    // נלחץ ממסך ההמתנה עצמו.
    if (cur.screen !== "processing") pushHist("processing");
    runningRef.current = true;

    const st = {
      ...cur,
      screen: "processing" as Screen,
      procError: null,
      procErrorDetail: null,
      procErrorCode: null,
      procStage: null,
      // ההסבר "היצירה לא הושלמה" מיצה את עצמו — הנה היא רצה שוב.
      resumeIncomplete: false,
    };
    setState(st);
    setMaxReached((m) => Math.max(m, railIndex(st.story, "processing")));
    scrollToTop();

    /** העיצוב שההרצה הזו רצה עליו. נקרא גם מה-catch — ראו שם. */
    let ranOn: string | null = null;

    try {
      // "נסה שוב" חוזר לכאן. עיצוב שכבר נוצר ועוד אין לו גרסה הוא בדיוק
      // המקום שאליו היצירה אמורה לנחות — אחרת כל לחיצה מייצרת עיצוב נוסף.
      // לקוח שלחץ ארבע פעמים אחרי כשל השאיר ארבעה עיצובים ריקים ברשימה.
      let reuse = st.designId && st.edits.length === 0 ? st.designId : null;
      // אבל "אין גרסה" נבדק מול השרת, לא מול מה שהדפדפן זוכר: מספר עיצוב הוא
      // תוצאה אחת של המודל (החלטת גל, 10.8), וכשל מאוחר יכול להשאיר גרסה
      // שמורה בשרת בזמן שהמסך הציג שגיאה. מיחזור עיוור היה מדביק תמונה שנייה,
      // שונה, על אותו מספר — ומי שמזמינים לפי "עיצוב AP-0102" מזמינים אז שם
      // אחד לשתי צורות. עיצוב שכבר נושא תוצאה נשאר עם המספר שלה; הניסיון
      // הנוכחי מקבל עיצוב ומספר משלו.
      if (reuse) {
        try {
          const { versions } = await api.getDesign(reuse);
          if (versions.length > 0) reuse = null;
        } catch {
          // אי אפשר לברר — ממחזרים כמו קודם: עדיף הסיכון הנדיר של גרסה שנייה
          // על עיצוב מאשר עיצוב ריק חדש על כל כשל רשת חולף.
        }
      }

      // בלי profileId: הבעלות נקבעת בשרת לפי העוגייה של החשבון.
      const design = reuse
        ? { id: reuse, serial: st.designSerial }
        : (
            await api.createDesign({
              productType: st.product ?? "bracelet",
              name: `${st.product === "ring" ? he.ring : he.bracelet} · ${Math.round(circumferenceMm(st))}${d.mm}`,
            })
          ).design;
      // המידות נשלחות בכל מקרה: הן יכולות להשתנות בין ניסיון לניסיון.
      await api.patchDesign(design.id, {
        lengthMm: stripLengthMm(st),
        widthMm: widthOf(st),
        gapMm: gapOf(st),
      });

      ranOn = design.id;
      const withId = { ...st, designId: design.id, designSerial: design.serial ?? null };
      setState(withId);
      // נרשם עכשיו, לפני הגנרציה — כדי שהעיצוב יהיה בר-איתור גם אם היא נקטעת.
      remember(withId, null);

      // תמונת ההשראה מכווצת לגודל שהמודל מצייר בו לפני שהיא נכנסת לגוף
      // הבקשה. עד כאן היא נסעה גולמית — עד ~6.7MB בבסיס64 — על הקו של
      // הלקוחה, בזמן שמסך הטעינה כבר מסתובב, ובלי שאף פיקסל מהמשקל העודף
      // מגיע לתוצאה. ההמרה נכשלת בשקט אל המקור; ראה `referenceImage.ts`.
      // ("מוכן לחיתוך" אינו עובר כאן — שם הרזולוציה היא התוכן.)
      const referenceImages =
        st.image && st.imageRole !== "ready"
          ? [{ kind: "inspiration" as const, dataUrl: await shrinkReferenceImage(st.image.dataUrl) }]
          : [];

      // "קובץ מוכן לחיתוך" → וקטוריזציה ישירה; אחרת גנרציה מהתיאור.
      const res =
        st.imageRole === "ready" && st.image
          ? await api.vectorize({ designId: design.id, image: { dataUrl: st.image.dataUrl } })
          : await api.generate(
              {
                designId: design.id,
                // story mode — הסיפור נוסע **כמו שנכתב**. `buildPrompt` עוטף
                // אותו בשורת מוצר ובמאפייני העיצוב של המסלול הרגיל (סימטריה,
                // צפיפות, תחושה) — שלושה שהלקוחה כאן לא בחרה, ושסותרים סיפור
                // שמבקש משהו אחר. המסגור כולו יושב בפרומפט של המסלול
                // (lib/story/prompt.ts), ומה שהוא צריך במקום `[USER_STORY]`
                // הוא הסיפור בלבד.
                userPrompt: st.story ? st.brief.trim() : buildPrompt(st),
                // הכיתוב נשלח בשדה נפרד ולא בתוך הפרומפט: השרת חותך אותו
                // מהפונט ומוסר אותו למודל כתמונה, כדי שהאיות לא יהיה נתון
                // לפרשנות (docs/research/HEBREW_TEXT_HANDOFF.md).
                text: st.lettering.trim() || undefined,
                currentSvg: null,
                images: referenceImages,
                // story mode — הדגל היחיד שנוסע לשרת במסלול הפשוט. בכל מסלול
                // אחר הוא `undefined`, כלומר הבקשה זהה למה שהייתה.
                mode: st.story ? ("story" as const) : undefined,
                // ניסיון חוזר אחרי ניתוק: אותו מזהה, ולכן אותה הרצה על הקופסה.
                // מה שכבר רונדר ושולם נאסף במקום להיקנות שוב. `jobRef` שורד רק
                // כשל רשת/תפוגה — תשובה אמיתית של השרת מנקה אותו למטה, וקלט
                // שהשתנה מקבל ממילא הרצה חדשה (השרת גוזר גם מהבקשה).
                jobId: jobRef.current ?? undefined,
              },
              // מה שקורה בהמתנה. הערך שמעניין את המסך הוא `disconnected`:
              // הבקשה נקטעה וההמתנה עברה לשורת ה-job, וזו לא שגיאה אלא מצב.
              (stage) => setState((prev) => ({ ...prev, procStage: stage })),
              // רושמים את ההרצה לפני שהיא מסתיימת: זה מה שמאפשר לחלון "העיצוב
              // מוכן" למצוא אותה אם הלקוחה יצאה מהמסך באמצע.
              (jobId) => {
                jobRef.current = jobId;
                setPendingJob({ jobId, designId: design.id, first: true });
              },
            );

      clearPendingJob();
      jobRef.current = null;
      runningRef.current = false;
      // הצלחה מאפסת גם את רצף הכשלים — הכשל הבא, אם יהיה, הוא סיפור חדש.
      setState((prev) => ({ ...prev, procStage: null, procFailCount: 0 }));
      pushEntry(withId, entryFromGeneration(res, { region: null, text: "" }));
      goReplacing("result");
    } catch (e) {
      // ההרצה נגמרה — גם אם רע. מסך השגיאה הוא מסך שאפשר לצאת ממנו.
      runningRef.current = false;
      const apiErr = e instanceof ClientApiError ? e : null;
      // תשובה אמיתית של השרת סוגרת את ההרצה; כשל רשת/תפוגה **לא**. במקרה
      // השני ההרצה עשויה להמשיך בשרת ולהצליח, ואז החלון הקופץ הוא הדרך
      // היחידה של הלקוחה לדעת — ולכן הרשומה נשארת.
      if (apiErr && !["network", "truncated", "timeout"].includes(apiErr.code)) {
        clearPendingJob();
        jobRef.current = null;
      }
      // כשל שאינו תשובת שרת הוא חריגה בקוד הלקוחה, וההודעה שלה נכתבה למפתחים:
      // "TypeError: Cannot read properties of undefined" על המסך לא אומר ללקוחה
      // כלום, ויכול לגרור שם קובץ או פנימיות שאין להן מה לעשות שם. מה שנשאר
      // בשורה הטכנית הוא **סוג** החריגה בלבד — מספיק כדי להבדיל בצילום מסך בין
      // TypeError לבין תפוגה, בלי לדלוף את הנוסח. המלא הולך לקונסולה, שם מקומו.
      if (!apiErr) console.error("generation failed:", e);

      // **לפני שמכריזים על כשל — לשאול את השרת אם הוא בכלל קרה.**
      //
      // מה שנכשל כאן הוא החוט אל הדפדפן, ולא בהכרח ההרצה: אנדרואיד שזורק את
      // הלשונית מהזיכרון, רשת שנופלת, המתנה שפגה — כולם מגיעים לכאן בזמן
      // שהצינור בשרת ממשיך, מסיים ושומר את הגרסה. `pollJob` מכסה את המקרה
      // שבו הבקשה עצמה נקטעה, אבל לא את מה שקורה אחריו, ואז הלקוחה קיבלה
      // "היצירה נכשלה" על עיצוב מוכן — ומייל "העיצוב שלך מוכן" על אותו עיצוב
      // בדיוק, באותה דקה. שאלה אחת מכריעה את זה: יש גרסה, או שאין.
      if (ranOn) {
        try {
          const { design, versions } = await api.getDesign(ranOn);
          const last = versions[versions.length - 1];
          if (last) {
            clearPendingJob();
            jobRef.current = null;
            const withId = { ...st, designId: design.id, designSerial: design.serial ?? null };
            setState((prev) => ({ ...prev, procStage: null, procFailCount: 0 }));
            pushEntry(withId, {
              versionId: last.id,
              versionNo: last.version_no,
              lengthMm: Number(design.length_mm),
              region: null,
              text: "",
              svg: last.svg,
              report: last.validation_report,
              // הגאומטריה נחשבת בבקשה נפרדת, ומסך התוצאה משלים אותה לפי דרישה.
              geometry: null,
              candidates: candidatesOf(last, candidatesByGeneration(versions)),
              chosen: last.picked_index ?? undefined,
            });
            goReplacing("result");
            return;
          }
        } catch {
          // אי אפשר לברר. ממשיכים למסך השגיאה — כשאין ידיעה, הוא התשובה הנכונה.
        }
      }

      setState((prev) => ({
        ...prev,
        procError: apiErr?.message ?? he.errGeneric,
        procErrorDetail: apiErr
          ? `${apiErr.code} · ${apiErr.status}`
          : `client · ${(e as Error)?.name || "Error"}`,
        procErrorCode: apiErr?.code ?? null,
        // רצף הכשלים. מהכשל השני מסך השגיאה מפסיק להציע "נסו שוב" כתשובה
        // היחידה — ראו RECURRING_FAILURES ו-ProcessingScreen.
        procFailCount: prev.procFailCount + 1,
        // ההמתנה נגמרה, ולכן גם החיווי עליה. בלי זה "החיבור נקטע" היה נשאר
        // תלוי מעל מסך השגיאה שבא אחריו.
        procStage: null,
      }));
    }
  }, [account, go, goReplacing, pushEntry, remember]);

  /**
   * שליחת משוב ממסך השגיאה — אחרי ש"נסו שוב" נכשל גם הוא.
   *
   * המצב נקרא מהרפרנס ולא מה-closure, מאותה סיבה כמו ביצירה: ההודעה
   * והמזהה הטכני של הכשל **האחרון** הם מה שנשלח, לא אלה שהיו כשנוצרה הפונקציה.
   */
  const sendProcFeedback = useCallback(async (message: string) => {
    const cur = stateRef.current;
    const { mailed } = await api.feedback({
      designId: cur.designId ?? undefined,
      message: message.trim() || undefined,
      errorMessage: cur.procError ?? undefined,
      errorDetail: cur.procErrorDetail ?? undefined,
    });
    return { mailed };
  }, []);

  /* ===== "להזמין כזה" — עיצוב ששותף, במידה של מי שמזמין =====
     נכנסים לכאן במקום ל-`brief`: אין מה לתאר ואין מה לייצר, הדוגמה כבר קיימת.
     מה שכן חייב לקרות הוא מתיחה למידה שנבחרה עכשיו, והיא רצה בשרת (ראו
     `/api/shares/[token]/adopt`) כדי שהוולידציה תרוץ על מה שבאמת ייחתך. */
  const adoptShared = useCallback(async (signedIn?: Account) => {
    // כמו ביצירה: המסלול הזה ממשיך גם אחרי חזרה מגוגל, ואז ה-closure מקדים את
    // שחזור המשפך. בלי הרפרנס `fromShare` היה עדיין null והלחיצה נבלעה.
    const cur = stateRef.current;
    const token = cur.fromShare;
    if (!token) return;

    // אותו רגע בדיוק כמו ביצירה: כאן נוצרת רשומה שצריכה בעלים.
    const who = signedIn ?? account;
    if (!who) {
      startAfterSignIn.current = true;
      pendingAction.current = "adopt";
      setGateError(null);
      setGateOpen(true);
      return;
    }

    set({ adopting: true, adoptError: null });
    try {
      const res = await api.adoptShare(token, {
        lengthMm: stripLengthMm(cur),
        widthMm: widthOf(cur),
        gapMm: gapOf(cur),
      });
      const entry = entryFromGeneration(res, { region: null, text: "" });
      const next: CreateState = {
        ...cur,
        adopting: false,
        adoptError: null,
        designId: res.design.id,
        designSerial: res.design.serial ?? null,
        edits: [entry],
        activeEdit: 0,
        screen: "result",
      };
      setState(next);
      setMaxReached(3);
      remember(next, entry);
      scrollToTop();
    } catch (e) {
      // נשארים על מסך המידות: מידה אחרת עשויה לעבור, וזו הפעולה שיש למי
      // שנתקל בזה. `rescale_failed` הוא דחייה אמיתית ולא תקלה.
      const apiErr = e instanceof ClientApiError ? e : null;
      set({
        adopting: false,
        adoptError: apiErr?.code === "not_found" ? he.share.adoptGone : he.share.adoptFailed,
      });
    }
  }, [account, set, remember]);

  /* ===== פעימת לב: "יש מסך שמחכה ליצירה הזו" =====
     `DesignReadyWatch` (ב-layout) מציג חלון קופץ רק כשהפעימה מתיישנת. דגל
     בוליאני היה נשאר דלוק כשהלשונית נסגרת — כלומר בדיוק כשצריך להתריע. */
  const waiting = (s.screen === "processing" && !s.procError) || s.applying;
  useEffect(() => {
    if (!waiting) return;
    const beat = () => {
      if (jobRef.current) beatPendingJob(jobRef.current);
    };
    beat();
    const t = setInterval(beat, 4000);
    return () => clearInterval(t);
  }, [waiting]);

  /* ===== המשך עיצוב שמור =====
     `item` יכול להגיע גם מכתובת (`?resume=<id>`) ולא רק מהרשימה המקומית, ולכן
     כל מה שנדרש הוא המזהה: השאר משמש להשלמת מה שרק הדפדפן מכיר. */
  const resume = useCallback(
    async (item: Pick<SavedDesign, "id"> & Partial<SavedDesign>) => {
      const id = item.id;
      setResumingId(id);
      setResumeError(null);
      try {
        const { design, versions } = await api.getDesign(id);
        const last = versions[versions.length - 1];
        const ringP = design.product_type === "ring";
        const circP = Number(design.length_mm) + Number(design.gap_mm);
        const sizes = ringP
          ? { ringSize: String(Math.round(circP)), ringWidth: Number(design.width_mm) }
          : { circ: String(Math.round(circP)), braceletWidth: Number(design.width_mm) };

        // עיצוב שנוצר אך היצירה שלו נקטעה — מחזירים לטופס עם מה שהוזן, כדי
        // שאפשר יהיה פשוט לנסות שוב במקום להתחיל מאפס. עם הסבר: בלעדיו
        // הנחיתה על הטופס נראית כמו עיצוב שנעלם.
        if (!last) {
          setState({
            ...INITIAL,
            resumeIncomplete: true,
            screen: "brief",
            product: design.product_type,
            designId: design.id,
            designSerial: design.serial ?? null,
            ...sizes,
            brief: item.brief ?? "",
            lettering: item.lettering ?? "",
            symmetry: pick(item.symmetry, ["symmetric", "asymmetric"], INITIAL.symmetry),
            density: pick(item.density, ["low", "medium", "high"], INITIAL.density),
            feel: pick(item.feel, ["delicate", "balanced", "massive"], INITIAL.feel),
            fit: pick(item.fit, ["tight", "regular", "loose"], INITIAL.fit),
            attrsAuto: item.attrsAuto ?? INITIAL.attrsAuto,
          });
          setMaxReached(2);
          setResumingId(null);
          pushScreen("brief");
          scrollToTop();
          return;
        }

        // הגאומטריה של הגרסה האחרונה — לתצוגת התלת-ממד בלבד.
        //
        // **ולכן היא לא מפילה את הפתיחה.** זו בקשה נפרדת שמריצה חישוב כבד
        // ויכולה להיכשל בפני עצמה (מגבלת קצב, זמן CPU בקצה, רשת חולפת), וכל
        // כשל שלה הוצג כ"טעינת העיצוב נכשלה" — על עיצוב שקיים בשרת, מוכן
        // ומצויר. זה בדיוק המסך שקיבלה לקוחה שחזרה לעיצוב שלה מ"העיצובים
        // שלי" ומהקישור במייל, וזו הסיבה שסגירת הדפדפן "פתרה" את זה.
        //
        // בלי הגאומטריה נשארת הפריסה השטוחה — והאפקט של מסך התוצאה משלים
        // אותה לפי דרישה כשעוברים לתלת-ממד.
        const val = await api
          .validate({
            svg: last.svg,
            productType: design.product_type,
            lengthMm: Number(design.length_mm),
            widthMm: Number(design.width_mm),
            thicknessMm: Number(design.thickness_mm),
          })
          .catch(() => null);
        const byRun = candidatesByGeneration(versions);
        setState({
          ...INITIAL,
          screen: "result",
          product: design.product_type,
          designId: design.id,
          designSerial: design.serial ?? null,
          ...sizes,
          brief: item.brief ?? "",
          // ההצעות שמורות פעם אחת, על הגרסה שההרצה יצרה. גרסה שנוצרה מבחירה
          // נושאת רק את מזהה ההרצה, ומאתרת דרכו את אותן הצעות.
          edits: versions.map((v, i) => ({
            versionId: v.id,
            versionNo: v.version_no,
            lengthMm: Number(design.length_mm),
            region: null,
            text: i === 0 ? "" : (v.user_prompt ?? ""),
            svg: v.svg,
            report: v.validation_report,
            geometry: i === versions.length - 1 ? (val?.geometry ?? null) : null,
            // ההצעות חוזרות מהשרת (0012). קודם הן לא נשלפו כלל, ולכן כל פתיחה
            // של עיצוב שמור — וכל רענון — מחקה את רצועת החלופות.
            candidates: candidatesOf(v, byRun),
            chosen: v.picked_index ?? undefined,
          })),
          activeEdit: versions.length - 1,
        });
        setMaxReached(3);
        setResumingId(null);
        // הרשומה המקומית נכתבת כ-`pending` כבר עם יצירת העיצוב, ומי שמעדכן
        // אותה הוא המסך שקיבל את הגרסה. מי שאיבדה את החוט באמצע לא עברה שם,
        // ולכן הכרטיס ב"העיצובים שלי" המשיך לומר "טרם הושלם" על עיצוב שמוכן
        // — גם אחרי שנפתח מכאן. הנה הגרסה, מולנו: זה מכריע.
        markMyDesignDone(design.id);
        setSaved(listMyDesigns());
        pushScreen("result");
        scrollToTop();
      } catch (e) {
        setResumingId(null);
        const apiErr = e instanceof ClientApiError ? e : null;

        // הסשן פג, או שהקישור מהמייל נפתח בדפדפן שלא נכנס בו איש. זה **לא**
        // "טעינת העיצוב נכשלה": העיצוב שם ומחכה, וכל מה שדרוש הוא להזדהות.
        // עד כה שתי המצוקות קיבלו את אותו משפט אדום ואת אותו מסך מת — בלי שער,
        // בלי ניסיון חוזר, ובלי לרמוז שהכניסה היא הפתרון.
        if (apiErr?.code === "account_required") {
          resumeTarget.current = item.id;
          startAfterSignIn.current = true;
          pendingAction.current = "resume";
          setGateError(null);
          setGateOpen(true);
          // נכתב גם מתחת לרשימה: מי שסוגר את השער נשאר אחרת בלי שום הסבר למה
          // הלחיצה שלו לא עשתה כלום.
          setResumeError(d.savedNeedsSignIn);
          return;
        }

        setResumeError(
          apiErr?.code === "forbidden"
            ? d.savedOtherAccount
            : apiErr?.code === "not_found"
              ? d.savedGone
              : apiErr && ["network", "truncated"].includes(apiErr.code)
                ? he.errNetwork
                : d.savedLoadError,
        );
      }
    },
    [],
  );

  /* ===== כניסה / החלפת משתמש ===== */

  /** נקרא אחרי שהזהות כבר אומתה — קוד שאושר, או חזרה מגוגל דרך /auth/callback.
   *  אין כאן פרטי כניסה: הסשן כבר קיים, ואנחנו רק שואלים את השרת מי זה. */
  const afterSignedIn = useCallback(
    async (opts?: { resume?: boolean }) => {
      setGateBusy(true);
      setGateError(null);
      try {
        const { account: a } = await api.account();
        if (!a) throw new Error("no account");
        setAccount(a);
        // כניסה ממכשיר חדש: מושכים מהשרת את מה שכבר עוצב בחשבון הזה, אחרת
        // "העיצובים שלי" ריק דווקא למי שיש לו הכי הרבה מה להמשיך.
        try {
          const { designs } = await api.myDesigns();
          for (const dz of designs) {
            mergeMyDesign({
              id: dz.id,
              serial: dz.serial ?? undefined,
              name: dz.name,
              product: dz.product_type,
              circMm: Math.round(Number(dz.length_mm) + Number(dz.gap_mm)),
              widthMm: Number(dz.width_mm),
              cuts: 0,
              updatedAt: dz.updated_at,
              pending: dz.current_version_id ? undefined : true,
            });
          }
          setSaved(listMyDesigns());
        } catch {
          // הסנכרון הוא בונוס; כישלון שלו לא אמור לחסום את היצירה.
        }
        setGateBusy(false);
        setGateOpen(false);
        if (opts?.resume ?? startAfterSignIn.current) {
          startAfterSignIn.current = false;
          // לאן חוזרים — למסלול שממנו נפתח השער, ולא תמיד ליצירה.
          if (pendingAction.current === "adopt") void adoptShared(a);
          else if (pendingAction.current === "resume") {
            const id = resumeTarget.current;
            resumeTarget.current = null;
            // הפרטים שרק הדפדפן מכיר (תיאור, כיתוב) נקראים מחדש מהאחסון: אחרי
            // חזרה מגוגל העמוד נטען מאפס, ואין ריפרנס ששרד.
            if (id) void resume(listMyDesigns().find((x) => x.id === id) ?? { id });
          } else void startGeneration(a);
        }
      } catch (e) {
        setGateBusy(false);
        setGateError(e instanceof ClientApiError ? e.message : d.acctError);
      }
    },
    [startGeneration, adoptShared, resume],
  );

  /* ===== חזרה מגוגל =====
     היציאה ל-OAuth טוענת את העמוד מחדש, וכל מה שהלקוחה מילאה יושב ב-state
     בזיכרון. בלי השחזור הזה היא חוזרת מגוגל למסך ריק אחרי שכבר בחרה מוצר,
     מידות ותיאור — כשל שאינו נראה בשום טסט ומתגלה רק במסע אמיתי. */
  const returnHandled = useRef(false);
  useEffect(() => {
    if (returnHandled.current) return;
    returnHandled.current = true;

    const stash = popCreateState<{
      state: CreateState;
      maxReached: number;
      resume: boolean;
      action?: "generate" | "adopt" | "resume";
      resumeId?: string | null;
    }>();
    if (!stash) return;
    setState(stash.state);
    setMaxReached(stash.maxReached);
    // החזרה מגוגל טוענת את העמוד מחדש, כלומר ההיסטוריה שלנו נמחקה: הרשומה
    // היחידה שיש היא זו, והמסך שהיא מציגה הוא זה שהגיע מה-stash ולא מסך
    // הפתיחה. בלי הסימון Back כאן היה ניווט שלא משנה כלום.
    //
    // וכשהמסך המשוחזר הוא ההמתנה — רשומה אחת אינה מספיקה, מאותה סיבה בדיוק
    // שבגללה הכניסה למסלול הסיפור דוחפת שתיים (#219): הנעילה בזמן הרצה עובדת
    // מתוך `popstate`, שנורה רק על ניווט **בתוך** המסמך. על רשומה בודדת Back
    // יוצא מהעמוד לגמרי — אחורה אל דף ההזדהות של גוגל שממנו הגענו, שמחזיר
    // לשם ולא לכאן — בזמן שההרצה באוויר ובלי שהנעילה תראה את הלחיצה בכלל.
    //
    // למה זה נגע דווקא במסלול הסיפור: שם השער נפתח כשהמסך כבר `processing`,
    // ולכן גם המצב שנשמר ב-stash הוא `processing`, ו-`startGeneration`
    // שממשיך אחרי הכניסה אינו דוחף רשומה משלו (`cur.screen !== "processing"`).
    // במסלול הרגיל השער נפתח מהבריף, והדחיפה ההיא היא שסיפקה את הרשומה.
    if (stash.state.screen === "processing") {
      markScreen("brief");
      pushHist("processing");
    } else markScreen(stash.state.screen);
    // המסלול נוסע עם המצב: הרפרנס עצמו לא שורד טעינת עמוד מחדש.
    pendingAction.current = stash.action ?? "generate";
    resumeTarget.current = stash.resumeId ?? null;

    const url = new URL(window.location.href);
    const failed = url.searchParams.get("auth") === "failed";
    if (failed) {
      // מנקים את הסימון מהכתובת: רענון אחריו לא אמור להראות שוב שגיאה ישנה.
      url.searchParams.delete("auth");
      markScreen(stash.state.screen, `${url.pathname}${url.search}`);
      startAfterSignIn.current = stash.resume;
      setGateError(d.acctGoogleFailed);
      setGateOpen(true);
      return;
    }

    void afterSignedIn({ resume: stash.resume });
  }, [afterSignedIn]);

  /** החלפת משתמש. האינדקס המקומי נמחק — במכשיר משותף הוא של מי שנכנס עכשיו.
   *  העיצובים עצמם נשארים בשרת וחוזרים בכניסה עם אותו מייל. */
  const onSwitchAccount = useCallback(async () => {
    try {
      // גם בדפדפן וגם בשרת: ה-SDK מחזיק סשן משלו, ובלי היציאה שלו הכניסה
      // הבאה הייתה חוזרת לאותו משתמש בלי לשאול.
      if (authConfigured) await supabaseBrowser().auth.signOut();
    } catch {
      /* ממשיכים לניקוי בשרת בכל מקרה */
    }
    try {
      await api.signOut();
    } catch {
      /* גם אם הניקוי בשרת נכשל, ממשיכים לנקות מקומית */
    }
    clearCreateState();
    clearMyDesigns();
    // הכתובת השמורה יוצאת עם המשתמשת. מחשב משותף אינו מקרה קצה בסדנה, וכתובת
    // מלאה של אדם אחר בטופס היא בדיוק מה שאסור שהמסך הבא יראה.
    clearAddrDraft();
    // וגם מה שמולא במשפך — התיאור והמידות של מי שיצאה אינם של מי שתיכנס.
    clearFunnelDraft();
    setState((prev) => ({ ...prev, addr: INITIAL.addr }));
    setSaved([]);
    setAccount(null);
    setGateError(null);
    startAfterSignIn.current = false;
    setGateOpen(true);
  }, []);

  /* ===== שינוי ממוקד אזור ===== */
  const applyEdit = useCallback(async () => {
    const entry = activeEntry(s);
    if (!s.designId || !entry || !s.editReq.trim()) return;
    set({ applying: true, editError: null });
    // שינוי הוא הרצת מנוע לכל דבר — אותו זמן, אותה מכסה. מי שחוזרת אחורה
    // באמצעו נוחתת על מסך העיצוב, ומשם "שלחו" מייצר עיצוב חדש לגמרי.
    runningRef.current = true;
    try {
      const res = await api.generate(
        {
          designId: s.designId,
          userPrompt: buildEditPrompt(s),
          currentSvg: entry.svg,
          // איזו גרסה נמסרה למודל כבסיס. הלקוחה יכולה לחזור לגרסה ישנה ולערוך
          // אותה, ולכן זו לא בהכרח האחרונה — וביומן הבק־אופיס זה ההבדל בין
          // "עריכה של הקיים" לבין הדבר שאפשר להעמיד מול הפרומפט.
          baseVersionId: entry.versionId,
          images: [],
          // כמו ביצירה: ניסיון חוזר על אותו שינוי חוזר לאותה הרצה בקופסה.
          jobId: jobRef.current ?? undefined,
        },
        undefined,
        // `first: false` — עריכה אינה "העיצוב שלך מוכן". מה שכן נדרש הוא שכשל
        // שקרה אחרי שהלקוחה עזבה את המסך לא ייעלם בשקט.
        (jobId) => {
          jobRef.current = jobId;
          setPendingJob({ jobId, designId: s.designId!, first: false });
        },
      );
      clearPendingJob();
      jobRef.current = null;
      runningRef.current = false;
      // אותה בנייה כמו ביצירה הראשונה — כולל ההצעות. שינוי רץ באותו צינור
      // ומחזיר את אותו מספר הצעות; כאן הן נזרקו, ולכן אחרי כל שינוי נשארה
      // הצעה אחת על המסך והשאר הופיעו רק אחרי רענון.
      pushEntry(s, entryFromGeneration(res, { region: s.region, text: s.editReq.trim() }));
      set({ applying: false, editReq: "" });
      // התוצאה מתחלפת בראש העמוד, והלקוחה עומדת בתיבת הבקשה בתחתיתו.
      scrollToTop();
    } catch (e) {
      runningRef.current = false;
      // בליעה שקטה: הכפתור חזר מ"מחיל…" ל"החלת שינוי" ושום דבר אחר לא זז.
      const apiErr = e instanceof ClientApiError ? e : null;
      set({ applying: false, editError: apiErr?.message ?? d.editFailed });
    }
  }, [s, set, pushEntry]);

  /* ===== בחירת הצעה אחרת מאותה יצירה ===== */
  const chooseCandidate = useCallback(
    async (index: number, svg: string) => {
      const entry = activeEntry(s);
      // ההשוואה היא על האינדקס. קודם היא הייתה על ה-SVG, וזו מחרוזת אחרת מזו
      // שנשמרה בגרסה (השרת שומר canonicalSvg), כך שהיא לא זיהתה כלום.
      if (!s.designId || !entry || (entry.chosen ?? 0) === index) return;
      set({ applying: true, chooseError: null });
      // קצר יותר משינוי, אבל אותה נעילה בדיוק: המסך אומר "אי אפשר לזוז", וזה
      // חייב להיות נכון גם ללחצן האחורה ולא רק לכפתורים שמואפרים.
      runningRef.current = true;
      try {
        // העיצוב של הגרסה המוצגת: בחירת הצעה על גרסת-עריכה מעדכנת את הדוגמה
        // שלה (`AP-0085.2`), לא את עיצוב-האב של המשפך.
        // story mode — ההצעה נמסגרת למידות של עצמה, כי הרוחב במסלול הזה נגזר
        // מהעיצוב ולא נבחר. בכל מסלול אחר הפרמטר ריק והבקשה זהה לקודמתה.
        const res = await api.chooseCandidate(
          entryDesignId(s, entry)!, svg, index, entry.versionId,
          s.story ? ("story" as const) : undefined,
        );
        const next: EditEntry = {
          ...entryFromGeneration(res, { region: null, text: "" }),
          // אותן הצעות ממשיכות להיות זמינות אחרי הבחירה — הבחירה עצמה אינה
          // הרצה, והתשובה שלה לא נושאת אותן. וגם העיצוב של הגרסה נשאר שלה:
          // תשובת הבחירה לא נושאת אותו, והחלפת הצעה אינה מחליפה עיצוב.
          candidates: entry.candidates,
          chosen: index,
          designId: entry.designId,
          designCode: entry.designCode,
        };
        // בחירה בתוך אותה הרצה מעדכנת שורה קיימת ולא מוסיפה — והשרת מודיע על
        // כך בכך שהוא מחזיר את **אותו** מזהה גרסה. אין צורך בשדה נוסף בתשובה,
        // והתנהגות שרת ישן (מזהה חדש בכל פעם) ממשיכה לעבוד בלי שינוי.
        if (res.version.id === entry.versionId) replaceEntry(s, s.activeEdit, next);
        else pushEntry(s, next);
        runningRef.current = false;
        set({ applying: false });
      } catch (e) {
        runningRef.current = false;
        // בליעה שקטה נראתה בדיוק כמו כפתור מת: לחיצה, שום שינוי, שום הסבר.
        const apiErr = e instanceof ClientApiError ? e : null;
        set({ applying: false, chooseError: apiErr?.message ?? he.errGeneric });
      }
    },
    [s, set, pushEntry, replaceEntry],
  );

  /* ===== story mode — המידה, אחרי שיש מה להזמין =====
     במסלול הפשוט המידה אינה נשאלת בכניסה אלא בדרך להזמנה: הלקוחה מספרת,
     מקבלת תרגומים, בוחרת — ורק אז נמדדת. הסיבה היא לא נוחות אלא סדר נכון:
     מדידה של פרק יד לפני שראית צורה אחת היא שאלה שאין לה עדיין הקשר, והיא
     הדבר היחיד שעמד בין הסיפור לתשובה.

     **מה זה דורש מהצינור.** האורך הוא מה שנחתך, והוא נגזר מההיקף — כלומר
     הגרסה שנשמרה נמסגרה לאורך ברירת המחדל, ואי אפשר להזמין אותה כך. לכן
     בסיום מסך המידות העיצוב **ממוסגר מחדש** לאורך שנמדד: אותו SVG בדיוק,
     דרך אותו מסלול שבחירת הצעה עוברת בו (`/choose` במצב story), שגוזר את
     הרוחב מהיחס שצויר ומחזיר קנה מידה אחיד. זו הגדלה/הקטנה של אותה צורה,
     לא יצירה חדשה ולא מתיחה בציר אחד — ולכן `setSizes` גם אינו מבטל כאן את
     העיצוב כפי שהוא עושה במסלול הרגיל.

     כשהאורך כבר שווה למה שנמדד (הלקוחה השאירה את הפריסט הבינוני) אין מה
     למסגר, ועוברים ישר לסיכום. */
  const applyStorySize = useCallback(async () => {
    const entry = activeEntry(s);
    const designId = entryDesignId(s, entry);
    const lengthMm = stripLengthMm(s);
    // אין גרסה למסגר (כשל שקדם לכאן): המידה נשמרה, וההזמנה תיעצר בסיכום.
    if (!designId || !entry?.svg || !(lengthMm > 0)) {
      go("summary");
      return;
    }
    if (Math.abs(frameLengthMm(s, entry) - lengthMm) < 0.05) {
      go("summary");
      return;
    }

    set({ resizing: true, chooseError: null });
    // אותה נעילה של כל פעולה שרצה בשרת: הסרגל ו-Back אינם דרך לצאת באמצע.
    runningRef.current = true;
    try {
      await api.patchDesign(designId, { lengthMm, gapMm: gapOf(s) });
      // `mode: "story"` הוא מה שגוזר את הרוחב מהיחס שצויר במקום למתוח לרוחב
      // שהוזמן — כלומר בדיוק ההתנהגות שהמסלול הזה בנוי עליה.
      // `chosen ?? 0` ולא `chosen`: ההצעה שלא נגעו בה היא הראשונה (כך גם
      // `chooseCandidate` משווה), והמספר הזה הוא מה שהופך את השורה החדשה
      // לשורת בחירה — כלומר מידה שנייה תעדכן אותה במקום להוסיף עוד אחת.
      const res = await api.chooseCandidate(
        designId, entry.svg, entry.chosen ?? 0, entry.versionId, "story",
      );
      const next: EditEntry = {
        ...entryFromGeneration(res, { region: null, text: "" }),
        candidates: entry.candidates,
        chosen: entry.chosen,
        designId: entry.designId,
        designCode: entry.designCode,
      };
      const index = s.activeEdit >= 0 ? s.activeEdit : s.edits.length - 1;
      if (res.version.id === entry.versionId) replaceEntry(s, index, next);
      else pushEntry(s, next);
      runningRef.current = false;
      set({ resizing: false });
      go("summary");
    } catch (e) {
      // נשארים על מסך המידות: מידה אחרת עשויה לעבור, וזו הפעולה שיש למי
      // שנתקלת בזה. מעבר לסיכום היה מזמין את הפריט באורך הלא נכון.
      runningRef.current = false;
      const apiErr = e instanceof ClientApiError ? e : null;
      set({ resizing: false, chooseError: apiErr?.message ?? he.errGeneric });
    }
  }, [s, set, go, pushEntry, replaceEntry]);

  /* ===== כניסה עם כתובת =====
     `?resume=<id>` — פתיחת עיצוב מסוים: מהחלון "העיצוב שלך מוכן", ומקישור
     בבק־אופיס. `?designs=1` — כניסה דרך "העיצובים שלי" בכותרת.
     `?signin=1` — כניסה דרך "כניסה" בכותרת: השער נפתח מעצמו ביצירה, אבל מי
     שלחץ במפורש "כניסה" ביקש להזדהות **עכשיו**, ובלי זה הוא נוחת על מסך בחירת
     המוצר בלי שום סימן שמשהו קרה.
     נקרא מ-`window.location` ולא מ-`useSearchParams` כדי לא לחייב את העמוד
     כולו ב-Suspense; שלושת הפרמטרים נכנסים בטעינה מלאה. */
  const urlHandled = useRef(false);
  /** story mode — המסירה נקלטה, והיצירה ממתינה לרינדור שבו המצב כבר עודכן. */
  const storyStart = useRef(false);
  useEffect(() => {
    if (urlHandled.current) return;
    urlHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    const wantsDesigns = params.get("designs");
    const wantsSignIn = params.get("signin");
    const shareToken = params.get("from");
    const fromStory = params.get("story");
    if (!resumeId && !wantsDesigns && !wantsSignIn && !shareToken && !fromStory) return;

    /* story mode — הגעה מהמסלול הפשוט (`/story/create`).
       המוצר והסיפור כבר נמסרו (lib/client/storyHandoff), ואין על מה לעצור:
       נכנסים ישר ליצירה. **המידה אינה נמסרת כאן** — היא נשאלת אחרי התוצאה,
       בדרך להזמנה, ועד אז המסע עובד עם ברירת המחדל של המערכת (`INITIAL`,
       הפריסט הבינוני). מה שממשיך מכאן הוא המסע הקיים, מילה במילה — כולל שער
       החשבון, ההתאוששות מניתוק וההזמנה. */
    if (fromStory) {
      const handoff = popStoryHandoff();
      // מסירה שלא נמצאה (רענון, כניסה ישירה לכתובת) אינה שגיאה — פשוט ממשיכים
      // כמסע רגיל מהתחלה, בלי שום התנהגות מיוחדת.
      if (handoff) {
        setState((prev) => ({
          ...prev,
          story: true,
          product: handoff.product,
          brief: handoff.story,
          screen: "processing",
        }));
        setMaxReached(railIndex(true, "processing"));
        storyStart.current = true;
        /* **שתי רשומות ולא אחת, וזה לא קוסמטי.** הנעילה בזמן הרצה עובדת מתוך
           `popstate` — היא מחזירה קדימה את מי שלחצה Back (#217). `popstate`
           נורה רק על ניווט **בתוך** המסמך, ולכן היא דורשת שתהיה רשומה אחת
           לפחות מתחת למסך ההמתנה. במסלול הרגיל תמיד יש — מוצר, מידות, תיאור.
           כאן המסע נכנס ישר להמתנה, ובלי הרשומה שמתחת לחיצת Back הייתה יוצאת
           מהעמוד לגמרי בזמן שההרצה באוויר, בלי שהנעילה תראה אותה בכלל.

           הרשומה שמתחת היא `brief` ולא מסך הפתיחה: התיאור כבר מולא בסיפור
           שנמסר, וזה גם המסך שאליו Back מהתוצאה אמור לנחות — עם הסיפור בתיבה
           ועם הדרך חזרה לתוצאה. `markScreen` + `pushHist` שומרים על רציפות
           העומק (0 ואז 1), בדיוק כמו כל דחיפה אחרת במשפך. */
        markScreen("brief", window.location.pathname);
        pushHist("processing");
        return;
      }
      // מסירה שלא נמצאה: רשומת כניסה רגילה, בלי שום התנהגות מיוחדת.
      markScreen(INITIAL.screen, window.location.pathname);
      return;
    }

    // ניקוי הכתובת: רענון אחרי שהעיצוב נפתח לא אמור לפתוח אותו שוב מאפס.
    // הרשומה נשארת מסומנת במסך הפתיחה — מה שנפתח מכאן (שיתוף, עיצוב שמור)
    // דוחף רשומה משלו מעליה, כך ש-Back ממנו חוזר למשפך ולא קופץ מהאתר.
    markScreen(INITIAL.screen, window.location.pathname);

    if (shareToken) {
      // מחרוזת שאינה טוקן כלל אינה מגיעה לשרת — אבל היא **כן** חייבת לעצור
      // כאן. בלי ה-return הזה לינק פגום היה נופל להמשך הפונקציה ופותח את
      // מגירת "העיצובים שלי", שאין לה שום קשר למה שנלחץ.
      if (!isShareToken(shareToken)) {
        setState((prev) => ({ ...prev, adoptError: he.share.adoptGone }));
        return;
      }
      // המסע נפתח על המידות ולא על בחירת המוצר: המוצר כבר נקבע בעיצוב
      // ששותף, והמידה היא הדבר היחיד שחייב להיות של מי שמזמין עכשיו.
      // הרוחב **כן** מגיע מהשיתוף — הוא חלק מאיך שהפריט נראה, לא מדידה של גוף.
      void api
        .share(shareToken)
        .then((sh) => {
          setState((prev) => ({
            ...prev,
            screen: "sizes",
            product: sh.productType,
            fromShare: sh.token,
            fromShareSerial: sh.serial,
            ...(sh.productType === "ring"
              ? { ringWidth: sh.widthMm }
              : { braceletWidth: sh.widthMm }),
          }));
          setMaxReached(1);
          pushScreen("sizes");
        })
        .catch(() => {
          // לינק מבוטל או שגוי: נשארים במסע רגיל מהתחלה, עם הסבר. עדיף
          // ממסך בחירת מוצר שלא מסביר לאן נעלם העיצוב שנלחץ.
          setState((prev) => ({ ...prev, adoptError: he.share.adoptGone }));
        });
      return;
    }

    if (resumeId) {
      const known = listMyDesigns().find((x) => x.id === resumeId);
      /* מסך הפתיחה במקום המשפך, עד שהשליפה חוזרת.
         מה שהיה כאן: העמוד נטען, הציג את מסך בחירת המוצר — "מה נעצב?", שני
         מוצרים, כפתורים חיים — וכמה שניות אחר כך התחלף בעיצוב. מי שלחצה
         מהמייל לעיצוב מסוים קיבלה תחילת מסע חדש כתשובה, ומי שהספיקה לגעת בו
         בשניות האלה שינתה את המצב שהעיצוב הנשלף נוחת עליו.

         `finally` ולא `then`: כל סיום מוריד את המסך — הצלחה, שגיאה, וגם
         `account_required` שפותח את שער החשבון. מסך המתנה שנשאר תלוי מעל שער
         שמבקש להזדהות הוא בדיוק סוג התקיעה שהמסך הזה בא למנוע. `resume` אינו
         זורק (הכול עטוף שם ב-try/catch), אבל זו לא סיבה להישען על זה. */
      setOpeningCode(designCode(known?.serial ?? null));
      setOpening(true);
      void resume(known ?? { id: resumeId }).finally(() => setOpening(false));
      return;
    }
    if (wantsSignIn) {
      // בודקים מי מחובר ולא מסתמכים על `account` — הבדיקה שלו רצה במקביל
      // ועדיין `null` כאן, ו-null בשלב הזה אומר "עוד לא ידוע", לא "לא מחובר".
      // למי שכבר מחובר (לשונית ישנה, כפתור "אחורה") אין מה להראות: הכותרת
      // תציג את שמו במקום "כניסה", וזו התשובה.
      api
        .account()
        .then(({ account: a }) => {
          if (a) {
            setAccount(a);
            return;
          }
          startAfterSignIn.current = false;
          setGateError(null);
          setGateOpen(true);
        })
        .catch(() => {
          // כשל בבדיקה אינו "מחובר" — עדיף לפתוח שער מיותר מלבלוע לחיצה.
          startAfterSignIn.current = false;
          setGateError(null);
          setGateOpen(true);
        });
      return;
    }
    setSavedOpen(true);
  }, [resume]);

  /* ===== story mode — הרצת היצירה אחרי שהמסירה נכנסה למצב =====
     לא מתוך האפקט שקלט אותה: `startGeneration` קורא את המצב מ-`stateRef`, והוא
     מתעדכן רק בסיום הרינדור הבא (ראו ההערה על `stateRef`). קריאה מיידית הייתה
     יוצאת עם `brief` ריק, נופלת על `canGenerate` ומחזירה את הלקוחה למסך תיאור
     שהיא מעולם לא ביקשה לראות — בדיוק הכשל שתועד ב-AP-0074. */
  useEffect(() => {
    if (!storyStart.current) return;
    if (s.screen !== "processing" || runningRef.current) return;
    storyStart.current = false;
    void startGeneration();
  }, [s.screen, startGeneration]);

  /* ===== story mode — הרוחב שנגזר חוזר אל המצב =====
     במסלול הפשוט הרוחב אינו נבחר אלא נמדד מהעיצוב שחזר, ולכן הערך שבמצב
     (`braceletWidth`/`ringWidth`) הוא רק העוגן הנומינלי שנשלח לתכנון. מרגע
     שיש גרסה, מקור האמת הוא ה-viewBox שלה — וכל מי שקורא רוחב חייב לקרוא את
     אותו מספר.

     **את מה זה משרת.** לא את המחיר — הוא קבוע למוצר ואינו תלוי ברוחב בכלל
     (lib/pricing.ts). שני דברים אחרים כן קוראים את המצב:

     - **הרשומה המקומית.** `remember` שומר `widthMm: widthOf(st)` בכרטיס
       ב"העיצובים שלי". בלי הסנכרון הכרטיס מספר על פס של 18 מ"מ בזמן שמה
       שנשמר הוא 32.
     - **תוספת הנוחות שבתוך האורך.** `stripLengthMm` נגזר גם מהרוחב
       (`widthComfortAllowanceMm`), ובטבעת הוא עולה במדרגות — 6 מ"מ ו-12 מ"מ
       אינם מקבלים את אותה תוספת. יצירה נוספת על אותו סיפור צריכה לצאת עם
       התוספת של הפריט שנוצר, לא של העוגן שאיתו נכנסנו.

     מעוגל לספרה אחת — בדיוק המספר שההזמנה שולחת — כדי שכל מי שקורא רוחב יקרא
     את אותו מספר.

     `set` ולא `setSizes`: זו קריאה של מה שכבר נוצר, לא מידה חדשה שהוזנה.
     `setSizes` היה מבטל את העיצוב שממנו נקרא הרוחב (`SIZE_KEYS`). */
  useEffect(() => {
    if (!s.story) return;
    const entry = activeEntry(s);
    if (!entry?.svg) return;
    const w = Math.round(frameWidthMm(s, entry) * 10) / 10;
    if (!(w > 0) || Math.abs(widthOf(s) - w) < 0.05) return;
    set(s.product === "ring" ? { ringWidth: w } : { braceletWidth: w });
  }, [s, set]);

  /* ===== שליחת ההזמנה ===== */
  const submitOrder = useCallback(async () => {
    // המפתח של ניסיון השליחה. נוצר פעם אחת ונשמר במצב: ניסיון שני אחרי רשת
    // שנתקעה נושא אותו מפתח, והשרת מחזיר את ההזמנה שכבר נשמרה במקום לפתוח
    // שנייה. **לפני** ה-await, כי שני קליקים מהירים הם שני מסלולים.
    const orderKey = s.orderKey ?? newOrderKey();
    set({ sending: true, sendError: null, sendMailto: null, orderKey });
    const p = priceOf(s);
    const entry = activeEntry(s);
    // מה שמוזמן הוא הגרסה שעל המסך — והעיצוב **שלה**: גרסת-עריכה יושבת על
    // דוגמה ממוספרת (`AP-0085.2`), והזמנה שמצביעה על עיצוב-האב הייתה מזמינה
    // צורה אחרת מזו שאושרה.
    const orderedDesignId = entryDesignId(s, entry);
    const orderedCode = entry?.designCode ?? designCode(s.designSerial);
    // הסיכום הזה משמש **רק** את מסלול הגיבוי ב-mailto. מה שנשמר ונשלח במסלול
    // התקין נבנה בשרת מהשורה שנכתבה (src/lib/orderSummary.ts) — טקסט שהדפדפן
    // מנסח הוא ניסוח, לא נתונים.
    const lines = [
      `מוצר: ${s.product === "ring" ? d.ringName : d.braceletName}`,
      `היקף: ${Math.round(circumferenceMm(s))} ${d.mm} · רוחב: ${mmLabel(frameWidthMm(s, entry))} ${d.mm}`,
      s.product === "ring" ? "" : `ישיבה: ${d.fits[s.fit]}`,
      `חיתוכים: ${countCuts(entry?.svg ?? null)}`,
      `מספר עיצוב: ${orderedCode ?? "—"}`,
      `מזהה עיצוב: ${orderedDesignId ?? "—"}`,
      `סה"כ: ${d.ils}${p.total}`,
      "",
      `כתובת: ${s.addr.street}, ${s.addr.city}${s.addr.zip ? ` ${s.addr.zip}` : ""}`,
      s.lettering.trim() ? `כיתוב על התכשיט: ${s.lettering.trim()}` : "",
      s.brief.trim() ? `תיאור הלקוחה: ${s.brief.trim()}` : "",
    ].filter(Boolean);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          designId: orderedDesignId,
          // הגרסה שהיא רואה על המסך ברגע ההזמנה — לא "האחרונה שנוצרה". אחרי
          // ההזמנה אפשר להמשיך לערוך, ומה שנחתך חייב להיות מה שהיא אישרה.
          versionId: entry?.versionId ?? null,
          idempotencyKey: orderKey,
          termsAccepted: s.terms,
          marketingOptIn: s.marketing,
          // הסכום שעל המסך, לבדיקת התאמה מול מה שהשרת מחשב. פער פירושו מסך
          // ישן, וההזמנה נעצרת במקום להישמר בסכום שהלקוחה לא ראתה.
          displayedTotal: p.total,
          // מלכודת הבוטים. אצל אדם היא תמיד ריקה — השדה מוסתר מהעין ומהמקלדת.
          company: s.company,
          name: s.addr.name.trim(),
          email: s.addr.email.trim(),
          // צורה אחת לכל דרכי ההקלדה: כך `tel:` בבק־אופיס עובד, וכך אותה
          // לקוחה אינה מופיעה כשתי רשומות שאי אפשר להצליב.
          phone: formatPhone(s.addr.phone),
          street: s.addr.street.trim(),
          city: s.addr.city.trim(),
          zip: s.addr.zip.trim(),
          productType: s.product ?? "bracelet",
          circumferenceMm: Math.round(circumferenceMm(s) * 10) / 10,
          widthMm: Math.round(frameWidthMm(s, entry) * 10) / 10,
          fit: s.product === "ring" ? undefined : s.fit,
          // המחיר עצמו מחושב בשרת מאותה פונקציה, והקלט היחיד שלו הוא המוצר:
          // מאז המחיר הקבוע (lib/pricing.ts) הרוחב והצפיפות אינם מזיזים אותו,
          // ולכן הצפיפות כבר לא נשלחת — היא לא נשמרה על ההזמנה מעולם.
          cuts: countCuts(entry?.svg ?? null),
          // הכיתוב נוסע בתוך שדה התיאור ולא בעמודה משלו: הוא כבר חתוך
          // בגאומטריה שהסדנה מקבלת, ומה שנחוץ כאן הוא שמי שקורא את ההזמנה
          // יראה במילים מה אמור להיות כתוב — ויוכל להשוות.
          brief: [
            s.lettering.trim() ? `כיתוב על התכשיט: "${s.lettering.trim()}"` : "",
            s.brief.trim(),
          ].filter(Boolean).join(" · ") || undefined,
        }),
      });
      if (!res.ok) {
        // המחירון התעדכן בזמן שהמסך היה פתוח. זו התשובה היחידה שאין להציע
        // עליה `mailto:` — הודעה עם הסכום הישן היא בדיוק מה שאסור שיישלח.
        const code = await res
          .json()
          .then((b) => (b as { error?: { code?: string } })?.error?.code)
          .catch(() => undefined);
        if (code === "price_changed") {
          set({ sending: false, sendError: d.checkoutPriceChanged, orderKey: null });
          return;
        }
        throw new Error("failed");
      }

      // מסלול המייל נכנס בלי שם — הפרופיל נוצר עם החלק שלפני ה-@, ובבק־אופיס
      // הוא נראה כמו "dana" ולא כמו דנה. הצ'קאאוט הוא המקום היחיד שבו השם
      // האמיתי והטלפון כבר נמסרו, ולכן משלימים אותם כאן — יחד עם הכתובת, כדי
      // שההזמנה הבאה תתחיל ממה שכבר נמסר. best-effort: זו תוספת לתצוגה, ולא
      // סיבה להיכשל על הזמנה שכבר נשמרה.
      void api
        .updateAccount({
          name: s.addr.name.trim(),
          phone: formatPhone(s.addr.phone) || undefined,
          street: s.addr.street.trim() || undefined,
          city: s.addr.city.trim() || undefined,
          zip: s.addr.zip.trim() || undefined,
        })
        .then(({ account: a }) => setAccount(a))
        .catch(() => {});
      // מספר ההזמנה הוא מספר העיצוב. עד כה הוא נגזר מחיתוך של uuid — מחרוזת
      // אקראית שאי אפשר להקריא בטלפון, ושלא הצביעה על שום דבר שאפשר לחפש.
      const orderNo =
        orderedCode ?? ((orderedDesignId ?? "").slice(0, 8).toUpperCase() || "—");
      // המפתח מתאפס: ההזמנה הזאת נקלטה, והבאה היא הזמנה חדשה ולא ניסיון חוזר.
      // הטיוטה המקומית מיצתה את תפקידה — העיצוב שהוזמן שמור בשרת וברשימה.
      clearFunnelDraft();
      setState((prev) => ({ ...prev, sending: false, orderNo, orderKey: null, screen: "done" }));
      setMaxReached(railIndex(s.story, "done"));
      scrollToTop();
    } catch {
      // ההזמנה לא הגיעה לשרת. במקום להשאיר את הלקוחה עם "נסו שוב" בלבד —
      // שמשמעותו שכל מה שמילאה נעלם — נבנה `mailto:` עם אותן שורות בדיוק,
      // כדי שיהיה מסלול שני שמגיע לבן אדם. לא מפנים אליו אוטומטית: מי שאין לו
      // לקוח דואר מוגדר היה מאבד גם את המסך הזה.
      const subject = `${d.orderMailSubject} ${orderedCode ?? s.addr.name.trim()}`.trim();
      const body = [
        ...lines,
        "",
        `שם: ${s.addr.name.trim()}`,
        `טלפון: ${s.addr.phone.trim()}`,
        `מייל: ${s.addr.email.trim()}`,
      ].join("\n");
      set({
        sending: false,
        sendError: d.checkoutError,
        sendMailto: `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(
          subject,
        )}&body=${encodeURIComponent(body)}`,
      });
    }
  }, [s, set]);

  /* ===== רינדור ===== */
  // הסרגל יורד גם בפתיחה מקישור: הוא היה מסמן את שלב 1 (בחירת מוצר) בזמן
  // שנשלף עיצוב גמור — כלומר אומר במפורש שאנחנו בתחילת המסע.
  const showRail = s.screen !== "done" && !opening;

  return (
    // בלי ap-scope: העמוד יושב כבר בתוך SiteLayout שמחיל אותו. הכפילות ציירה
    // את הגריד ואת הזוהר הלאפיסי פעמיים זה על זה במסך המרכזי של המשפך.
    <div className="ap-surface min-h-screen">
      {showRail && (
        <StepRail
          screen={s.screen}
          maxReached={maxReached}
          // story mode — סדר שלבים משלו: המידה יושבת אחרי התוצאה, ואין בו
          // שלב מוצר. ראה STORY_RAIL.
          rail={railFor(s.story)}
          // הסרגל הוא הדרך השנייה לצאת מהמסע באמצע הרצה, ולכן הוא ננעל יחד
          // עם Back. הבדיקה חוזרת גם ב-`onGo`: כפתור מושבת אינו שולח אירוע,
          // אבל זו הרשות שמחליטה, לא התצוגה.
          locked={running}
          onGo={(i) => {
            if (running) {
              setLockNotice(true);
              return;
            }
            go(railTarget(s.story)[i]);
          }}
        />
      )}

      {/* ניסיון לצאת באמצע הרצה. `assertive` ולא `polite`: זו תשובה ללחיצה
          שהמשתמשת עשתה עכשיו, ולא עדכון רקע. */}
      {running && lockNotice && (
        <div
          role="status"
          aria-live="assertive"
          className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5"
        >
          <p className="max-w-[520px] border border-graphite/15 bg-chalk px-5 py-4 text-[14px] leading-relaxed text-graphite shadow-[0_2px_18px_rgba(0,0,0,0.10)]" style={{ textWrap: "pretty" }}>
            {d.lockedBusy}
          </p>
        </div>
      )}

      {/* עיצוב שנפתח מכתובת — מסך הפתיחה במקום המשפך, ולא מעליו: מה שמתחת
          אינו רלוונטי, ולכן גם אין מה להשאיר לחיץ מאחורי שכבה. */}
      {opening && <OpeningScreen code={openingCode} />}

      {!opening && (
        <div key={s.screen} className="ap-fade">
          {s.screen === "product" && (
            <>
              <div className="mx-auto max-w-[1100px] px-5 pt-10 sm:px-10">
                {/* הגיעו מלינק שיתוף שכבר לא פעיל. בלי המשפט הזה הם נוחתים על
                    מסך בחירת מוצר רגיל, בלי שום סימן למה שנלחץ. */}
                {!s.fromShare && s.adoptError && (
                  <div className="mb-6 border border-graphite/15 bg-chalk px-5 py-4 text-[13px] text-ink60">
                    {s.adoptError}
                  </div>
                )}
                {account && <AccountBar name={account.name} onSwitch={onSwitchAccount} />}
                <SavedDesigns
                  items={saved}
                  onResume={resume}
                  onRemove={(id) => {
                    removeMyDesign(id);
                    setSaved(listMyDesigns());
                  }}
                  onOpen={() => setPreviewsWanted(true)}
                  loadingId={resumingId}
                  error={resumeError}
                  defaultOpen={savedOpen}
                />
              </div>
              <ProductScreen
                onPick={(p: Product) => {
                  const patch = switchProduct(s, p);
                  set(patch);
                  // אם החלפת המוצר ביטלה עיצוב קיים — נועלים חזרה את השלבים שקדימה,
                  // אחרת קפיצה בסרגל הייתה מציגה תוצאה ריקה (העיצוב אופס).
                  if (patch.designId === null && s.designId !== null) setMaxReached(1);
                  go("sizes");
                }}
              />
            </>
          )}

          {s.screen === "sizes" && (
            <>
              {/* מזמינים עיצוב ששותף — אומרים את זה במפורש. בלי זה המסך נראה
                  כמו תחילת מסע רגיל, ומי שלחץ "להזמין כזה" לא יודע אם העיצוב
                  שראה עוד איתו. */}
              {s.fromShare && (
                <div className="mx-auto max-w-[1100px] px-5 pt-10 sm:px-10">
                  <div className="border border-lapis/30 bg-lapis/[0.06] px-5 py-4">
                    <div className="text-[13px] font-semibold text-graphite">
                      {designCode(s.fromShareSerial)
                        ? he.share.adoptBanner(designCode(s.fromShareSerial)!)
                        : he.share.adoptBannerNoCode}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
                      {he.share.adoptSizeNote}
                    </p>
                    {s.adoptError && (
                      <p className="mt-2 text-[13px]" style={{ color: "var(--color-failred)" }}>{s.adoptError}</p>
                    )}
                  </div>
                </div>
              )}
              {/* story mode — למה המידה נשאלת דווקא עכשיו, ומה קורה לתרגום
                  שכבר נבחר. בלי המשפט הזה המסך נראה כמו נסיגה לתחילת מסע
                  אחרי שכבר הייתה תוצאה. כשל במסגור מחדש מדווח כאן, במקום
                  שבו הכפתור שנלחץ נמצא. */}
              {s.story && (
                <div className="mx-auto max-w-[1100px] px-5 pt-10 sm:px-10">
                  <div className="border border-lapis/30 bg-lapis/[0.06] px-5 py-4">
                    <div className="text-[13px] font-semibold text-graphite">
                      {story.sizes.banner}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
                      {story.sizes.bannerNote}
                    </p>
                    {s.chooseError && (
                      <p role="alert" className="mt-2 text-[13px]" style={{ color: "var(--color-failred)" }}>
                        {s.chooseError}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <SizesScreen
                s={s}
                set={setSizes}
                // שלושה מסלולים, ולכל אחד המשך אחר: עיצוב ששותף כבר קיים
                // וצריך רק להתאים אותו למידה; במסלול story העיצוב כבר נבחר
                // והמידה היא הצעד האחרון לפני הסיכום; ובמסלול הרגיל המידה
                // קודמת לתיאור.
                onNext={() =>
                  s.fromShare
                    ? void adoptShared()
                    : s.story
                      ? void applyStorySize()
                      : go("brief")
                }
                busy={s.adopting || s.resizing}
                nextLabel={
                  s.fromShare
                    ? s.adopting
                      ? he.share.adoptWorking
                      : he.share.adoptStart
                    : s.story
                      ? s.resizing
                        ? story.sizes.ctaBusy
                        : story.sizes.cta
                      : undefined
                }
              />
            </>
          )}

          {s.screen === "brief" && (
            <BriefScreen
              s={s}
              set={set}
              onSubmit={() => void startGeneration()}
              // חזרה אחורה מהתוצאה נוחתת כאן, והתוצאה עצמה עדיין בזיכרון. בלי
              // הדרך חזרה אליה המסך נראה כמו עיצוב שנמחק, והפעולה הראשית שבו
              // מייצרת עיצוב שני במקום להחזיר את הראשון.
              hasResult={s.edits.length > 0}
              onBackToResult={() => go("result")}
            />
          )}

          {s.screen === "processing" && (
            <ProcessingScreen
              error={s.procError}
              detail={s.procErrorDetail}
              code={s.procErrorCode}
              failCount={s.procFailCount}
              accountEmail={account?.email ?? null}
              onFeedback={sendProcFeedback}
              disconnected={s.procStage === DISCONNECTED_STAGE}
              locked={running}
              onRetry={() => void startGeneration()}
              onBack={() => {
                // החזרה לעיצוב היא שינוי כיוון — הרצף נשבר: מי שחוזרת, משנה
                // משהו ומנסה שוב מתחילה ספירה חדשה, לא ממשיכה את הישנה.
                set({
                  procError: null, procErrorDetail: null, procErrorCode: null,
                  procFailCount: 0, procStage: null,
                });
                leaveProcessing();
              }}
            />
          )}

          {s.screen === "result" && (
            <ResultScreen
              s={s}
              set={set}
              onApply={applyEdit}
              onChooseCandidate={chooseCandidate}
              // גם גלילה למעלה: הגרסה מתחלפת בראש העמוד, ו"חזרה לגרסה זו" נלחץ
              // מיומן הגרסאות שבתחתיתו — בטלפון שום דבר בשדה הראייה לא משתנה.
              onRestore={(i) => {
                set({ activeEdit: i });
                scrollToTop();
              }}
              // story mode — "להזמין" פותח קודם את המידה: היא נשאלת רק
              // עכשיו, כשיש פריט אמיתי להתאים אותו ליד. השגיאה מתאפסת בדרך:
              // כשל בבחירת הצעה שנפתר אינו שייך למסך שנפתח עכשיו.
              onOrder={() => {
                if (s.story) set({ chooseError: null });
                go(s.story ? "sizes" : "summary");
              }}
            />
          )}

          {s.screen === "summary" && (
            <SummaryScreen s={s} set={set} onNext={() => go("checkout")} />
          )}

          {s.screen === "checkout" && (
            <CheckoutScreen s={s} set={set} onSubmit={submitOrder} accountEmail={account?.email ?? null} />
          )}

          {s.screen === "done" && <DoneScreen orderNo={s.orderNo ?? "—"} />}
        </div>
      )}

      <AccountGate
        open={gateOpen}
        onSignedIn={() => afterSignedIn()}
        onBeforeRedirect={() =>
          stashCreateState({
            state: s,
            maxReached,
            resume: startAfterSignIn.current,
            action: pendingAction.current,
            resumeId: resumeTarget.current,
          })
        }
        onCancel={() => {
          startAfterSignIn.current = false;
          setGateError(null);
          setGateOpen(false);
          // במסלול הסיפור השער נפתח **מעל** מסך ההמתנה: המסע נכנס ישר להמתנה,
          // והבקשה להזדהות היא הדבר הראשון שקורה שם. ביטול היה משאיר ספינר
          // שאין מאחוריו הרצה ואין ממנו יציאה — למסך ההמתנה אין Back כל עוד
          // לא נאמר שמשהו נכשל. הבריף הוא המסך הנכון לחזור אליו: הסיפור כבר
          // בתיבה, ו"שליחה" פותח את השער שוב.
          if (stateRef.current.screen === "processing" && !runningRef.current) leaveProcessing();
        }}
        externalError={gateError}
        externalBusy={gateBusy}
      />
    </div>
  );
}
