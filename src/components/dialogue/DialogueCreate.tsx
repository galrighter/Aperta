"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { he } from "@/i18n/he";
import { dialogue } from "@/i18n/dialogue";
import { api, ClientApiError } from "@/lib/client/api";
import { saveFunnelDraft } from "@/lib/client/funnelDraft";
import { saveDialogueHandoff } from "@/lib/client/dialogueHandoff";
import { INTERVIEW_SKIP } from "@/lib/dialogue/mode";
import {
  gallerySvgPath, selectGalleryDesigns, type CuratedDesign,
} from "@/lib/dialogue/gallery";
import {
  defaultRatioFor, widthThirdOf,
  type DensityChoice, type EditChoice, type EditControlsAsk, type SymmetryChoice,
} from "@/lib/dialogue/editControls";
import { ratioOf, type EditSpec } from "@/lib/dialogue/spec";
import { ratioBandFor } from "@/lib/story/ratio";
import { Eyebrow, ScreenTitle, OptionBtn, PrimaryBtn } from "@/components/create/ui";
import { INITIAL, type Product } from "@/components/create/model";

// dialogue mode — מסך הראיון (שלב B): שיחת החידוד שקודמת לרנדר הראשון.
//
// **מה המסך מחזיק, ומה לא.** כל מצב השיחה חי כאן — התמליל, המפרט שהצטבר,
// השלב — ואין שום דבר בשרת מלבד קריאת מודל לכל סבב (`/api/dialogue/interview`).
// זה מה שמאפשר "בלי מיגרציה": מה שנשמר בסוף נוסע ב-handoff אל
// `/design?dialogue=1` ונרשם ביומן של ההרצה עצמה.
//
// **הזרימה:** בחירת מוצר (צ'יפ, בלי מודל) → חוזה המדיום + השאלה הרחבה
// (סטטיים — זהים לכולן, אין סיבה לשלם עליהם קריאה) → סבבי שאלה/תשובה עם
// צ'יפים ודילוג → סיכום לאישור (הרנדר המילולי בחינם של PROMPT_SPEC §3.1) →
// סגירה לכיוונים ומסירה למסע הקיים.
//
// **הגלריה (§3.2) היא תור בתוך השיחה, לא מסך.** המודל מחליט להציג אותה
// (סוג תור שלישי — הכרעת גל, 22.8) ומחזיר שאילתת תגים; המסך מסנן את הרשימה
// המאוצרת (`selectGalleryDesigns` — קובץ בגיט, אפס רשת) ומציג עד שישה
// ציורים סטטיים מ-`public/gallery/`. בחירה נשלחת כתשובה רגילה בתמליל —
// ה-concept כטקסט הבועה — בתוספת מזהה שהשרת מתרגם בעצמו לרשומה המאוצרת;
// "אף אחד מהם" הוא תשובה במילים, כי דחייה של שישה היא מידע ולא דילוג.
//
// **וכך גם מצב-מדויק (תור `edit`) — החלטת גל 21.8: "השיחה היא המשטח היחיד".**
// המודל מחליט להציע פקדים מדויקים — מחוון רוחב (היחס, עם תצוגה חיה של
// הפרופורציה) וצ'יפים לסימטריה ולצפיפות — והקביעה חוזרת כתשובה בתמליל
// (במילים שלה) בתוספת מטען מובנה שהשרת מנקה, מתרגם ומציב במפרט כ-`user`
// (‏editControls.ts). הקביעה אינה חובה: אפשר לקבע רק חלק, לכתוב חופשי,
// או לדלג — בדיוק כמו בגלריה.
//
// **כשל אינו נבלע.** אין כאן מסלול-של-היום ליפול אליו — הראיון הוא המסך.
// שגיאה מציגה "לנסות שוב" (התמליל נשמר), והעורך הקיים פתוח תמיד כפעולה
// משנית, כמו במסך Story.

const c = dialogue.create;
const d = he.design;

interface Bubble {
  role: "interviewer" | "customer";
  text: string;
}

type Phase = "product" | "chat" | "summary" | "closing";

/** מה מוצג על בועה של לקוחה — טוקן הדילוג מוצג כמילה, לא כסוגריים טכניים. */
const bubbleText = (b: Bubble): string => (b.text === INTERVIEW_SKIP ? c.skippedLabel : b.text);

export function DialogueCreate() {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [phase, setPhase] = useState<Phase>("product");
  const [turns, setTurns] = useState<Bubble[]>([]);
  const [spec, setSpec] = useState<unknown>(null);
  const [chips, setChips] = useState<string[]>([]);
  /** העיצובים שהגלריה מציגה כרגע — הסינון כבר רץ (`selectGalleryDesigns`). */
  const [gallery, setGallery] = useState<CuratedDesign[] | null>(null);
  /** תור מצב-מדויק פתוח — אילו פקדים להציג. */
  const [editAsk, setEditAsk] = useState<EditControlsAsk | null>(null);
  /** מה נגעו בו בפאנל. `null` = לא נגעו — ולא נשלח: מה שלא נקבע נשאר
   *  כפי שהשיחה השאירה אותו. */
  const [editRatio, setEditRatio] = useState<number | null>(null);
  const [editSymmetry, setEditSymmetry] = useState<SymmetryChoice | null>(null);
  const [editDensity, setEditDensity] = useState<DensityChoice | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** המזהה הטכני של הכשל — קטן, ליד ההודעה: צילום מסך של תקלה הופך לראיה.
   *  בריצה החיה השנייה (21.8) "שגיאה" בלי מזהה לא אמרה במה נפל הדילוג. */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  /** מה "לנסות שוב" חוזר עליו: התמליל כבר נושא את התשובה האחרונה, ולכן
   *  retry הוא קריאה חוזרת — לא הקלדה מחדש. */
  const retryRef = useRef<(() => void) | null>(null);
  /** ‏utm_content — הקריאייטיב שהביא אותה (‏PROMPT_SPEC §3.4). נקרא פעם
   *  אחת מהכתובת; `window.location` ולא `useSearchParams`, כמו במסע. */
  const utmRef = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const utm = new URLSearchParams(window.location.search).get("utm_content");
    if (utm) utmRef.current = utm.slice(0, 200);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns, summary, busy]);

  /** סגירת פאנל המצב-המדויק, כולל מה שסומן בו. */
  const closeEditPanel = (): void => {
    setEditAsk(null);
    setEditRatio(null);
    setEditSymmetry(null);
    setEditDensity(null);
  };

  /** קריאת סבב אחת. `nextTurns` כבר כולל את תשובת הלקוחה; `chosenId` נשלח
   *  רק כשהתשובה הזו היא בחירה בגלריה, ו-`choice` רק כשהיא קביעה בפקדים. */
  const runTurn = (
    chosen: Product,
    nextTurns: Bubble[],
    chosenId?: string,
    choice?: EditChoice,
  ): void => {
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    retryRef.current = () => runTurn(chosen, nextTurns, chosenId, choice);
    api
      .interviewTurn({
        product: chosen,
        turns: nextTurns,
        spec: spec ?? undefined,
        utm: utmRef.current,
        chosenVersionId: chosenId,
        editChoice: choice,
      })
      .then((res) => {
        setSpec(res.spec);
        if (res.summary) {
          // הסיכום נכנס לתמליל: סבב תיקון צריך שהמודל יראה מה הוצג לה.
          setTurns([...nextTurns, { role: "interviewer", text: res.summary }]);
          setSummary(res.summary);
          setChips([]);
          setGallery(null);
          closeEditPanel();
          setPhase("summary");
        } else if (res.gallery) {
          // תור גלריה: ההזמנה נכנסת לתמליל כתור מראיינת — כך היא גם נספרת
          // בתקרה (askedOf) בלי מנגנון שני. הסינון רץ כאן, על קובץ הגיט.
          const designs = selectGalleryDesigns(chosen, res.gallery.tags);
          setTurns([...nextTurns, { role: "interviewer", text: res.gallery.lead }]);
          setChips([]);
          // רשימה מאוצרת ריקה (לא אמור לקרות) — ההזמנה נשארת שאלה פתוחה.
          setGallery(designs.length > 0 ? designs : null);
          closeEditPanel();
          setPhase("chat");
        } else if (res.edit) {
          // תור מצב-מדויק: ההזמנה נכנסת לתמליל כתור מראיינת — נספרת בתקרה
          // בדיוק כמו גלריה. הפענוח בשרת מבטיח שרשימת הפקדים אינה ריקה.
          setTurns([...nextTurns, { role: "interviewer", text: res.edit.lead }]);
          setChips([]);
          setGallery(null);
          closeEditPanel();
          setEditAsk(res.edit as EditControlsAsk);
          setPhase("chat");
        } else if (res.ask) {
          setTurns([...nextTurns, { role: "interviewer", text: res.ask.question }]);
          setChips(res.ask.chips ?? []);
          setGallery(null);
          closeEditPanel();
          setPhase("chat");
        }
        setBusy(false);
      })
      .catch((e) => {
        setBusy(false);
        setError(c.failed);
        setErrorDetail(e instanceof ClientApiError ? c.failedDetail(e.code, e.message) : null);
      });
  };

  /** הסגירה: מהמפרט המאושר לכיוונים, ומסירה למסע הקיים. */
  const confirm = (): void => {
    if (!product || !summary || !spec) return;
    setPhase("closing");
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    retryRef.current = confirm;
    api
      .interviewDirections({ product, turns, spec, summary })
      .then((res) => {
        // הבריף של המסע הוא הסיכום שאושר — הוא מה שנרשם ביומן, ומה
        // שהנפילה-לאחור בשרת רצה עליו אם הכיוונים ייפסלו שם.
        saveFunnelDraft({ ...INITIAL, product, brief: summary });
        saveDialogueHandoff({
          product,
          directions: res.directions,
          summary,
          transcript: turns
            .map((t) => `${t.role === "interviewer" ? "מראיינת" : "לקוחה"}: ${bubbleText(t)}`)
            .join("\n")
            .slice(0, 20_000),
          utm: utmRef.current,
        });
        router.push("/design?dialogue=1");
      })
      .catch((e) => {
        setBusy(false);
        setPhase("summary");
        setError(c.failed);
        setErrorDetail(e instanceof ClientApiError ? c.failedDetail(e.code, e.message) : null);
      });
  };

  const send = (raw: string): void => {
    const value = raw.trim();
    if (!product || !value || busy) return;
    setText("");
    setSummary(null);
    setChips([]);
    setGallery(null);
    closeEditPanel();
    runTurn(product, [...turns, { role: "customer", text: value.slice(0, 2000) }]);
  };

  /** בחירה בגלריה: תשובה רגילה בתמליל — ה-concept הוא טקסט הבועה — בתוספת
   *  המזהה, שהשרת מתרגם בעצמו לרשומה המאוצרת (הבחירה→‏inferred של §3.2). */
  const pickDesign = (d: CuratedDesign): void => {
    if (!product || busy) return;
    setSummary(null);
    setChips([]);
    setGallery(null);
    closeEditPanel();
    const text = d.concept ? c.galleryPicked(d.concept) : c.galleryPickedPlain;
    runTurn(product, [...turns, { role: "customer", text }], d.version_id);
  };

  /** קביעה בפקדים המדויקים: תשובה רגילה בתמליל — במילים שלה, בלי שפת
   *  מפרט — בתוספת המטען המובנה, שהשרת מנקה ומציב במפרט בעצמו כ-`user`
   *  (‏editControls.ts). נשלח רק מה שנגעו בו. */
  const applyPrecise = (): void => {
    if (!product || busy) return;
    const choice: EditChoice = {};
    const parts: string[] = [];
    if (editRatio !== null) {
      choice.ratio = Math.round(editRatio * 10) / 10;
      parts.push(c.editWidthPart(c.editWidthQual[widthThirdOf(choice.ratio, ratioBandFor(product))]));
    }
    if (editSymmetry) {
      choice.symmetry = editSymmetry;
      parts.push(c.editSymmetryChips[editSymmetry]);
    }
    if (editDensity) {
      choice.density = editDensity;
      parts.push(c.editDensityChips[editDensity]);
    }
    if (!parts.length) return;
    setSummary(null);
    setChips([]);
    setGallery(null);
    closeEditPanel();
    runTurn(
      product,
      [...turns, { role: "customer", text: c.editPicked(parts.join(" · ")) }],
      undefined,
      choice,
    );
  };

  const pickProduct = (p: Product): void => {
    setProduct(p);
    // הפתיחה סטטית: חוזה המדיום לפני שנבנית ציפייה (§2.5), ואז השאלה
    // הרחבה של §3.5. בועה אחת בתמליל — כך היא נספרת כשאלה אחת בתקרה.
    setTurns([{ role: "interviewer", text: `${c.mediumContract}\n\n${c.opener}` }]);
    setPhase("chat");
  };

  /** מה שנמסר לעורך המתקדם — כמו במסך Story: הטיוטה שהמסע ממילא קורא. */
  const handOffToEditor = (): void => {
    if (!product) return;
    saveFunnelDraft({ ...INITIAL, product, brief: summary ?? "" });
  };

  return (
    <section className="mx-auto max-w-[760px] overflow-x-clip px-5 py-10 sm:px-10 sm:py-14">
      <div className="ap-veil">
        <Eyebrow>{c.eyebrow}</Eyebrow>

        {/* 1 · מה ניצור — צ'יפ, בלי קריאת מודל */}
        <ScreenTitle>{c.productTitle}</ScreenTitle>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {(["bracelet", "ring"] as const).map((p) => (
            <OptionBtn key={p} on={product === p} onClick={() => phase === "product" && pickProduct(p)}>
              <span className="flex items-center gap-4">
                <span className="relative h-14 w-20 flex-none overflow-hidden border border-graphite/10">
                  <Image
                    src={p === "ring" ? "/ring-hero.webp" : "/bracelet-hero.webp"}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                    style={{ objectPosition: p === "ring" ? "center 62%" : "center 78%" }}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-[18px] font-semibold text-graphite">
                    {p === "ring" ? c.productRing : c.productBracelet}
                  </span>
                  <span className="mt-0.5 block font-display text-[12px] text-lapis">
                    {p === "ring" ? d.ringPrice : d.braceletPrice}
                  </span>
                </span>
              </span>
            </OptionBtn>
          ))}
        </div>

        {/* 2 · השיחה */}
        {phase !== "product" && (
          <div className="mt-10 flex flex-col gap-3" aria-live="polite">
            {turns.map((b, i) => (
              <div
                key={i}
                className={
                  b.role === "interviewer"
                    ? "max-w-[85%] self-start whitespace-pre-line rounded-[2px] border border-graphite/10 bg-chalk px-4 py-3 text-[15px] leading-relaxed text-graphite"
                    : "max-w-[85%] self-end whitespace-pre-line rounded-[2px] bg-lapis/10 px-4 py-3 text-[15px] leading-relaxed text-graphite"
                }
              >
                {bubbleText(b)}
              </div>
            ))}

            {busy && (
              <div className="self-start px-1 text-[14px] text-ink60">
                {phase === "closing" ? c.closing : c.thinking}
              </div>
            )}
            {phase === "closing" && busy && (
              <p className="self-start px-1 text-[13px] text-ink60">{c.closingNote}</p>
            )}

            {error && (
              <div className="self-start">
                <div className="flex flex-wrap items-center gap-3">
                  <p role="alert" className="text-[14px]" style={{ color: "var(--color-failred)" }}>
                    {error}
                  </p>
                  <button
                    type="button"
                    className="rounded-[2px] border border-graphite/20 px-3 py-1.5 text-[14px] text-graphite hover:bg-porcelain"
                    onClick={() => retryRef.current?.()}
                  >
                    {c.retry}
                  </button>
                </div>
                {errorDetail && (
                  <p dir="ltr" className="mt-1 font-mono text-[11px] text-ink60">
                    {errorDetail}
                  </p>
                )}
              </div>
            )}

            {/* אישור הסיכום — הרנדר המילולי בחינם */}
            {phase === "summary" && !busy && !error && (
              <div className="mt-2 flex flex-wrap gap-3 self-start">
                <PrimaryBtn onClick={confirm}>{c.summaryConfirm}</PrimaryBtn>
                <span className="self-center text-[14px] text-ink60">{c.summaryFix}</span>
              </div>
            )}

            {/* צ'יפים — תשובה במגע אחד; השדה החופשי תמיד לצידם */}
            {phase === "chat" && !busy && chips.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2 self-end">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="rounded-[2px] border border-lapis/40 px-3 py-1.5 text-[14px] text-lapis-ink hover:bg-lapis/10"
                    onClick={() => send(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* הגלריה (‏PROMPT_SPEC §3.2) — בחירה במקום שאלה. ציורים סטטיים
                מ-public/gallery/, עמודה אחת: צמיד הוא רצועה ביחס ~10:1,
                ורשת צפופה הייתה מקטינה אותה לקו. הבחירה אינה חובה — "אף אחד
                מהם" הוא תשובה, והשדה החופשי נשאר פתוח מתחת. */}
            {phase === "chat" && !busy && !error && gallery && gallery.length > 0 && (
              <div className="mt-1 grid gap-2 self-stretch">
                {gallery.map((d) => (
                  <button
                    key={d.version_id}
                    type="button"
                    className="rounded-[2px] border border-graphite/15 bg-chalk px-4 py-3 transition-colors hover:border-lapis focus-visible:border-lapis"
                    onClick={() => pickDesign(d)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={gallerySvgPath(d.version_id)}
                      alt={d.concept ?? c.galleryAlt}
                      loading="lazy"
                      className="mx-auto max-h-24 w-full"
                    />
                  </button>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="rounded-[2px] border border-graphite/20 px-3 py-1.5 text-[14px] text-ink60 hover:bg-porcelain"
                    onClick={() => send(c.galleryNone)}
                  >
                    {c.galleryNone}
                  </button>
                  <span className="text-[13px] text-ink60">{c.galleryHint}</span>
                </div>
              </div>
            )}

            {/* מצב-מדויק (תור edit) — הפקדים בתוך השיחה, לא קישור יציאה.
                מחוון הרוחב רץ על סקלה לוגריתמית (הטווח 2.4–47.5 הוא יחסי,
                ומסלול ליניארי היה נותן את רוב הדרך לקצה הצר), והתצוגה החיה
                היא הפרופורציה עצמה — כהה הוא מתכת, כמו בפריסה ובגלריה.
                שום פקד אינו חובה: נשלח רק מה שנגעו בו. */}
            {phase === "chat" && !busy && !error && editAsk && product && (
              <div className="mt-1 flex flex-col gap-5 self-stretch rounded-[2px] border border-graphite/15 bg-chalk p-4">
                {editAsk.controls.includes("width") && (() => {
                  const [wide, thin] = ratioBandFor(product);
                  const shown = editRatio ?? ratioOf(spec as EditSpec | null) ?? defaultRatioFor(product);
                  const span = Math.log(thin / wide);
                  const t = Math.round((Math.log(shown / wide) / span) * 100);
                  return (
                    <div>
                      <div className="text-[13px] font-semibold text-graphite">{c.editWidthLabel}</div>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-[12px] text-ink60">{c.editWidthWide}</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.min(100, Math.max(0, t))}
                          aria-label={c.editWidthLabel}
                          className="w-full accent-lapis"
                          onChange={(e) => {
                            const next = wide * Math.exp((Number(e.target.value) / 100) * span);
                            setEditRatio(Math.round(next * 10) / 10);
                          }}
                        />
                        <span className="text-[12px] text-ink60">{c.editWidthNarrow}</span>
                      </div>
                      <div className="mt-3 flex h-[96px] items-center justify-center">
                        <div
                          className="bg-graphite"
                          style={{ width: 220, height: Math.max(4, Math.round(220 / shown)) }}
                        />
                      </div>
                    </div>
                  );
                })()}
                {editAsk.controls.includes("symmetry") && (
                  <div>
                    <div className="text-[13px] font-semibold text-graphite">{c.editSymmetryLabel}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["symmetric", "asymmetric"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={editSymmetry === k}
                          className={`rounded-[2px] border px-3 py-1.5 text-[14px] text-lapis-ink ${
                            editSymmetry === k ? "border-lapis bg-lapis/10" : "border-lapis/40 hover:bg-lapis/10"
                          }`}
                          onClick={() => setEditSymmetry(editSymmetry === k ? null : k)}
                        >
                          {c.editSymmetryChips[k]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {editAsk.controls.includes("density") && (
                  <div>
                    <div className="text-[13px] font-semibold text-graphite">{c.editDensityLabel}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["low", "medium", "high"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={editDensity === k}
                          className={`rounded-[2px] border px-3 py-1.5 text-[14px] text-lapis-ink ${
                            editDensity === k ? "border-lapis bg-lapis/10" : "border-lapis/40 hover:bg-lapis/10"
                          }`}
                          onClick={() => setEditDensity(editDensity === k ? null : k)}
                        >
                          {c.editDensityChips[k]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={editRatio === null && !editSymmetry && !editDensity}
                    className="rounded-[2px] bg-graphite px-4 py-2 text-[14px] font-semibold text-porcelain disabled:opacity-50"
                    onClick={applyPrecise}
                  >
                    {c.editApply}
                  </button>
                  <span className="text-[13px] text-ink60">{c.editHint}</span>
                </div>
              </div>
            )}

            {phase !== "closing" && (
              <form
                className="mt-3 flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(text);
                }}
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder={phase === "summary" ? c.summaryFixPlaceholder : c.inputPlaceholder}
                  className="min-h-[52px] w-full resize-y rounded-[2px] border border-graphite/20 bg-chalk px-4 py-3 text-[15px] leading-relaxed text-graphite transition-colors focus:border-lapis focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(text);
                    }
                  }}
                />
                <div className="flex flex-none flex-col gap-2">
                  <button
                    type="submit"
                    disabled={busy || !text.trim()}
                    className="rounded-[2px] bg-graphite px-4 py-2 text-[14px] font-semibold text-porcelain disabled:opacity-50"
                  >
                    {c.send}
                  </button>
                  {phase === "chat" && (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-[2px] border border-graphite/20 px-3 py-1.5 text-[13px] text-ink60 hover:bg-porcelain disabled:opacity-50"
                      onClick={() => send(INTERVIEW_SKIP)}
                    >
                      {c.skip}
                    </button>
                  )}
                </div>
              </form>
            )}

            <p className="mt-1 text-[13px] text-ink60">{c.letteringNote}</p>
            <div ref={endRef} />
          </div>
        )}

        {/* הפעולה המשנית — העורך הקיים, על כל מה שיש בו */}
        <div className="mt-12 border-t border-graphite/10 pt-7">
          <div className="text-[15px] font-semibold text-graphite">{c.editorTitle}</div>
          <p className="mt-1 text-[14px] leading-relaxed text-ink60">{c.editorBody}</p>
          <Link
            href="/design"
            onClick={handOffToEditor}
            className="mt-3 inline-flex items-center gap-2 text-[15px] text-lapis underline-offset-4 hover:underline"
          >
            {c.editorCta}
            <span aria-hidden="true">←</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
