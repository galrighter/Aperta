"use client";

// handoff §6 — שני מצבי תצוגה, סימון אזורים, בקשה למודל, יומן גרסאות ומצב
// ייצור. מצב הייצור מוזן מדוח הוולידציה האמיתי של המנוע.
//
// מה שהיה כאן ואיננו: כרטיס "כוונון מהיר" — שני מחוונים שנספחו לפרומפט של כל
// בקשת שינוי. הוסר (גל, 31.7); הנימוק המלא ב-buildEditPrompt.
import { he } from "@/i18n/he";
// story mode — מסגור טקסטואלי בלבד לתוצאה במסלול הפשוט. ראה STORY_FLOW_PLAN.md §17.
import { story } from "@/i18n/story";
import { designCode } from "@/lib/designCode";
import {
  blockCause, fabricationRef, hasFindings, markedChecks, needsLook,
} from "@/lib/fabricationNotice";
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

// שלושת הצבעים מגיעים מהטוקנים ב-globals.css ולא מעותק קשיח כאן. העותק שהיה
// כאן נשא את #4a8f5c גם אחרי ש-globals.css פסל אותו על 3.47 והחליף אותו —
// ומכיוון שהוא זה שצייר את שורת "ניתן לייצור", התיקון לא הגיע למסך שבו הוא
// הכי נחוץ. `src/lib/__tests__/contrast.test.ts` שומר על השלושה.
const STATUS_COLOR = {
  pass: "var(--color-successgreen)",
  warn: "var(--color-warnamber)",
  fail: "var(--color-failred)",
} as const;

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

  // מה שסיפרנו עליו, מסומן במקום שבו הוא יושב — פסילה בלי ראיה היא פסק דין.
  // הסינון ל-`markedChecks` הוא החצי השני של אותו כלל: עיגול על ממצא שלא
  // אמרנו עליו דבר, על פריט שכפתור ההזמנה שלו פתוח, מצביע על פגם ולא נותן לו
  // שם. ראו lib/fabricationNotice.ts.
  const marks: IssueMark[] = markedChecks(checks).flatMap((c) =>
    (c.locations ?? []).map((l) => ({ ...l, status: c.status as IssueMark["status"] })),
  );

  const status = report?.status ?? "pass";
  const blocked = status === "fail";
  const statusText = statusWord(status);
  const statusColor = blocked ? STATUS_COLOR.fail : STATUS_COLOR.pass;
  // הסיבה כמשפחה אחת, והבקשה שנגזרת ממנה. שתיהן נופלות ל-"other" כשהדוח חלקי
  // או כשהכשל אינו ממופה — משפט גנרי, ולא עמוד בלי הסבר.
  const cause = (blocked ? blockCause(checks) : null) ?? "other";
  const look = needsLook(checks);

  return (
    <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-10">
      <Eyebrow>{s.story ? story.result.eyebrow : d.resultEyebrow}</Eyebrow>
      {/* פעם היו כאן שתי כותרות, ו"קובץ מוכן לחיתוך" קיבל "הקובץ שלך מוכן".
          מרגע שהמילה "קובץ" ירדה מהאתר, שני הענפים אמרו את אותו הדבר —
          והלקוחה מקבלת את אותה כותרת בלי קשר למאיפה הגיע העיצוב.

          story mode מחזיר הבחנה אחת, וזו הבחנה של משמעות ולא של מקור: במסלול
          הפשוט מה שעל המסך הוא **פרשנות** לסיפור, ואחת מכמה. "העיצוב שלך
          מוכן" מזמין את השאלה "האם זה מה שדמיינתי"; "הנה כמה תרגומים לסיפור
          שלך" מזמין את השאלה "איזה מהם הכי שלי". זו כל ההבחנה, והיא טקסטואלית
          בלבד — המסך, הפקדים וההזמנה זהים. */}
      <ScreenTitle>
        {s.story
          ? picks.length > 1
            ? story.result.titleMany
            : story.result.titleOne
          : d.resultTitle}
      </ScreenTitle>
      {s.story && (
        <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
          {story.result.note}
        </p>
      )}

      {/* המספר הסידורי, ליד העיצוב עצמו — זה מה שמוסרים כשמדברים עליו.
          לצידו השיתוף: שתי הדרכים למסור את העיצוב הזה למישהו אחר, באותה שורה,
          במקום שנראה בלי גלילה. הכפתור ישב קודם בתחתית העמודה הצדדית ובטלפון
          פשוט לא נמצא — ראו ההערה ב-ShareButton. */}
      {(designCode(s.designSerial) || (s.designId && entry)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* המספר של **הגרסה המוצגת**: גרסת-עריכה יושבת על דוגמה ממוספרת
              (`AP-0085.2`), והנקודה במספר היא האינדיקציה לעיצוב שממנו נגזרה. */}
          {(entry?.designCode ?? designCode(s.designSerial)) && (
            <p className="font-display text-[12px] tracking-[0.14em] text-mist">
              {d.codeLabel}{" "}
              <span className="text-lapis" dir="ltr">{entry?.designCode ?? designCode(s.designSerial)}</span>
            </p>
          )}
          {s.designId && entry && (
            <ShareButton
              designId={entry.designId ?? s.designId}
              versionId={entry.versionId}
              serial={s.designSerial}
              code={entry.designCode}
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
                      aria-label={`${d.candidatesLabel} ${i + 1}${on ? ` · ${d.candidateChosen}` : ""}`}
                      className={`bg-white p-3 text-start transition ${
                        on
                          ? "border-2 border-graphite"
                          : "border border-graphite/15 hover:border-graphite/40"
                      } ${s.applying ? "opacity-50" : ""}`}
                    >
                      {/* פעם ישבה כאן נקודת סטטוס לכל הצעה. כל ההצעות ברצועה
                          עברו את הוולידציה (`offered` ב-/api/generate מסנן
                          כשלים), כלומר הנקודה דירגה בין אפשרויות שכולן ניתנות
                          לייצור — לפי אזהרות פנימיות שאין ללקוחה מה לעשות
                          איתן. בחירה בין שתי הצעות תקינות היא בחירה של מראה,
                          וכתם כתום ליד אחת מהן מסיט אותה בלי לומר למה. */}
                      {on && (
                        <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-graphite">
                          {d.candidateChosen}
                        </span>
                      )}
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
              // `role="status"` — בקשת השינוי לוקחת כדקה וחצי, ומי שאינו רואה
              // את הפס אינו יודע שהיא התחילה בכלל.
              <div role="status">
                <ProgressBar active label={d.editApplying} className="mt-3.5" />
                <p className="mt-2.5 text-[13px] leading-relaxed text-ink60">{d.editApplyingNote}</p>
              </div>
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

            {/* למה אי אפשר לייצר — משפט אחד, ולא רשימת הממצאים של המנוע.
                הרשימה שהייתה כאן ("החומר אינו רציף · מקום אחד", "גשר חומר צר
                מדי · 4 מקומות") היא אבחנה נכונה בשפה של מי שמפעיל את המכונה:
                ארבעה ממצאים, פעולה אחת אפשרית, ושום דרך ללקוחה לדעת מה מהם
                מתאר את התכשיט שלה. מה נשאר ממנה ואיפה — ב-fabricationNotice. */}
            {blocked && (
              <div className="mt-3 border-t border-graphite/10 pt-3">
                <p className="text-[13px] leading-relaxed" style={{ color: STATUS_COLOR.fail, textWrap: "pretty" }}>
                  {d.fabBlockedWhy[cause]}
                </p>
                {marks.length > 0 && (
                  <p className="mt-1.5 text-[12px] leading-snug text-ink60">
                    {flat ? d.fabIssueMarked : d.fabIssueSeeFlat}
                  </p>
                )}
              </div>
            )}

            {/* הכיתוב — בקשה להסתכל, לא ממצא, ולכן לא באדום ולא ליד סטטוס
                חוסם. מוצג גם כשהעיצוב חסום: אם היא תבקש שינוי, כדאי שתדע
                שגם הכיתוב מבקש מבט. */}
            {look && (
              <p className="mt-3 border-t border-graphite/10 pt-3 text-[13px] leading-relaxed text-graphite" style={{ textWrap: "pretty" }}>
                {d.fabLettering} {flat ? d.fabLetteringLookHere : d.fabLetteringLook}
              </p>
            )}

            {/* מה שנשאר לנו מהרשימה: הסטטוס והקודים בשורה אחת. חסר משמעות
                ללקוחה — ולכן גם אינו מפחיד — ומספיק לנו כדי לאבחן דוח שלם
                מצילום מסך יחיד, בדיוק כמו `schema_outdated` בהודעת התקלה. */}
            {hasFindings(report) && (
              <p
                title={d.fabRefLabel}
                className="mt-3 border-t border-graphite/10 pt-3 text-[11px] tracking-wide text-mist"
              >
                {/* הקודים לטיניים ונקראים משמאל לימין; העמודה נשארת ימנית כמו
                    שאר הכרטיס, אחרת השורה נתלשת לקצה השני של הקלף. */}
                <span dir="ltr">{fabricationRef(report)}</span>
              </p>
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
                          {/* גרסת-עריכה היא עיצוב ממוספר משלה — המספר מופיע
                              ביומן כדי שאפשר יהיה למסור אותו בלי לנחש איזו
                              גרסה הוא. */}
                          {e.designCode && (
                            <span className="ms-2 font-display text-[11px] font-normal tracking-[0.1em] text-lapis" dir="ltr">
                              {e.designCode}
                            </span>
                          )}
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
          {/* למה הכפתור כבוי — ומה כן פתוח. הפעולה נגזרת ממה שנמצא על המסך:
              רצועת ההצעות מוצגת רק מ-2 ומעלה, ולכן מתחתיה ההזמנה "לבחור
              חלופה" הייתה מפנה לשום מקום. הסיבה עצמה יושבת בכרטיס הייצור
              ולא כאן — כאן רק הצעד הבא. */}
          {(s.applying || blocked) && (
            <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: s.applying ? undefined : STATUS_COLOR.fail, textWrap: "pretty" }}>
              {s.applying
                ? d.resultOrderBusy
                : picks.length > 1
                  ? d.resultOrderBlockedPick
                  : d.resultOrderBlockedAsk(d.fabBlockedTry[cause])}
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

/**
 * מצב הייצור במילה אחת — ושתי מילים בלבד, כי זו השאלה: אפשר להזמין או לא.
 * `warn` נקרא כמו "עובר" מפני שהוא באמת עובר: כפתור ההזמנה נחסם על `fail`
 * ותו לא, ומצב שלישי במילים היה סותר את מה שהמסך מאפשר לעשות. ראו `fabOk`.
 * סטטוס חסר (דוח ישן) נקרא גם הוא כמו "עובר".
 */
function statusWord(status: string | undefined): string {
  return status === "fail" ? d.fabFail : d.fabOk;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-graphite/[0.07] py-2.5 text-sm last:border-b-0">
      <span className="text-ink60">{k}</span>
      <span className="font-semibold text-graphite">{v}</span>
    </div>
  );
}

