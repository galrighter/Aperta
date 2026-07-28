"use client";

// מסע היצירה — handoff_design_flow/HANDOFF.md.
// מחובר למנוע האמיתי: יצירת עיצוב, גנרציה, ולידציה וגרסאות עוברים דרך ה-API,
// ולא דרך state מדומה. שמירת העיצובים נוספה מעבר ל-handoff (לבקשת גל).
import { useCallback, useEffect, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { FAB } from "@/lib/fabrication.config";
import { api, ClientApiError } from "@/lib/client/api";
import {
  listMyDesigns, removeMyDesign, saveMyDesign, type SavedDesign,
} from "@/lib/client/myDesigns";
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
import {
  INITIAL, RAIL, activeEntry, buildEditPrompt, buildPrompt, circumferenceMm,
  countCuts, frameLengthMm, frameWidthMm, gapOf, mmLabel, mpToPath, priceOf, stripLengthMm, widthOf,
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

  const set = useCallback((patch: Partial<CreateState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => setSaved(listMyDesigns()), []);

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
    const path = entry ? mpToPath(entry.geometry?.material) : "";
    saveMyDesign({
      id: st.designId,
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
      symmetry: st.symmetry,
      density: st.density,
      feel: st.feel,
      fit: st.fit,
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
  const startGeneration = useCallback(async () => {
    const st = { ...s, screen: "processing" as Screen, procError: null, procErrorDetail: null };
    setState(st);
    setMaxReached((m) => Math.max(m, 2));
    if (typeof window !== "undefined") window.scrollTo(0, 0);

    try {
      const { profiles } = await api.profiles();
      const profileId = profiles[0]?.id;
      if (!profileId) throw new Error("no profile");

      const { design } = await api.createDesign({
        profileId,
        productType: st.product ?? "bracelet",
        name: `${st.product === "ring" ? he.ring : he.bracelet} · ${Math.round(circumferenceMm(st))}${d.mm}`,
      });
      await api.patchDesign(design.id, {
        lengthMm: stripLengthMm(st),
        widthMm: widthOf(st),
        gapMm: gapOf(st),
      });

      const withId = { ...st, designId: design.id };
      setState(withId);
      // נרשם עכשיו, לפני הגנרציה — כדי שהעיצוב יהיה בר-איתור גם אם היא נקטעת.
      remember(withId, null);

      // "קובץ מוכן לחיתוך" → וקטוריזציה ישירה; אחרת גנרציה מהתיאור.
      const res =
        st.imageRole === "ready" && st.image
          ? await api.vectorize({ designId: design.id, image: { dataUrl: st.image.dataUrl } })
          : await api.generate({
              designId: design.id,
              userPrompt: buildPrompt(st),
              currentSvg: null,
              images:
                st.image && st.imageRole !== "ready"
                  ? [{ kind: "inspiration" as const, dataUrl: st.image.dataUrl }]
                  : [],
            });

      pushEntry(withId, {
        versionId: res.version.id,
        versionNo: res.version.version_no,
        lengthMm: res.lengthMm ?? null,
        region: null,
        text: "",
        svg: res.version.svg,
        report: res.report,
        geometry: res.geometry,
        candidates: "candidates" in res ? res.candidates : undefined,
      });
      go("result");
    } catch (e) {
      const apiErr = e instanceof ClientApiError ? e : null;
      setState((prev) => ({
        ...prev,
        procError: apiErr?.message ?? he.errGeneric,
        procErrorDetail: apiErr
          ? `${apiErr.code} · ${apiErr.status}`
          : ((e as Error)?.message?.slice(0, 80) ?? null),
      }));
    }
  }, [s, go, pushEntry, remember]);

  /* ===== שינוי ממוקד אזור ===== */
  const applyEdit = useCallback(async () => {
    const entry = activeEntry(s);
    if (!s.designId || !entry || !s.editReq.trim()) return;
    set({ applying: true });
    try {
      const res = await api.generate({
        designId: s.designId,
        userPrompt: buildEditPrompt(s),
        currentSvg: entry.svg,
        images: [],
      });
      pushEntry(s, {
        versionId: res.version.id,
        versionNo: res.version.version_no,
        lengthMm: res.lengthMm ?? null,
        region: s.region,
        text: s.editReq.trim(),
        svg: res.version.svg,
        report: res.report,
        geometry: res.geometry,
      });
      set({ applying: false, editReq: "" });
    } catch {
      set({ applying: false });
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
        const res = await api.chooseCandidate(s.designId, svg);
        pushEntry(s, {
          versionId: res.version.id,
          versionNo: res.version.version_no,
          lengthMm: res.lengthMm ?? null,
          region: null,
          text: "",
          svg: res.version.svg,
          report: res.report,
          geometry: res.geometry,
          // אותן הצעות ממשיכות להיות זמינות אחרי הבחירה.
          candidates: entry.candidates,
          chosen: index,
        });
        set({ applying: false });
      } catch (e) {
        // בליעה שקטה נראתה בדיוק כמו כפתור מת: לחיצה, שום שינוי, שום הסבר.
        const apiErr = e instanceof ClientApiError ? e : null;
        set({ applying: false, chooseError: apiErr?.message ?? he.errGeneric });
      }
    },
    [s, set, pushEntry],
  );

  /* ===== המשך עיצוב שמור ===== */
  const resume = useCallback(
    async (item: SavedDesign) => {
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
            ...sizes,
            brief: item.brief ?? "",
            symmetry: pick(item.symmetry, ["symmetric", "asymmetric"], INITIAL.symmetry),
            density: pick(item.density, ["low", "medium", "high"], INITIAL.density),
            feel: pick(item.feel, ["delicate", "balanced", "massive"], INITIAL.feel),
            fit: pick(item.fit, ["tight", "regular", "loose"], INITIAL.fit),
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
        setState({
          ...INITIAL,
          screen: "result",
          product: design.product_type,
          designId: design.id,
          ...sizes,
          brief: item.brief ?? "",
          edits: versions.map((v, i) => ({
            versionId: v.id,
            versionNo: v.version_no,
            lengthMm: Number(design.length_mm),
            region: null,
            text: i === 0 ? "" : (v.user_prompt ?? ""),
            svg: v.svg,
            report: v.validation_report,
            geometry: i === versions.length - 1 ? val.geometry : null,
          })),
          activeEdit: versions.length - 1,
        });
        setMaxReached(3);
        setResumingId(null);
        if (typeof window !== "undefined") window.scrollTo(0, 0);
      } catch {
        setResumingId(null);
        setResumeError(d.savedLoadError);
      }
    },
    [],
  );

  /* ===== שליחת ההזמנה ===== */
  const submitOrder = useCallback(async () => {
    set({ sending: true, sendError: null });
    const p = priceOf(s);
    const entry = activeEntry(s);
    const lines = [
      `מוצר: ${s.product === "ring" ? d.ringName : d.braceletName}`,
      `היקף: ${Math.round(circumferenceMm(s))} ${d.mm} · רוחב: ${mmLabel(frameWidthMm(s, entry))} ${d.mm}`,
      s.product === "ring" ? "" : `ישיבה: ${d.fits[s.fit]}`,
      `חיתוכים: ${countCuts(entry?.svg ?? null)}`,
      `מזהה עיצוב: ${s.designId ?? "—"}`,
      `סה"כ: ${d.ils}${p.total}`,
      "",
      `כתובת: ${s.addr.street}, ${s.addr.city}${s.addr.zip ? ` ${s.addr.zip}` : ""}`,
      s.brief.trim() ? `תיאור הלקוחה: ${s.brief.trim()}` : "",
    ].filter(Boolean);

    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "order",
          name: s.addr.name.trim(),
          email: s.addr.email.trim(),
          phone: s.addr.phone.trim(),
          productType: s.product ?? "bracelet",
          message: lines.join("\n"),
        }),
      });
      if (!res.ok) throw new Error("failed");
      const body = (await res.json().catch(() => null)) as { inquiry?: { id?: string } } | null;
      const raw = body?.inquiry?.id ?? s.designId ?? "";
      const orderNo = `RM-${(raw.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || String(Date.now()).slice(-6)).toUpperCase()}`;
      setState((prev) => ({ ...prev, sending: false, orderNo, screen: "done" }));
      setMaxReached(5);
      if (typeof window !== "undefined") window.scrollTo(0, 0);
    } catch {
      set({ sending: false, sendError: d.checkoutError });
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
              <SavedDesigns
                items={saved}
                onResume={resume}
                onRemove={(id) => {
                  removeMyDesign(id);
                  setSaved(listMyDesigns());
                }}
                loadingId={resumingId}
                error={resumeError}
              />
            </div>
            <ProductScreen
              onPick={(p: Product) => {
                set({ product: p });
                go("sizes");
              }}
            />
          </>
        )}

        {s.screen === "sizes" && <SizesScreen s={s} set={set} onNext={() => go("brief")} />}

        {s.screen === "brief" && <BriefScreen s={s} set={set} onSubmit={startGeneration} />}

        {s.screen === "processing" && (
          <ProcessingScreen
            error={s.procError}
            detail={s.procErrorDetail}
            onRetry={startGeneration}
            onBack={() => {
              set({ procError: null, procErrorDetail: null });
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
            onRestore={(i) => set({ activeEdit: i })}
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
    </div>
  );
}
