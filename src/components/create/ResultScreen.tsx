"use client";

// handoff §6 — שני מצבי תצוגה, סימון אזורים, בקשה למודל, יומן גרסאות,
// כוונון מהיר ומצב ייצור. מצב הייצור מוזן מדוח הוולידציה האמיתי של המנוע.
import { he } from "@/i18n/he";
import { designCode } from "@/lib/designCode";
import {
  Eyebrow, ScreenTitle, CardLabel, PrimaryBtn, Slider, COBALT,
} from "./ui";
import { FlatDrawing, RegionChips, type IssueMark } from "./Artwork";
import { RolledStage } from "./RolledStage";
import {
  activeEntry, countCuts, cutoutsInner, frameLengthMm, frameWidthMm, gapOf, type CreateState,
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
  const cutouts = cutoutsInner(entry?.svg);
  const L = frameLengthMm(s, entry);
  const W = frameWidthMm(s, entry);
  const report = entry?.report ?? null;
  const flat = s.resultMode === "flat";
  // הצעות שאפשר לייצר בלבד. השרת כבר מסנן; הסינון כאן שומר גם על תשובה ישנה
  // שנשמרה במצב לפני השינוי.
  const picks = (entry?.candidates ?? []).filter((c) => c.report.status !== "fail");

  // כל מה שהוולידציה סימנה, כדי לצייר את זה על הפריסה. המנוע כבר מחשב מיקום
  // לכל ממצא; עד עכשיו זה נזרק והלקוחה קיבלה פסק דין בלי ראיה.
  const marks: IssueMark[] = (report?.checks ?? [])
    .filter((c) => c.status !== "pass")
    .flatMap((c) =>
      c.locations.map((l) => ({ ...l, status: c.status as IssueMark["status"] })),
    );

  const status = report?.status ?? "pass";
  const statusText =
    status === "pass" ? d.fabOk : status === "warn" ? d.fabWarn : d.fabFail;
  const statusColor = STATUS_COLOR[status];

  return (
    <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-10">
      <Eyebrow>{d.resultEyebrow}</Eyebrow>
      <ScreenTitle>{s.imageRole === "ready" ? d.resultTitleReady : d.resultTitle}</ScreenTitle>

      {/* המספר הסידורי, ליד העיצוב עצמו — זה מה שמוסרים כשמדברים עליו */}
      {designCode(s.designSerial) && (
        <p className="mt-2 font-display text-[12px] tracking-[0.14em] text-mist">
          {d.codeLabel} <span className="text-cobalt" dir="ltr">{designCode(s.designSerial)}</span>
        </p>
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

      <div className={`grid items-start gap-8 ${flat ? "lg:grid-cols-[1.5fr_1fr]" : "lg:grid-cols-1"}`}>
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
              מוצגות רק הצעות שאפשר לייצר; מה שנכשל בוולידציה לא מוצע לבחירה. */}
          {picks.length > 1 && (
            <div className="mt-4">
              <CardLabel>{d.candidatesLabel}</CardLabel>
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
                      aria-label={`${d.candidatesLabel} ${i + 1} — ${
                        c.report.status === "pass" ? d.fabOk : c.report.status === "warn" ? d.fabWarn : d.fabFail
                      }${on ? ` · ${d.candidateChosen}` : ""}`}
                      title={c.report.status === "pass" ? d.fabOk : c.report.status === "warn" ? d.fabWarn : d.fabFail}
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
                          style={{ background: STATUS_COLOR[c.report.status] }}
                        />
                        {on && (
                          <span className="text-[11px] font-semibold tracking-wide text-graphite">
                            {d.candidateChosen}
                          </span>
                        )}
                      </span>
                      <svg viewBox={`-1 -1 ${L + 2} ${W + 2}`} className="h-auto w-full" role="img">
                        <rect x="0" y="0" width={L} height={W} fill="none"
                          stroke="rgba(32,35,38,0.3)" strokeWidth={Math.max(0.2, W / 90)} />
                        <g dangerouslySetInnerHTML={{ __html: cutoutsInner(c.svg) }}
                          fill="none" stroke={COBALT} strokeWidth={Math.max(0.2, W / 110)} />
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
            <CardLabel>{`${d.editReqTitle} · ${d.regions[s.region ?? "all"]}`}</CardLabel>
            <textarea
              value={s.editReq}
              onChange={(e) => set({ editReq: e.target.value })}
              placeholder={d.editReqPlaceholder}
              className="w-full resize-y rounded-[2px] border border-graphite/20 bg-porcelain p-3.5 text-[15px] leading-relaxed transition-colors focus:border-cobalt focus:outline-none"
              style={{ minHeight: 88 }}
            />
            <div className="mt-3">
              <button
                type="button"
                onClick={onApply}
                disabled={s.applying || !s.editReq.trim()}
                className="rounded-[2px] px-6 py-3 text-[15px] font-semibold text-white transition-colors disabled:cursor-not-allowed"
                style={{ background: s.applying || !s.editReq.trim() ? "rgba(49,91,255,0.35)" : COBALT }}
              >
                {s.applying ? d.editApplying : d.editApply}
              </button>
            </div>
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
            <Row k={d.fabOpenArea} v={report ? `${report.metrics.openAreaPct.toFixed(1)}%` : "—"} />
            <Row
              k={d.fabWeight}
              v={report ? `${report.metrics.estWeightGrams.toFixed(1)} ${he.grams}` : "—"}
            />
            <Row k={d.fabFormat} v={d.fabFormatVal} />
            <Row k={d.specCuts} v={String(entry ? countCuts(entry.svg) : 0)} />

            {/* ממצאים מהוולידציה */}
            {report && report.checks.some((c) => c.status !== "pass") && (
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-graphite/10 pt-3">
                {report.checks
                  .filter((c) => c.status !== "pass")
                  .slice(0, 4)
                  .map((c, i) => (
                    <li key={i} className="text-[13px] leading-snug" style={{ color: c.status === "fail" ? "#c0413b" : "#b9762e" }}>
                      {c.message}
                      {/* כמה, ולא רק מה. "פתח קטן מדי" על ממצא אחד ועל שמונה
                          הם שני מצבים שונים לגמרי מבחינת מה שצריך לעשות. */}
                      {c.locations.length > 0 && (
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

          {/* כוונון מהיר — רק במצב פריסה */}
          {flat && (
            <div className="border border-graphite/10 bg-white p-6">
              <CardLabel>{d.tuneTitle}</CardLabel>
              <div className="flex flex-col gap-5">
                <Slider
                  label={d.tuneDensity}
                  min={4}
                  max={16}
                  value={s.cutDensity}
                  onChange={(v) => set({ cutDensity: v })}
                />
                <Slider
                  label={d.tuneBridge}
                  min={1}
                  max={6}
                  value={s.bridgeMm}
                  onChange={(v) => set({ bridgeMm: v })}
                />
              </div>
            </div>
          )}

          {/* יומן גרסאות */}
          <div className="border border-graphite/10 bg-white p-6">
            <CardLabel>{d.versionsTitle}</CardLabel>
            {s.edits.length <= 1 ? (
              <p className="text-[13px] text-ink60">{d.versionsEmpty}</p>
            ) : (
              <ol className="flex flex-col">
                {s.edits.map((e, i) => {
                  const on = (s.activeEdit < 0 ? s.edits.length - 1 : s.activeEdit) === i;
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
                          {e.text || d.versionOriginal}
                        </div>
                      </div>
                      {!on && (
                        <button
                          type="button"
                          onClick={() => onRestore(i)}
                          className="flex-none whitespace-nowrap text-[12px] text-cobalt underline-offset-4 hover:underline"
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

          <PrimaryBtn onClick={onOrder} full>
            {d.resultOrder}
          </PrimaryBtn>
        </div>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-graphite/[0.07] py-2.5 text-sm last:border-b-0">
      <span className="text-ink60">{k}</span>
      <span className="font-semibold text-graphite">{v}</span>
    </div>
  );
}

