"use client";

// מסע היצירה — handoff_design_flow/HANDOFF.md.
// מחובר למנוע האמיתי: יצירת עיצוב, גנרציה, ולידציה וגרסאות עוברים דרך ה-API,
// ולא דרך state מדומה. שמירת העיצובים נוספה מעבר ל-handoff (לבקשת גל).
import { useCallback, useEffect, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { FAB } from "@/lib/fabrication.config";
import { api, ClientApiError } from "@/lib/client/api";
import {
  clearMyDesigns, listMyDesigns, mergeMyDesign, removeMyDesign, saveMyDesign,
  setMyDesignPreview,
  type SavedDesign,
} from "@/lib/client/myDesigns";
import { designCode } from "@/lib/designCode";
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
import { AccountBar, AccountGate } from "@/components/create/AccountGate";
import { clearCreateState, popCreateState, stashCreateState } from "@/lib/client/pendingCreate";
import {
  beatPendingJob, clearPendingJob, setPendingJob,
} from "@/lib/client/pendingJob";
import { authConfigured, supabaseBrowser } from "@/lib/client/supabaseBrowser";
import {
  INITIAL, RAIL, activeEntry, buildEditPrompt, buildPrompt, candidatesByGeneration,
  candidatesOf, circumferenceMm, entryFromGeneration,
  canGenerate, countCuts, densityForPrice, frameLengthMm, frameWidthMm, gapOf, invalidateDesign, mmLabel, mpToPreviewPath, priceOf,
  sizeReallyChanged, stripLengthMm, switchProduct, widthOf,
  type CreateState, type EditEntry, type Product, type Screen,
} from "@/components/create/model";

const d = he.design;

/** המסך הראשון של כל שלב בסרגל — לניווט מהסרגל. */
const RAIL_TARGET: Screen[] = RAIL.map((r) => r.screens[0]);

/** ערך מהאחסון המקומי חוזר כמחרוזת — מאמתים אותו מול הקבוצה המותרת. */
function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export default function DesignPage() {
  const [s, setState] = useState<CreateState>(INITIAL);
  const [maxReached, setMaxReached] = useState(0);
  const [saved, setSaved] = useState<SavedDesign[]>([]);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
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
    const invalidates = s.designId !== null && sizeReallyChanged(s, patch);
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

  useEffect(() => {
    api
      .account()
      .then(({ account: a }) => setAccount(a))
      // אין חשבון או שהבדיקה נכשלה — השער ייפתח בזמן היצירה ממילא.
      .catch(() => setAccount(null));
  }, []);

  const go = useCallback((screen: Screen) => {
    setState((prev) => ({ ...prev, screen }));
    const i = RAIL.findIndex((r) => r.screens.includes(screen));
    if (i >= 0) setMaxReached((m) => Math.max(m, i));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
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
    // המצב מהרפרנס ולא מה-closure: הקריאה שממשיכה אחרי כניסה לחשבון נתפסה לפני
    // שהמשפך שוחזר מה-stash. ראו `stateRef`.
    const cur = stateRef.current;
    // עד כאן אפשר להתקדם בלי להזדהות. מכאן והלאה נוצרת רשומה שצריכה בעלים,
    // ורצה הרצת מנוע שעולה כסף — ולכן זה הרגע שבו נפתח השער.
    const who = signedIn ?? account;
    if (!who) {
      startAfterSignIn.current = true;
      pendingAction.current = "generate";
      setGateError(null);
      setGateOpen(true);
      return;
    }

    // אין ממה לייצר. הכפתור חוסם את זה, אבל לכאן מגיעים גם אחרי כניסה לחשבון
    // (`startAfterSignIn`) — מסלול שלא עבר בכפתור מעולם. ב-RM-0074 הבקשה הגיעה
    // לשרת בלי תיאור ובלי תמונה, עם ברירות המחדל בלבד (`imageCount: 0`,
    // והפרומפט היה שורת המאפיינים לבדה), והלקוחה קיבלה אחרי המתנה עיצוב שלא
    // ביקשה — והוא נספר במכסה היומית שלה. חזרה למסך הבריף היא התשובה הנכונה:
    // מה שמילאה אבד, ולפחות היא רואה זאת מיד ולא אחרי דקה.
    if (!canGenerate(cur)) {
      go("brief");
      return;
    }

    const st = {
      ...cur,
      screen: "processing" as Screen,
      procError: null,
      procErrorDetail: null,
      procErrorCode: null,
    };
    setState(st);
    setMaxReached((m) => Math.max(m, 2));
    if (typeof window !== "undefined") window.scrollTo(0, 0);

    try {
      // "נסה שוב" חוזר לכאן. עיצוב שכבר נוצר ועוד אין לו גרסה הוא בדיוק
      // המקום שאליו היצירה אמורה לנחות — אחרת כל לחיצה מייצרת עיצוב נוסף.
      // לקוח שלחץ ארבע פעמים אחרי כשל השאיר ארבעה עיצובים ריקים ברשימה.
      const reuse = st.designId && st.edits.length === 0 ? st.designId : null;

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

      const withId = { ...st, designId: design.id, designSerial: design.serial ?? null };
      setState(withId);
      // נרשם עכשיו, לפני הגנרציה — כדי שהעיצוב יהיה בר-איתור גם אם היא נקטעת.
      remember(withId, null);

      // "קובץ מוכן לחיתוך" → וקטוריזציה ישירה; אחרת גנרציה מהתיאור.
      const res =
        st.imageRole === "ready" && st.image
          ? await api.vectorize({ designId: design.id, image: { dataUrl: st.image.dataUrl } })
          : await api.generate(
              {
                designId: design.id,
                userPrompt: buildPrompt(st),
                // הכיתוב נשלח בשדה נפרד ולא בתוך הפרומפט: השרת חותך אותו
                // מהפונט ומוסר אותו למודל כתמונה, כדי שהאיות לא יהיה נתון
                // לפרשנות (docs/research/HEBREW_TEXT_HANDOFF.md).
                text: st.lettering.trim() || undefined,
                currentSvg: null,
                images:
                  st.image && st.imageRole !== "ready"
                    ? [{ kind: "inspiration" as const, dataUrl: st.image.dataUrl }]
                    : [],
                // ניסיון חוזר אחרי ניתוק: אותו מזהה, ולכן אותה הרצה על הקופסה.
                // מה שכבר רונדר ושולם נאסף במקום להיקנות שוב. `jobRef` שורד רק
                // כשל רשת/תפוגה — תשובה אמיתית של השרת מנקה אותו למטה, וקלט
                // שהשתנה מקבל ממילא הרצה חדשה (השרת גוזר גם מהבקשה).
                jobId: jobRef.current ?? undefined,
              },
              undefined,
              // רושמים את ההרצה לפני שהיא מסתיימת: זה מה שמאפשר לחלון "העיצוב
              // מוכן" למצוא אותה אם הלקוחה יצאה מהמסך באמצע.
              (jobId) => {
                jobRef.current = jobId;
                setPendingJob({ jobId, designId: design.id, first: true });
              },
            );

      clearPendingJob();
      jobRef.current = null;
      pushEntry(withId, entryFromGeneration(res, { region: null, text: "" }));
      go("result");
    } catch (e) {
      const apiErr = e instanceof ClientApiError ? e : null;
      // תשובה אמיתית של השרת סוגרת את ההרצה; כשל רשת/תפוגה **לא**. במקרה
      // השני ההרצה עשויה להמשיך בשרת ולהצליח, ואז החלון הקופץ הוא הדרך
      // היחידה של הלקוחה לדעת — ולכן הרשומה נשארת.
      if (apiErr && !["network", "truncated", "timeout"].includes(apiErr.code)) {
        clearPendingJob();
        jobRef.current = null;
      }
      setState((prev) => ({
        ...prev,
        procError: apiErr?.message ?? he.errGeneric,
        procErrorDetail: apiErr
          ? `${apiErr.code} · ${apiErr.status}`
          : ((e as Error)?.message?.slice(0, 80) ?? null),
        procErrorCode: apiErr?.code ?? null,
      }));
    }
  }, [account, go, pushEntry, remember]);

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
      if (typeof window !== "undefined") window.scrollTo(0, 0);
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
        // שאפשר יהיה פשוט לנסות שוב במקום להתחיל מאפס.
        if (!last) {
          setState({
            ...INITIAL,
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
          if (typeof window !== "undefined") window.scrollTo(0, 0);
          return;
        }

        const val = await api.validate({
          svg: last.svg,
          productType: design.product_type,
          lengthMm: Number(design.length_mm),
          widthMm: Number(design.width_mm),
          thicknessMm: Number(design.thickness_mm),
        });
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
            geometry: i === versions.length - 1 ? val.geometry : null,
            // ההצעות חוזרות מהשרת (0012). קודם הן לא נשלפו כלל, ולכן כל פתיחה
            // של עיצוב שמור — וכל רענון — מחקה את רצועת החלופות.
            candidates: candidatesOf(v, byRun),
            chosen: v.picked_index ?? undefined,
          })),
          activeEdit: versions.length - 1,
        });
        setMaxReached(3);
        setResumingId(null);
        if (typeof window !== "undefined") window.scrollTo(0, 0);
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
    // המסלול נוסע עם המצב: הרפרנס עצמו לא שורד טעינת עמוד מחדש.
    pendingAction.current = stash.action ?? "generate";
    resumeTarget.current = stash.resumeId ?? null;

    const url = new URL(window.location.href);
    const failed = url.searchParams.get("auth") === "failed";
    if (failed) {
      // מנקים את הסימון מהכתובת: רענון אחריו לא אמור להראות שוב שגיאה ישנה.
      url.searchParams.delete("auth");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
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
      // אותה בנייה כמו ביצירה הראשונה — כולל ההצעות. שינוי רץ באותו צינור
      // ומחזיר את אותו מספר הצעות; כאן הן נזרקו, ולכן אחרי כל שינוי נשארה
      // הצעה אחת על המסך והשאר הופיעו רק אחרי רענון.
      pushEntry(s, entryFromGeneration(res, { region: s.region, text: s.editReq.trim() }));
      set({ applying: false, editReq: "" });
      // התוצאה מתחלפת בראש העמוד, והלקוחה עומדת בתיבת הבקשה בתחתיתו.
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    } catch (e) {
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
      try {
        const res = await api.chooseCandidate(s.designId, svg, index, entry.versionId);
        const next: EditEntry = {
          ...entryFromGeneration(res, { region: null, text: "" }),
          // אותן הצעות ממשיכות להיות זמינות אחרי הבחירה — הבחירה עצמה אינה
          // הרצה, והתשובה שלה לא נושאת אותן.
          candidates: entry.candidates,
          chosen: index,
        };
        // בחירה בתוך אותה הרצה מעדכנת שורה קיימת ולא מוסיפה — והשרת מודיע על
        // כך בכך שהוא מחזיר את **אותו** מזהה גרסה. אין צורך בשדה נוסף בתשובה,
        // והתנהגות שרת ישן (מזהה חדש בכל פעם) ממשיכה לעבוד בלי שינוי.
        if (res.version.id === entry.versionId) replaceEntry(s, s.activeEdit, next);
        else pushEntry(s, next);
        set({ applying: false });
      } catch (e) {
        // בליעה שקטה נראתה בדיוק כמו כפתור מת: לחיצה, שום שינוי, שום הסבר.
        const apiErr = e instanceof ClientApiError ? e : null;
        set({ applying: false, chooseError: apiErr?.message ?? he.errGeneric });
      }
    },
    [s, set, pushEntry, replaceEntry],
  );

  /* ===== כניסה עם כתובת =====
     `?resume=<id>` — פתיחת עיצוב מסוים: מהחלון "העיצוב שלך מוכן", ומקישור
     בבק־אופיס. `?designs=1` — כניסה דרך "העיצובים שלי" בכותרת.
     `?signin=1` — כניסה דרך "כניסה" בכותרת: השער נפתח מעצמו ביצירה, אבל מי
     שלחץ במפורש "כניסה" ביקש להזדהות **עכשיו**, ובלי זה הוא נוחת על מסך בחירת
     המוצר בלי שום סימן שמשהו קרה.
     נקרא מ-`window.location` ולא מ-`useSearchParams` כדי לא לחייב את העמוד
     כולו ב-Suspense; שלושת הפרמטרים נכנסים בטעינה מלאה. */
  const urlHandled = useRef(false);
  useEffect(() => {
    if (urlHandled.current) return;
    urlHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    const wantsDesigns = params.get("designs");
    const wantsSignIn = params.get("signin");
    const shareToken = params.get("from");
    if (!resumeId && !wantsDesigns && !wantsSignIn && !shareToken) return;

    // ניקוי הכתובת: רענון אחרי שהעיצוב נפתח לא אמור לפתוח אותו שוב מאפס.
    window.history.replaceState({}, "", window.location.pathname);

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
      void resume(known ?? { id: resumeId });
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

  /* ===== שליחת ההזמנה ===== */
  const submitOrder = useCallback(async () => {
    set({ sending: true, sendError: null, sendMailto: null });
    const p = priceOf(s);
    const entry = activeEntry(s);
    // הסיכום הזה משמש **רק** את מסלול הגיבוי ב-mailto. מה שנשמר ונשלח במסלול
    // התקין נבנה בשרת מהשורה שנכתבה (src/lib/orderSummary.ts) — טקסט שהדפדפן
    // מנסח הוא ניסוח, לא נתונים.
    const lines = [
      `מוצר: ${s.product === "ring" ? d.ringName : d.braceletName}`,
      `היקף: ${Math.round(circumferenceMm(s))} ${d.mm} · רוחב: ${mmLabel(frameWidthMm(s, entry))} ${d.mm}`,
      s.product === "ring" ? "" : `ישיבה: ${d.fits[s.fit]}`,
      `חיתוכים: ${countCuts(entry?.svg ?? null)}`,
      `מספר עיצוב: ${designCode(s.designSerial) ?? "—"}`,
      `מזהה עיצוב: ${s.designId ?? "—"}`,
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
          designId: s.designId,
          // הגרסה שהיא רואה על המסך ברגע ההזמנה — לא "האחרונה שנוצרה". אחרי
          // ההזמנה אפשר להמשיך לערוך, ומה שנחתך חייב להיות מה שהיא אישרה.
          versionId: entry?.versionId ?? null,
          name: s.addr.name.trim(),
          email: s.addr.email.trim(),
          phone: s.addr.phone.trim(),
          street: s.addr.street.trim(),
          city: s.addr.city.trim(),
          zip: s.addr.zip.trim(),
          productType: s.product ?? "bracelet",
          circumferenceMm: Math.round(circumferenceMm(s) * 10) / 10,
          widthMm: Math.round(frameWidthMm(s, entry) * 10) / 10,
          fit: s.product === "ring" ? undefined : s.fit,
          // המחיר עצמו מחושב בשרת מאותה פונקציה; מה שנשלח הוא מה שקבע אותו —
          // ולכן `densityForPrice`: ב"שהמודל יחליט" לא נבחרה צפיפות.
          density: densityForPrice(s),
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
      if (!res.ok) throw new Error("failed");

      // מסלול המייל נכנס בלי שם — הפרופיל נוצר עם החלק שלפני ה-@, ובבק־אופיס
      // הוא נראה כמו "dana" ולא כמו דנה. הצ'קאאוט הוא המקום היחיד שבו השם
      // האמיתי והטלפון כבר נמסרו, ולכן משלימים אותם כאן. best-effort: זו
      // תוספת לתצוגה, ולא סיבה להיכשל על הזמנה שכבר נשמרה.
      void api
        .updateAccount({ name: s.addr.name.trim(), phone: s.addr.phone.trim() || undefined })
        .then(({ account: a }) => setAccount(a))
        .catch(() => {});
      // מספר ההזמנה הוא מספר העיצוב. עד כה הוא נגזר מחיתוך של uuid — מחרוזת
      // אקראית שאי אפשר להקריא בטלפון, ושלא הצביעה על שום דבר שאפשר לחפש.
      const orderNo =
        designCode(s.designSerial) ?? ((s.designId ?? "").slice(0, 8).toUpperCase() || "—");
      setState((prev) => ({ ...prev, sending: false, orderNo, screen: "done" }));
      setMaxReached(5);
      if (typeof window !== "undefined") window.scrollTo(0, 0);
    } catch {
      // ההזמנה לא הגיעה לשרת. במקום להשאיר את הלקוחה עם "נסו שוב" בלבד —
      // שמשמעותו שכל מה שמילאה נעלם — נבנה `mailto:` עם אותן שורות בדיוק,
      // כדי שיהיה מסלול שני שמגיע לבן אדם. לא מפנים אליו אוטומטית: מי שאין לו
      // לקוח דואר מוגדר היה מאבד גם את המסך הזה.
      const subject = `${d.orderMailSubject} ${
        designCode(s.designSerial) ?? s.addr.name.trim()
      }`.trim();
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
  const showRail = s.screen !== "done";

  return (
    // בלי rm-scope: העמוד יושב כבר בתוך SiteLayout שמחיל אותו. הכפילות ציירה
    // את הגריד ואת הזוהר הקובלטי פעמיים זה על זה במסך המרכזי של המשפך.
    <div className="min-h-screen">
      {showRail && (
        <StepRail
          screen={s.screen}
          maxReached={maxReached}
          onGo={(i) => go(RAIL_TARGET[i])}
        />
      )}

      <div key={s.screen} className="rm-fade">
        {s.screen === "product" && (
          <>
            <div className="mx-auto max-w-[1100px] px-5 pt-10 sm:px-10">
              {/* הגיעו מלינק שיתוף שכבר לא פעיל. בלי המשפט הזה הם נוחתים על
                  מסך בחירת מוצר רגיל, בלי שום סימן למה שנלחץ. */}
              {!s.fromShare && s.adoptError && (
                <div className="mb-6 border border-graphite/15 bg-white px-5 py-4 text-[13px] text-ink60">
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
                <div className="border border-cobalt/30 bg-cobalt/[0.06] px-5 py-4">
                  <div className="text-[13px] font-semibold text-graphite">
                    {designCode(s.fromShareSerial)
                      ? he.share.adoptBanner(designCode(s.fromShareSerial)!)
                      : he.share.adoptBannerNoCode}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
                    {he.share.adoptSizeNote}
                  </p>
                  {s.adoptError && (
                    <p className="mt-2 text-[13px]" style={{ color: "#c0413b" }}>{s.adoptError}</p>
                  )}
                </div>
              </div>
            )}
            <SizesScreen
              s={s}
              set={setSizes}
              // עיצוב ששותף כבר קיים: אין תיאור לכתוב ואין מה לייצר, רק
              // להתאים אותו למידה שנבחרה כאן.
              onNext={() => (s.fromShare ? void adoptShared() : go("brief"))}
              busy={s.adopting}
              nextLabel={
                s.fromShare
                  ? s.adopting
                    ? he.share.adoptWorking
                    : he.share.adoptStart
                  : undefined
              }
            />
          </>
        )}

        {s.screen === "brief" && <BriefScreen s={s} set={set} onSubmit={() => void startGeneration()} />}

        {s.screen === "processing" && (
          <ProcessingScreen
            error={s.procError}
            detail={s.procErrorDetail}
            code={s.procErrorCode}
            onRetry={() => void startGeneration()}
            onBack={() => {
              set({ procError: null, procErrorDetail: null, procErrorCode: null });
              go("brief");
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
              window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
            }}
            onOrder={() => go("summary")}
          />
        )}

        {s.screen === "summary" && (
          <SummaryScreen s={s} set={set} onNext={() => go("checkout")} />
        )}

        {s.screen === "checkout" && (
          <CheckoutScreen s={s} set={set} onSubmit={submitOrder} />
        )}

        {s.screen === "done" && <DoneScreen orderNo={s.orderNo ?? "—"} />}
      </div>

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
        }}
        externalError={gateError}
        externalBusy={gateBusy}
      />
    </div>
  );
}
