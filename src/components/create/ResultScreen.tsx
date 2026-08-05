"use client";

// handoff §6 — שני מצבי תצוגה, סימון אזורים, בקשה למודל, יומן גרסאות ומצב
// ייצור. מצב הייצור מוזן מדוח הוולידציה האמיתי של המנוע.
//
// מה שהיה כאן ואיננו: כרטיס "כוונון מהיר" — שני מחוונים שנספחו לפרומפט של כל
// בקשת שינוי. הוסר (גל, 31.7); הנימוק המלא ב-buildEditPrompt.
import { he } from "@/i18n/he";
import { designCode } from "@/lib/designCode";
import {
  Eyebrow, ScreenTitle, CardLabel, PrimaryBtn, LAPIS,
} from "./ui";
import { FlatDrawing, RegionChips, type IssueMark } from "./Artwork";
import { ProgressBar } from "./ProgressBar";
import { RolledStage } from "./RolledStage";
import { ShareButton } from "./ShareButton";
import {
  activeEntry, countCuts, cutoutsInner, frameLengthMm, frameWidthMm, gapOf, versionEntryLabel,
  type CreateState,
} from "./model";

const d = he.design;

const STATUS_COLOR = { pass: "#4a8f5c", warn: "#b9762e", fail: "#c0413b" } as const;

export function ResultScreen({
  s, set, onApply, onRestore, onOrder, onChooseCandidate,
}: {
  s: CreateState;
  set: (patch: Partial<CreateState>) => void;
  onApply: () => void;
  onRestore: (i: number) => void;
  onOrder: () => void;
  onChooseCandidate: (index: number, svg: string) => void;
}) {
  const entry = activeEntry(s);
  /** איפה אנחנו ביומן. `activeEdit` הוא ‎-1 כל עוד לא נבחרה גרסה במפורש. */
  const activeIndex = s.activeEdit >= 0 ? s.activeEdit : s.edits.length - 1;
  const cutouts = cutoutsInner(entry?.svg);
  const L = frameLengthMm(s, entry);
  const W = frameWidthMm(s, entry);
  /**
   * הדוח מגיע מ-`validation_report` (jsonb), כלומר מכל גרסה שאי פעם נשמרה —
   * גם כאלה שנכתבו לפני שהמבנה הנוכחי התייצב. הטיפוס מבטיח `metrics` ו-
   * `locations`, ה-DB לא: דוח חלקי אחד הפיל את המסע כולו ל-"Application
   * error" (`report.metrics.openAreaPct` על undefined). לכן כל מה שנקרא ממנו
   * כאן נקרא בהגנה, ומה שחסר מוצג כ-"—" במקום להפיל את העמוד.
   */
  const report = entry?.report ?? null;
  const metrics = report?.metrics ?? null;
  const checks = report?.checks ?? [];
  const flat = s.resultMode === "flat";
  // הצעות שאפשר לייצר בלבד. השרת כבר מסנן; הסינון כאן שומר גם על תשובה ישנה
  // שנשמרה במצב לפני השינוי.
  const picks = (entry?.candidates ?? []).filter((c) => c?.report?.status !== "fail");

  // כל מה שהוולידציה סימנה, כדי לצייר את זה על הפריסה. המנוע כבר מחשב מיקום
  // לכל ממצא; עד עכשיו זה נזרק והלקוחה קיבלה פסק דין בלי ראיה.
  const marks: IssueMark[] = checks
    .filter((c) => c.status !== "pass")
    .flatMap((c) =>
      (c.locations ?? []).map((l) => ({ ...l, status: c.status as IssueMark["status"] })),
    );

  const status = report?.status ?? "pass";
  const statusText = statusWord(status);
  const statusColor = STATUS_COLOR[status] ?? STATUS_COLOR.pass;

  return (
    <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-10">
      <Eyebrow>{d.resultEyebrow}</Eyebrow>
      {/* פעם היו כאן שתי כותרות, ו"קובץ מוכן לחיתוך" קיבל "הקובץ שלך מוכן".
          מרגע שהמילה "קובץ" ירדה מהאתר, שני הענפים אמרו את אותו הדבר —
          והלקוחה מקבלת את אותה כותרת בלי קשר למאיפה הגיע העיצוב. */}
      <ScreenTitle>{d.resultTitle}</ScreenTitle>

      {/* המספר הסידורי, ליד העיצוב עצמו — זה מה שמוסרים כשמדברים עליו.
          לצידו השיתוף: שתי הדרכים למסור את העיצוב הזה למישהו אחר, באותה שורה,
          במקום שנראה בלי גלילה. הכפתור ישב קודם בתחתית העמודה הצדדית ובטלפון
          פשוט לא נמצא — ראו ההערה ב-ShareButton. */}
      {(designCode(s.designSerial) || (s.designId && entry)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {designCode(s.designSerial) && (
            <p className="font-display text-[12px] tracking-[0.14em] text-mist">
              {d.codeLabel} <span className="text-lapis" dir="ltr">{designCode(s.designSerial)}</span>
            </p>
          )}
          {s.designId && entry && (
            <ShareButton
              designId={s.designId}
              versionId={entry.versionId}
              serial={s.designSerial}
              // הפריסה נכנסת לתמונת השיתוף מתחת להדמיה: על מתכת מעוגלת ומבריקה
              // הגרפיקה לא תמיד נקראית, ומי שרואה את הלינק בוואטסאפ רואה רק
              // את התמונה.
              flat={{ cutouts, lengthMm: L, widthMm: W }}
            />
          )}
        </div>
      )}

      {/* איפה אנחנו ביומן, ואיך חוזרים.
          זה מה שחסר אחרי בקשת שינוי: התוצאה מתחלפת על המסך בלי שום דבר שאומר
          שהיא התחלפה, בלי הבקשה שיצרה אותה, ובלי דרך לחזור — "חזרה לגרסה זו"
          ביומן הגרסאות יושב בתחתית העמוד, ובטלפון זו גלילה של מסך שלם ומשהו.
          מוצג רק כשיש יותר מגרסה אחת: לפני זה אין לאן לחזור ואין מה למספר. */}
      {s.edits.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-graphite/10 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-graphite">
              {d.versionCurrent(activeIndex + 1, s.edits.length)}
            </div>
            {entry?.text && (
              <p className="mt-1 text-[13px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
                {d.versionApplied}: {entry.text}
              </p>
            )}
          </div>
          {activeIndex > 0 && (
            <button
              type="button"
              onClick={() => onRestore(0)}
              className="flex-none whitespace-nowrap rounded-[2px] border border-graphite/25 px-4 py-2 text-[13px] text-graphite transition-colors hover:bg-porcelain"
            >
              {d.versionBackToOriginal}
            </button>
          )}
        </div>
      )}

      {/* מתג מצב תצוגה */}
      <div className="mb-6 mt-6 flex gap-2">
        {([["render", d.modeRender], ["flat", d.modeFlat]] as const).map(([m, label]) => {
          const on = s.resultMode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => set({ resultMode: m })}
              aria-pressed={on}
              className="rounded-[2px] border border-graphite px-[18px] py-2.5 text-sm transition-colors"
              style={{
                background: on ? "#202326" : "transparent",
                color: on ? "#f4f1eb" : "#202326",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* אותו גריד בשני מצבי התצוגה.
          במצב הדמיה הוא היה עמודה אחת, ואז כרטיסי הצד — מצב ייצור, יומן
          הגרסאות וכפתור ההזמנה — נמתחו לרוחב מלא של 1200px מתחת לתכשיט,
          ה-`lg:sticky` שלהם לא עשה כלום (אין לצידו מה לגלול), וההזמנה ישבה
          בתחתית עמוד ארוך. ההדמיה עצמה לא מפסידה מהצמצום: המצלמה ממוסגרת לפי
          הממד הקטן (ראו fit ב-Preview3D), והגובה קבוע — כלומר התכשיט מוצג
          באותו גודל בדיוק, ומה שנחתך הוא הרקע הריק משני צדיו. */}
      <div className="grid items-start gap-8 lg:grid-cols-[1.5fr_1fr]">
        {/* ===== תצוגה ===== */}
        <div>
          <div className="border border-graphite/10 bg-white">
            {/* אין תבנית — לומר את זה במפורש במקום להציג פס חלק כאילו זו התוצאה. */}
            {!cutouts ? (
              <div className="px-6 py-16 text-center">
                <div className="mb-2 text-lg font-semibold text-graphite">{d.resultEmptyTitle}</div>
                <p className="mx-auto max-w-[420px] text-sm leading-relaxed text-ink60">
                  {d.resultEmptyBody}
                </p>
              </div>
            ) : flat ? (
              <FlatDrawing
                cutouts={cutouts}
                lengthMm={L}
                widthMm={W}
                region={s.region}
                onRegion={(r) => set({ region: r })}
                issues={marks}
              />
            ) : (
              <div style={{ background: "linear-gradient(180deg,#efeae1,#e0d9cd)" }}>
                <RolledStage
                  material={entry?.geometry?.material ?? null}
                  cutouts={cutouts}
                  lengthMm={L}
                  widthMm={W}
                  gapMm={gapOf(s)}
                />
              </div>
            )}
          </div>

          {/* ההצעות מאותה יצירה. כל אחת היא פס שלם — בחירה שומרת אותה כגרסה.
              מוצגות רק הצעות שאפשר לייצר; מה שנכשל בוולידציה לא מוצע לבחירה.

              כשנשארה הצעה אחת הבלוק נעלם **בשקט, וזו החלטה** (גל, 31.7): הלקוחה
              לא יודעת שנוצרו כמה אפשרויות, ולכן "רק הצעה אחת עברה" היה חושף
              מנגנון פנימי ומעורר שאלה שלא הייתה קיימת. אין להוסיף כאן הודעת
              הסבר — זו לא השמטה שנשכחה. */}
          {picks.length > 1 && (
            <div className="mt-4">
              <CardLabel>{entry?.text ? d.candidatesLabelEdit : d.candidatesLabel}</CardLabel>
              {/* אחת בשורה, ברוחב מלא. הפס הוא ביחס של כ-5:1, ובגריד של 2–4
                  בטלפון כל הצעה נמרחת לשערה שאי אפשר להשוות בין אחת לשנייה. */}
              <div className="mt-2 flex flex-col gap-2">
                {picks.map((c, i) => {
                  // לפי אינדקס, לא לפי ה-SVG: הגרסה השמורה היא ה-canonicalSvg
                  // של השרת ולא המחרוזת שההצעה נשאה, כך שההשוואה הישנה נכשלה
                  // תמיד ואף הצעה לא סומנה כמוצגת.
                  const on = (entry?.chosen ?? 0) === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={s.applying}
                      onClick={() => onChooseCandidate(i, c.svg)}
                      aria-pressed={on}
                      aria-label={`${d.candidatesLabel} ${i + 1} — ${statusWord(c.report?.status)}${
                        on ? ` · ${d.candidateChosen}` : ""
                      }`}
                      title={statusWord(c.report?.status)}
                      className={`bg-white p-3 text-start transition ${
                        on
                          ? "border-2 border-graphite"
                          : "border border-graphite/15 hover:border-graphite/40"
                      } ${s.applying ? "opacity-50" : ""}`}
                    >
                      <span className="mb-1.5 flex items-center gap-2">
                        <span
                          aria-hidden
                          className="block h-1.5 w-1.5 rounded-full"
                          style={{ background: STATUS_COLOR[c.report?.status] ?? STATUS_COLOR.pass }}
                        />
                        {on && (
                          <span className="text-[11px] font-semibold tracking-wide text-graphite">
                            {d.candidateChosen}
                          </span>
                        )}
                      </span>
                      {/* אותה קוטביות כמו בפריסה — כהה הוא מתכת. כאן זה חשוב
                          במיוחד: תפקיד הרצועה הוא להשוות בין הצעות, וקווי מתאר
                          מחייבים לפענח כל צורה לפני שאפשר להשוות שתיים. */}
                      <svg viewBox={`-1 -1 ${L + 2} ${W + 2}`} className="h-auto w-full" role="img">
                        <rect x="0" y="0" width={L} height={W} fill="var(--color-graphite)" />
                        <g className="flat-cutouts" dangerouslySetInnerHTML={{ __html: cutoutsInner(c.svg) }} />
                      </svg>
                    </button>
                  );
                })}
              </div>
              {s.chooseError && (
                <p className="mt-2 text-[13px]" style={{ color: STATUS_COLOR.fail }}>
                  {s.chooseError}
                </p>
              )}
            </div>
          )}

          {!flat && (
            <p className="mt-3 text-[13px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
              {d.renderNote}
            </p>
          )}

          {/* סימון אזורים — במצב פריסה */}
          {flat && (
            <div className="mt-4 border border-graphite/10 bg-white p-5">
              <CardLabel>{d.regionTitle}</CardLabel>
              <p className="mb-3.5 text-[13px] text-ink60">{d.regionHint}</p>
              <RegionChips region={s.region} onRegion={(r) => set({ region: r })} />
            </div>
          )}

          {/* בקשה למודל */}
          <div className="mt-4 border border-graphite/10 bg-white p-5">
            <CardLabel htmlFor="edit-request">{`${d.editReqTitle} · ${d.regions[s.region ?? "all"]}`}</CardLabel>
            <textarea
              id="edit-request"
              value={s.editReq}
              onChange={(e) => set({ editReq: e.target.value })}
              placeholder={d.editReqPlaceholder}
              className="w-full resize-y rounded-[2px] border border-graphite/20 bg-porcelain p-3.5 text-[15px] leading-relaxed transition-colors focus:border-lapis focus:outline-none"
              style={{ minHeight: 88 }}
            />
            <div className="mt-3">
              <button
                type="button"
                onClick={onApply}
                disabled={s.applying || !s.editReq.trim()}
                className="rounded-[2px] px-6 py-3 text-[15px] font-semibold text-white transition-colors disabled:cursor-not-allowed"
                style={{ background: s.applying || !s.editReq.trim() ? "rgba(63,98,151,0.35)" : LAPIS }}
              >
                {s.applying ? d.editApplying : d.editApply}
              </button>
            </div>
            {/* השינוי לוקח כדקה וחצי — אותה המתנה בדיוק כמו ביצירה הראשונה,
                ולכן אותו פס. עד כאן היה כאן משפט בלבד: הכפתור אמר "מחיל…",
                הטקסט אמר "זה ייקח", ושום דבר על המסך לא זז בזמן שזה רץ. */}
            {s.applying && (
              <>
                <ProgressBar active label={d.editApplying} className="mt-3.5" />
                <p className="mt-2.5 text-[13px] leading-relaxed text-ink60">{d.editApplyingNote}</p>
              </>
            )}
            {s.editError && (
              <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: STATUS_COLOR.fail }}>
                {s.editError}
                {/* סירוב של מסנן התוכן נכון גם בבקשת שינוי — "תוסיף אוזניים של
                    מיקי מאוס" נחסם בדיוק כמו תיאור ראשוני. ההשוואה היא לאותו
                    קבוע שממנו נבנתה ההודעה (`messageFor` ב-client/api), ולכן
                    היא זהות ולא ניחוש על טקסט. */}
                {s.editError === he.errContentBlocked && (
                  <>
                    {" "}
                    <a
                      href="/design-rules"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline underline-offset-4"
                    >
                      {he.errContentBlockedRules}
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* ===== צד ===== */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-[104px]">
          {/* מצב ייצור */}
          <div className="border border-graphite/10 bg-white p-6">
            <CardLabel>{d.fabTitle}</CardLabel>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: statusColor }} />
              <span className="text-sm font-semibold" style={{ color: statusColor }}>
                {statusText}
              </span>
            </div>
            <Row k={d.fabOpenArea} v={num(metrics?.openAreaPct, "%")} />
            <Row k={d.fabWeight} v={num(metrics?.estWeightGrams, ` ${he.grams}`)} />
            <Row k={d.fabFormat} v={d.fabFormatVal} />
            <Row k={d.specCuts} v={String(entry ? countCuts(entry.svg) : 0)} />

            {/* ממצאים מהוולידציה */}
            {checks.some((c) => c.status !== "pass") && (
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-graphite/10 pt-3">
                {checks
                  .filter((c) => c.status !== "pass")
                  .slice(0, 4)
                  .map((c, i) => (
                    <li key={i} className="text-[13px] leading-snug" style={{ color: c.status === "fail" ? "#c0413b" : "#b9762e" }}>
                      {c.message}
                      {/* כמה, ולא רק מה. "פתח קטן מדי" על ממצא אחד ועל שמונה
                          הם שני מצבים שונים לגמרי מבחינת מה שצריך לעשות. */}
                      {(c.locations?.length ?? 0) > 0 && (
                        <span className="text-ink60"> · {d.fabIssueCount(c.locations.length)}</span>
                      )}
                    </li>
                  ))}
                {marks.length > 0 && (
                  <li className="text-[12px] leading-snug text-ink60">
                    {flat ? d.fabIssueMarked : d.fabIssueSeeFlat}
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* יומן גרסאות */}
          <div className="border border-graphite/10 bg-white p-6">
            <CardLabel>{d.versionsTitle}</CardLabel>
            {s.edits.length <= 1 ? (
              <p className="text-[13px] text-ink60">{d.versionsEmpty}</p>
            ) : (
              <ol className="flex flex-col">
                {s.edits.map((e, i) => {
                  const on = activeIndex === i;
                  return (
                    <li
                      key={e.versionId}
                      className="flex items-start justify-between gap-3 border-b border-graphite/[0.07] py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-graphite">
                          {d.versionLabel} {i + 1}
                          {e.region ? ` · ${d.regions[e.region]}` : ""}
                        </div>
                        <div className="mt-0.5 truncate text-[13px] text-ink60">
                          {versionEntryLabel(e, i)}
                        </div>
                      </div>
                      {!on && (
                        <button
                          type="button"
                          onClick={() => onRestore(i)}
                          className="flex-none whitespace-nowrap text-[12px] text-lapis underline-offset-4 hover:underline"
                        >
                          {d.versionRestore}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* שני מצבים שבהם ההזמנה הייתה פתוחה ולא הייתה צריכה להיות.
              **בזמן שהשינוי רץ:** הוא מסתיים ברקע ומחליף את הגרסה — כלומר
              הלקוחה מזמינה פריט אחד ומקבלת אחר, בלי שדבר על המסך זז.
              **כשהוולידציה אומרת "לא ניתן לייצור":** הסטודיו חוסם ייצוא על
              אותו סטטוס בדיוק, והמשפך שלח את זה הלאה — עד לסדנה, שם זה נעצר
              בלי דרך להסביר ללקוחה למה. */}
          <PrimaryBtn onClick={onOrder} disabled={s.applying || status === "fail"} full>
            {d.resultOrder}
          </PrimaryBtn>
          {(s.applying || status === "fail") && (
            <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: s.applying ? undefined : STATUS_COLOR.fail }}>
              {s.applying ? d.resultOrderBusy : d.resultOrderBlocked}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** מספר מהדוח, או "—" אם הוא חסר. ראו ההערה על `report` למעלה. */
function num(value: number | undefined, suffix: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)}${suffix}`
    : "—";
}

/** מצב הייצור במילה אחת. סובל גם סטטוס חסר, שנקרא כמו "עובר". */
function statusWord(status: string | undefined): string {
  return status === "fail" ? d.fabFail : status === "warn" ? d.fabWarn : d.fabOk;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-graphite/[0.07] py-2.5 text-sm last:border-b-0">
      <span className="text-ink60">{k}</span>
      <span className="font-semibold text-graphite">{v}</span>
    </div>
  );
}

