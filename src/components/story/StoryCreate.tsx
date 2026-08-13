"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { he } from "@/i18n/he";
import { story } from "@/i18n/story";
import { saveFunnelDraft } from "@/lib/client/funnelDraft";
import { saveStoryHandoff } from "@/lib/client/storyHandoff";
import { Eyebrow, ScreenTitle, FieldLabel, OptionBtn, PrimaryBtn, Modal } from "@/components/create/ui";
import { INITIAL, sizeIssue, type CreateState, type Product } from "@/components/create/model";

// story mode — מסך היצירה הפשוט.
//
// שלוש פעולות, וזהו: לבחור תכשיט, להזין מידה, לספר. מה שאין כאן בכוונה — בורר
// רוחב, מאפייני עיצוב, מחוונים, presets ושפה של prompt — קיים כולו בעורך
// הקיים, והקישור אליו יושב למטה כפעולה משנית.
//
// **מה נלקח מהמסע הקיים ולא נכתב מחדש:** פרימיטיבי ה-UI (`create/ui`),
// הוולידציה של המידה (`sizeIssue` — אותו טווח, אותן הודעות), מדריך המדידה
// (`he.design.guideSteps*`) ותמונות המוצר. הניסוי אינו ממציא מידות, יחידות או
// שפה גרפית משלו.
const d = he.design;
const c = story.create;

/** כמה זמן כל דוגמת placeholder על המסך. */
const PLACEHOLDER_MS = 6000;

export function StoryCreate() {
  const router = useRouter();
  const sizeId = useId();
  const storyId = useId();

  const [product, setProduct] = useState<Product | null>(null);
  const [size, setSize] = useState("");
  const [text, setText] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** הצגת השגיאות מתחילה רק אחרי ניסיון שליחה — לא צובעים טופס שטרם מולא. */
  const [tried, setTried] = useState(false);
  const [ph, setPh] = useState(0);

  useEffect(() => {
    if (text) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setPh((n) => (n + 1) % c.storyPlaceholders.length), PLACEHOLDER_MS);
    return () => clearInterval(t);
  }, [text]);

  const ring = product === "ring";
  /** המידה נבדקת דרך המודל הקיים: אותם טווחים, אותן הודעות, אותה המרה.
   *  בטבעת השדה מקבל שתי צורות (מידה אמריקאית עד 30, היקף במ"מ מעליה) —
   *  התנהגות קיימת, והיא נכונה גם כאן: מי שמכירה את מידתה תקליד אותה. */
  const asState: CreateState = {
    ...INITIAL,
    product: product ?? "bracelet",
    ...(ring ? { ringSize: size } : { circ: size }),
  };
  const issue = size.trim() ? sizeIssue(asState) : null;
  const cmHint =
    issue?.kind === "circumference" && issue.value * 10 >= issue.lo && issue.value * 10 <= issue.hi
      ? issue.value
      : null;

  const missingSize = tried && !size.trim();
  const missingStory = tried && !text.trim();

  /** מה שנמסר לעורך המתקדם, כדי שלא יתחילו מחדש. הטיוטה היא המנגנון הקיים
   *  שהמסע ממילא קורא בכניסה (`loadFunnelDraft`) — בלי שום קוד חדש שם. */
  const handOff = (): void => {
    if (!product) return;
    saveFunnelDraft({
      ...INITIAL,
      product,
      ...(product === "ring" ? { ringSize: size.trim() } : { circ: size.trim() }),
      brief: text.trim(),
    });
  };

  const submit = (): void => {
    setTried(true);
    if (!product || !size.trim() || !text.trim() || issue) return;
    setBusy(true);
    handOff();
    saveStoryHandoff({ product, size: size.trim(), story: text.trim() });
    // המסע הקיים, במצב story: הוא קולט את המסירה וקופץ ישר ליצירה.
    router.push("/design?story=1");
  };

  return (
    <section className="mx-auto max-w-[820px] px-5 py-10 sm:px-10 sm:py-14">
      <div className="ap-surface">
        <Eyebrow>{c.eyebrow}</Eyebrow>

        {/* 1 · מה ניצור */}
        <ScreenTitle>{c.productTitle}</ScreenTitle>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {(["bracelet", "ring"] as const).map((p) => (
            <OptionBtn
              key={p}
              on={product === p}
              onClick={() => {
                setProduct(p);
                // המידה נמדדת על איבר אחר — ערך שנשאר משם היה מידה שגויה
                // שנראית תקינה.
                setSize("");
              }}
            >
              <span className="flex items-center gap-4">
                {/* אותן תמונות מוצר של המסע הקיים. החיתוך נמוך יותר מזה של
                    `ProductScreen` כי החלון כאן קטן בהרבה: בגובה 56px החיתוך
                    שלו היה מכניס את הקובייה הכחולה שברקע הצילום ומשאיר את
                    התכשיט בחוץ. */}
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

        {/* 2 · מידה. רק השדה הרלוונטי, ורק אחרי שנבחר מוצר. */}
        {product && (
          <div className="mt-10">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
              <FieldLabel htmlFor={sizeId}>
                {ring ? c.sizeTitleRing : c.sizeTitleBracelet}
              </FieldLabel>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="text-sm text-lapis underline-offset-4 hover:underline"
              >
                {c.sizeGuide}
              </button>
            </div>
            <input
              id={sizeId}
              inputMode="decimal"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder={ring ? "54" : "168"}
              aria-invalid={issue || missingSize ? true : undefined}
              className={`w-full rounded-[2px] border bg-white px-4 py-3.5 text-base transition-colors focus:outline-none ${
                issue || missingSize ? "border-failred" : "border-graphite/20 focus:border-lapis"
              }`}
            />
            {issue ? (
              <p role="alert" className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--color-failred)" }}>
                {issue.kind === "usSize"
                  ? d.sizeUsOutOfRange(issue.value, issue.lo, issue.hi)
                  : d.sizeOutOfRange(issue.value, issue.lo, issue.hi)}
                {cmHint !== null && <span className="block">{d.sizeCmHint(cmHint)}</span>}
              </p>
            ) : missingSize ? (
              <p role="alert" className="mt-2 text-[13px]" style={{ color: "var(--color-failred)" }}>
                {c.sizeMissing}
              </p>
            ) : (
              <p className="mt-2 text-[13px] text-ink60">
                {ring ? c.sizeHintRing : c.sizeHintBracelet}
              </p>
            )}
          </div>
        )}

        {/* 3 · הסיפור — החלק המרכזי במסך */}
        <div className="mt-11">
          <h2 className="text-[26px] font-semibold leading-tight text-graphite sm:text-[30px]">
            {c.storyTitle}
          </h2>
          <p
            className="mt-3 max-w-[620px] text-[15px] leading-relaxed text-ink60 sm:text-[16px]"
            style={{ textWrap: "pretty" }}
          >
            {c.storyHelp}
          </p>
          <label htmlFor={storyId} className="sr-only">
            {c.storyTitle}
          </label>
          <textarea
            id={storyId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            maxLength={4000}
            placeholder={c.storyPlaceholders[ph]}
            aria-invalid={missingStory ? true : undefined}
            className={`mt-5 w-full resize-y rounded-[2px] border bg-white px-4 py-4 text-[16px] leading-relaxed text-graphite transition-colors focus:outline-none ${
              missingStory ? "border-failred" : "border-graphite/20 focus:border-lapis"
            }`}
          />
          {missingStory && (
            <p role="alert" className="mt-2 text-[13px]" style={{ color: "var(--color-failred)" }}>
              {c.storyMissing}
            </p>
          )}
        </div>

        {/* הפעולה הראשית */}
        <div className="mt-8">
          <PrimaryBtn onClick={submit} disabled={busy}>
            {busy ? c.ctaBusy : c.cta}
          </PrimaryBtn>
        </div>

        {/* תיאום ציפיות — חלק מהחוויה, לא אזהרה: אותו משקל טיפוגרפי של כל
            הערת עזר אחרת באתר, בלי צבע התראה ובלי שפה משפטית. */}
        <p
          className="mt-5 max-w-[620px] text-[13px] leading-relaxed text-ink60"
          style={{ textWrap: "pretty" }}
        >
          {c.interpretation}
        </p>

        {/* הפעולה המשנית — העורך הקיים, על כל מה שיש בו */}
        <div className="mt-12 border-t border-graphite/10 pt-7">
          <div className="text-[15px] font-semibold text-graphite">{c.editorTitle}</div>
          <p className="mt-1 text-[14px] leading-relaxed text-ink60">{c.editorBody}</p>
          <Link
            href="/design"
            onClick={handOff}
            className="mt-3 inline-flex items-center gap-2 text-[15px] text-lapis underline-offset-4 hover:underline"
          >
            {c.editorCta}
            <span aria-hidden="true">←</span>
          </Link>
        </div>
      </div>

      <Modal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title={ring ? d.guideTitleRing : d.guideTitleBracelet}
      >
        <ol className="flex flex-col gap-4">
          {(ring ? d.guideStepsRing : d.guideStepsBracelet).map((t, i) => (
            <li key={i} className="flex gap-3.5">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-graphite/25 font-display text-xs font-semibold text-graphite">
                {i + 1}
              </span>
              <span className="text-[15px] leading-relaxed text-ink80">{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-t border-graphite/10 pt-4 text-sm text-ink60">
          {ring ? d.guideNoteRing : d.guideNoteBracelet}
        </p>
        <div className="mt-6">
          <PrimaryBtn onClick={() => setGuideOpen(false)} full>
            {d.guideClose}
          </PrimaryBtn>
        </div>
      </Modal>
    </section>
  );
}
