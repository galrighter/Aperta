"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { he } from "@/i18n/he";
import { story } from "@/i18n/story";
import { saveFunnelDraft } from "@/lib/client/funnelDraft";
import { saveStoryHandoff } from "@/lib/client/storyHandoff";
import { storyCreateBlockers } from "@/lib/story/createForm";
import { Eyebrow, ScreenTitle, OptionBtn, PrimaryBtn } from "@/components/create/ui";
import { INITIAL, type Product } from "@/components/create/model";

// story mode — מסך היצירה הפשוט.
//
// שתי פעולות, וזהו: לבחור תכשיט, ולספר. מה שאין כאן בכוונה — בורר רוחב,
// מאפייני עיצוב, מחוונים, presets ושפה של prompt — קיים כולו בעורך הקיים,
// והקישור אליו יושב למטה כפעולה משנית.
//
// **והמידה יצאה מכאן** (ראה STORY_RAIL): היא נשאלת בדרך להזמנה, אחרי שהלקוחה
// ראתה תרגומים ובחרה אחד. מדידה של פרק יד לפני שראית צורה אחת היא שאלה שאין
// לה עדיין הקשר, והיא הייתה הדבר היחיד שעמד בין הסיפור לתשובה. מסך המידות
// עצמו הוא זה של המסלול הרגיל, על הפריסטים ומדריך המדידה שבו.
//
// **מה נלקח מהמסע הקיים ולא נכתב מחדש:** פרימיטיבי ה-UI (`create/ui`) ותמונות
// המוצר. הניסוי אינו ממציא שפה גרפית משלו.
const d = he.design;
const c = story.create;

/** כמה זמן כל דוגמת placeholder על המסך. */
const PLACEHOLDER_MS = 6000;

export function StoryCreate() {
  const router = useRouter();
  const storyId = useId();
  const productRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [text, setText] = useState("");
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

  /** מה שחסר עכשיו. מוצג רק אחרי ניסיון שליחה — ראה `tried`. */
  const blockers = storyCreateBlockers({ product, story: text });
  const missingProduct = tried && blockers.includes("product");
  const missingStory = tried && blockers.includes("story");

  /** מה שנמסר לעורך המתקדם, כדי שלא יתחילו מחדש. הטיוטה היא המנגנון הקיים
   *  שהמסע ממילא קורא בכניסה (`loadFunnelDraft`) — בלי שום קוד חדש שם. */
  const handOff = (): void => {
    if (!product) return;
    saveFunnelDraft({ ...INITIAL, product, brief: text.trim() });
  };

  const submit = (): void => {
    setTried(true);
    // **לחיצה תמיד עושה משהו.** קודם היה כאן `return` שקט כשהמוצר לא נבחר,
    // ואז הכפתור הראשי במסך פשוט לא הגיב: השגיאה היחידה שהמסך ידע להציג
    // הייתה על הסיפור, ומי שכתבה סיפור ולא בחרה תכשיט לא קיבלה שום סימן.
    // עכשיו כל חסימה גם נראית על המסך וגם מושכת אליה את המיקוד.
    // `!product` כאן הוא לצמצום הטיפוס בלבד — `blockers` כבר מכיל אותו.
    if (blockers.length || !product) {
      const first = blockers[0];
      const el = first === "product" ? productRef.current : textRef.current;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      // בקבוצת המוצר אין שדה למקד — ממקדים את האפשרות הראשונה שבה.
      const focusable =
        first === "product" ? productRef.current?.querySelector("button") : textRef.current;
      focusable?.focus({ preventScroll: true });
      return;
    }
    setBusy(true);
    handOff();
    saveStoryHandoff({ product, story: text.trim() });
    // המסע הקיים, במצב story: הוא קולט את המסירה וקופץ ישר ליצירה.
    router.push("/design?story=1");
  };

  return (
    // `ap-veil` ו-`overflow-x-clip` מאותה סיבה כמו ב-`StoryHome` — ראה שם.
    <section className="mx-auto max-w-[820px] overflow-x-clip px-5 py-10 sm:px-10 sm:py-14">
      <div className="ap-veil">
        <Eyebrow>{c.eyebrow}</Eyebrow>

        {/* 1 · מה ניצור */}
        <ScreenTitle>{c.productTitle}</ScreenTitle>
        <div ref={productRef} className="mt-5 grid gap-4 sm:grid-cols-2">
          {(["bracelet", "ring"] as const).map((p) => (
            <OptionBtn
              key={p}
              on={product === p}
              onClick={() => setProduct(p)}
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
        {missingProduct && (
          <p role="alert" className="mt-2 text-[13px]" style={{ color: "var(--color-failred)" }}>
            {c.productMissing}
          </p>
        )}

        {/* 2 · הסיפור — החלק המרכזי במסך */}
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
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            maxLength={4000}
            placeholder={c.storyPlaceholders[ph]}
            aria-invalid={missingStory ? true : undefined}
            className={`mt-5 w-full resize-y rounded-[2px] border bg-chalk px-4 py-4 text-[16px] leading-relaxed text-graphite transition-colors focus:outline-none ${
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

    </section>
  );
}
