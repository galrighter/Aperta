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
  const [summary, setSummary] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  /** קריאת סבב אחת. `nextTurns` כבר כולל את תשובת הלקוחה. */
  const runTurn = (chosen: Product, nextTurns: Bubble[]): void => {
    setBusy(true);
    setError(null);
    retryRef.current = () => runTurn(chosen, nextTurns);
    api
      .interviewTurn({ product: chosen, turns: nextTurns, spec: spec ?? undefined, utm: utmRef.current })
      .then((res) => {
        setSpec(res.spec);
        if (res.summary) {
          // הסיכום נכנס לתמליל: סבב תיקון צריך שהמודל יראה מה הוצג לה.
          setTurns([...nextTurns, { role: "interviewer", text: res.summary }]);
          setSummary(res.summary);
          setChips([]);
          setPhase("summary");
        } else if (res.ask) {
          setTurns([...nextTurns, { role: "interviewer", text: res.ask.question }]);
          setChips(res.ask.chips ?? []);
          setPhase("chat");
        }
        setBusy(false);
      })
      .catch((e) => {
        setBusy(false);
        setError(e instanceof ClientApiError ? e.message : c.failed);
      });
  };

  /** הסגירה: מהמפרט המאושר לכיוונים, ומסירה למסע הקיים. */
  const confirm = (): void => {
    if (!product || !summary || !spec) return;
    setPhase("closing");
    setBusy(true);
    setError(null);
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
        setError(e instanceof ClientApiError ? e.message : c.failed);
      });
  };

  const send = (raw: string): void => {
    const value = raw.trim();
    if (!product || !value || busy) return;
    setText("");
    setSummary(null);
    setChips([]);
    runTurn(product, [...turns, { role: "customer", text: value.slice(0, 2000) }]);
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
              <div className="flex flex-wrap items-center gap-3 self-start">
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
