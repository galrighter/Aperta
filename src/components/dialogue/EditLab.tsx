"use client";

// dialogue mode — רתמת המדידה של שלב A (‏A0 ב-docs/DIALOGUE_PLAN.md §7).
//
// **מה המסך הזה מודד, ומה הוא במפורש לא.** המטריקה שקובעת היא כמה סבבים עד
// "זה מה שביקשתי" ועלות מצטברת — **לא איכות סבב בודד** (§7.1). לכן המסך בנוי
// סביב *סשן* ולא סביב הרצה: בקשה אמיתית אחת, סבבים זה אחרי זה, בשני המסלולים
// במקביל, עד שאחד מהם מגיע. מסך שמדרג הרצה בודדת היה עונה על השאלה הלא נכונה.
//
// **הלוגיקה אינה כאן.** הציון, הסיכום והדוח יושבים ב-`lib/dialogue/lab.ts`
// כפונקציות טהורות עם טסטים; כאן יש איסוף, תצוגה, וכפתור. כל הקופי ב-
// `i18n/dialogue.ts`. שני אלה יחד הם מה שמאפשר למחוק את הניסוי בלי לפרק את
// המעבדה.
//
// **מה שהמסך לא עושה: הוא לא קונה רנדר.** הוא מחזיר שני פרומפטים ואת מה ששלב
// הטקסט אמר. מי שרוצה לראות תמונה מריץ אותם בכיול הרגיל עם `promptOverride` —
// אותה הפרדה שהמעבדה בנויה עליה מלכתחילה.

import { useCallback, useState } from "react";
import { dialogue } from "@/i18n/dialogue";
import { he } from "@/i18n/he";
import {
  INSTRUCTION_AXES, blindOrder, gradeInstruction, reportLab,
  type ClosureCoverage, type InstructionGrade, type LabArm, type LabRound, type LabSession,
} from "@/lib/dialogue/lab";
import type { EditSpec } from "@/lib/dialogue/spec";
import type { LlmUsage } from "@/lib/llm/core";

const t = dialogue.lab;

/** בקשה אחת מהיומן, כפי ש-`GET /api/admin/prompt-lab` מחזיר אותה. */
interface CorpusRequest {
  runId: string;
  createdAt: string;
  productType: "bracelet" | "ring";
  request: string;
  region: "right" | "center" | "left" | "all" | null;
  lengthMm?: number;
  legacyPrompt: string;
}

interface CompareArm {
  changeRequest: string;
  prompt: string;
}

interface CompareResult {
  textModel: string;
  effort: string;
  baseline: CompareArm;
  dialogue: CompareArm & {
    ok: boolean;
    stageDown: boolean;
    reason?: string;
    attempts?: number;
    ms?: number;
    usage?: LlmUsage;
    decision?: {
      strategy?: string;
      scope?: string;
      image_instruction?: string;
      preserve?: string[];
      needs_clarification?: string;
    };
    spec?: EditSpec;
    /** הסבב צויר מחדש מהמפרט (‏PROMPT_SPEC §6) — לא עריכת ייחוס. */
    respec?: boolean;
    /** כיסוי הסגירה (§7) — כמה דרגות חופש המפרט הכריע, ובאיזה מקור. */
    coverage?: ClosureCoverage;
    grade?: InstructionGrade;
  };
}

/** סבב במסך — `LabRound` של שתי הזרועות, ועוד מה שרק התצוגה צריכה. */
interface Round {
  request: string;
  compare: CompareResult;
  /** הדירוג האנושי, לכל זרוע בנפרד. */
  rating: Record<LabArm, { satisfied: boolean | null; intentCaptured: boolean | null }>;
}

export default function EditLab() {
  const [corpus, setCorpus] = useState<CorpusRequest[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blind, setBlind] = useState(true);
  const [textModel, setTextModel] = useState("");

  /** הבקשה שנמדדת עכשיו, והסבבים שנרשמו עליה. */
  const [picked, setPicked] = useState<CorpusRequest | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  /** מה שיישלח בסבב הבא. מתחיל מהבקשה המקורית, ומשתנה כשהיא לא הספיקה. */
  const [request, setRequest] = useState("");
  const [region, setRegion] = useState<"right" | "center" | "left" | "all">("all");
  const [busy, setBusy] = useState(false);

  /** הסשנים שכבר נסגרו — מהם נבנה הדוח. */
  const [sessions, setSessions] = useState<LabSession[]>([]);

  const loadCorpus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/prompt-lab?limit=10");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      setCorpus(data.requests as CorpusRequest[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const pick = (item: CorpusRequest) => {
    setPicked(item);
    setRounds([]);
    setRequest(item.request);
    setRegion(item.region ?? "all");
  };

  /**
   * סבב אחד, בשני המסלולים.
   *
   * **המפרט המצטבר נלקח מהסבב הקודם**, וזו כל הנקודה של §2.2: בלי זה סבב 5
   * אינו יודע מה נקבע בסבב 2, ומה שנמדד כאן הוא לא המנגנון שנבנה.
   */
  const runRound = useCallback(async () => {
    if (!picked || !request.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const spec = rounds.at(-1)?.compare.dialogue.spec;
      const res = await fetch("/api/admin/prompt-lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productType: picked.productType,
          lengthMm: picked.lengthMm,
          editing: true,
          compare: true,
          editRequest: request,
          region,
          spec,
          textModel: textModel.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      setRounds((prev) => [...prev, {
        request,
        compare: data.compare as CompareResult,
        rating: {
          baseline: { satisfied: null, intentCaptured: null },
          dialogue: { satisfied: null, intentCaptured: null },
        },
      }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [picked, request, region, rounds, textModel]);

  const rate = (index: number, arm: LabArm, patch: Partial<Round["rating"][LabArm]>) => {
    setRounds((prev) => prev.map((r, i) => (
      i === index ? { ...r, rating: { ...r.rating, [arm]: { ...r.rating[arm], ...patch } } } : r
    )));
  };

  /** לסגור את הבקשה הזו ולהעביר אותה לדוח. */
  const closeSession = () => {
    if (!picked || !rounds.length) return;
    setSessions((prev) => [...prev, {
      runId: picked.runId,
      request: picked.request,
      productType: picked.productType,
      rounds: rounds.flatMap((r): LabRound[] => [
        {
          arm: "baseline",
          request: r.request,
          imagePrompt: r.compare.baseline.prompt,
          instruction: null,
          attempts: null,
          satisfied: r.rating.baseline.satisfied,
          intentCaptured: r.rating.baseline.intentCaptured,
          imageCalls: 1,
        },
        {
          arm: "dialogue",
          request: r.request,
          imagePrompt: r.compare.dialogue.prompt,
          instruction: r.compare.dialogue.decision?.image_instruction ?? null,
          attempts: r.compare.dialogue.attempts ?? null,
          stageDown: r.compare.dialogue.stageDown,
          strategy: r.compare.dialogue.decision?.strategy ?? null,
          respec: r.compare.dialogue.respec,
          usage: r.compare.dialogue.usage ?? null,
          satisfied: r.rating.dialogue.satisfied,
          intentCaptured: r.rating.dialogue.intentCaptured,
          imageCalls: 1,
        },
      ]),
    }]);
    setPicked(null);
    setRounds([]);
  };

  const model = rounds.at(-1)?.compare.textModel ?? textModel.trim() ?? "";
  const report = sessions.length ? reportLab(sessions, model) : null;

  return (
    <div className="grid gap-4">
      <header className="grid gap-1 rounded-[2px] border border-graphite/10 bg-white p-3">
        <h2 className="text-base font-bold">{t.title}</h2>
        <p className="text-[13px] text-ink60">{t.lede}</p>
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[13px]">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
            {blind ? t.blindOn : t.blindOff}
          </label>
          <label className="flex items-center gap-1">{t.reportModel}:
            <input
              className="w-48 rounded border border-graphite/20 p-1"
              placeholder="gpt-5.6-luna"
              value={textModel}
              onChange={(e) => setTextModel(e.target.value)}
            />
          </label>
        </div>
      </header>

      {error && <p className="rounded-[2px] bg-red-50 p-2 text-red-700">{t.failed}: {error}</p>}

      {/* ===== הקורפוס ===== */}
      <section className="grid gap-2 rounded-[2px] border border-graphite/10 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">{t.corpusTitle}</h3>
          <button
            className="rounded-[2px] border border-graphite/20 px-3 py-1"
            onClick={() => void loadCorpus()}
            disabled={loading}
          >
            {loading ? t.corpusLoading : t.corpusLoad}
          </button>
        </div>
        {corpus && !corpus.length && <p className="text-ink60">{t.corpusEmpty}</p>}
        {corpus && corpus.length > 0 && (
          <>
            <p className="text-[13px] text-ink60">{t.corpusCount(corpus.length)}</p>
            <ul className="grid gap-1">
              {corpus.map((item) => (
                <li key={item.runId} className="flex flex-wrap items-baseline gap-2 border-t border-graphite/10 pt-1">
                  <button
                    className="rounded-[2px] border border-graphite/20 px-2 py-0.5 text-[12px]"
                    onClick={() => pick(item)}
                  >
                    {picked?.runId === item.runId ? t.corpusPicked : t.corpusPick}
                  </button>
                  <span className="flex-1">{item.request}</span>
                  <span className="text-[12px] text-ink60">
                    {item.productType === "ring" ? he.ring : he.bracelet}
                    {item.region ? ` · ${he.design.regions[item.region]}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ===== הסבבים ===== */}
      {picked && (
        <section className="grid gap-3 rounded-[2px] border border-graphite/10 bg-white p-3">
          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className="font-bold">{t.request}</span>
              <textarea
                className="min-h-16 rounded border border-graphite/20 p-2"
                placeholder={t.requestPlaceholder}
                value={request}
                onChange={(e) => setRequest(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1">{t.region}:
                <select
                  className="rounded border border-graphite/20 p-1"
                  value={region}
                  onChange={(e) => setRegion(e.target.value as typeof region)}
                >
                  {(["right", "center", "left", "all"] as const).map((r) => (
                    <option key={r} value={r}>{he.design.regions[r]}</option>
                  ))}
                </select>
              </label>
              <button
                className="rounded-[2px] bg-graphite px-4 py-1.5 text-white"
                onClick={() => void runRound()}
                disabled={busy || !request.trim()}
              >
                {busy ? t.running : t.run}
              </button>
              {rounds.length > 0 && (
                <button
                  className="rounded-[2px] border border-graphite/20 px-3 py-1"
                  onClick={closeSession}
                >
                  {t.reportTitle} ←
                </button>
              )}
            </div>
          </div>

          {rounds.map((round, i) => (
            <RoundView
              key={i}
              index={i}
              round={round}
              blind={blind}
              onRate={rate}
            />
          ))}
        </section>
      )}

      {/* ===== הדוח ===== */}
      {report && (
        <section className="grid gap-2 rounded-[2px] border border-graphite/10 bg-white p-3">
          <h3 className="font-bold">{t.reportTitle}</h3>
          <p className="text-[13px] text-ink60">
            {t.reportDecided(report.decided, report.total)} — {t.reportDecidedHint}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-3">
            <Stat label={`${t.reportRounds} · ${t.armBaseline}`} value={fmt(report.avgRounds.baseline, 2)} />
            <Stat label={`${t.reportRounds} · ${t.armDialogue}`} value={fmt(report.avgRounds.dialogue, 2)} />
            <Stat
              label={`${t.reportUsd} · ${t.armBaseline}`}
              value={report.avgUsd.baseline === null ? t.reportUsdUnknown : `$${report.avgUsd.baseline.toFixed(4)}`}
            />
            <Stat
              label={`${t.reportUsd} · ${t.armDialogue}`}
              value={report.avgUsd.dialogue === null ? t.reportUsdUnknown : `$${report.avgUsd.dialogue.toFixed(4)}`}
            />
            <Stat
              label={t.reportFirstParse}
              value={report.firstParseRate === null ? "—" : `${Math.round(report.firstParseRate * 100)}%`}
            />
            <Stat
              label={t.gradeTitle}
              value={report.instruction.avgCovered === null
                ? "—"
                : `${report.instruction.avgCovered.toFixed(2)} / 4 · ${t.gradeHebrew}: ${report.instruction.hebrew}`}
            />
          </dl>
          <button
            className="justify-self-start rounded-[2px] border border-graphite/20 px-3 py-1 text-[13px]"
            onClick={() => {
              // הורדה מקומית ולא שמירה לשרת: הדוח הוא תוצר מדידה חד־פעמי,
              // ועמודה בשבילו הייתה מיגרציה — מה שהמסלול הזה מתחייב לא לעשות.
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "dialogue-edit-lab.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t.reportExport}
          </button>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid">
      <dt className="text-[12px] text-ink60">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

function fmt(n: number | null, digits: number): string {
  return n === null ? "—" : n.toFixed(digits);
}

/**
 * סבב אחד: שתי הזרועות זו לצד זו.
 *
 * **בדירוג עיוור השמות אינם מוצגים**, והסדר נגזר מהבקשה (`blindOrder`) ולא
 * מהמקום בקוד: מדרג שיודע איזה צד הוא החדש מדרג את הציפייה שלו, ומדרג שלומד
 * שהחדש תמיד משמאל יודע אחרי שלוש בקשות (§7.1).
 *
 * **הציון האוטומטי מוסתר גם הוא בדירוג עיוור** — הוא נמדד רק על הזרוע החדשה,
 * ולכן הצגתו הייתה מסגירה איזו היא.
 */
function RoundView({
  index, round, blind, onRate,
}: {
  index: number;
  round: Round;
  blind: boolean;
  onRate: (index: number, arm: LabArm, patch: Partial<Round["rating"][LabArm]>) => void;
}) {
  const order = blind ? blindOrder(round.request) : (["baseline", "dialogue"] as const);
  const label = (arm: LabArm, at: number) =>
    blind ? (at === 0 ? t.armBlindA : t.armBlindB)
      : arm === "baseline" ? t.armBaseline : t.armDialogue;

  return (
    <div className="grid gap-2 border-t border-graphite/10 pt-3">
      <h4 className="font-bold">{t.roundTitle(index + 1)} — {round.request}</h4>
      <div className="grid gap-3 md:grid-cols-2">
        {order.map((arm, at) => (
          <ArmView
            key={arm}
            title={label(arm, at)}
            arm={arm}
            round={round}
            blind={blind}
            onRate={(patch) => onRate(index, arm, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function ArmView({
  title, arm, round, blind, onRate,
}: {
  title: string;
  arm: LabArm;
  round: Round;
  blind: boolean;
  onRate: (patch: Partial<Round["rating"][LabArm]>) => void;
}) {
  const side = arm === "baseline" ? round.compare.baseline : round.compare.dialogue;
  const rich = arm === "dialogue" ? round.compare.dialogue : null;
  const rating = round.rating[arm];
  // הציון האוטומטי נגזר מההוראה עצמה ולא נלקח מהשרת: זו אותה פונקציה, והוא
  // גם צריך להיות זמין על סבבים שנטענו מדוח שיוצא.
  const grade = rich?.decision?.image_instruction
    ? gradeInstruction(rich.decision.image_instruction)
    : null;

  return (
    <div className="grid gap-2 rounded-[2px] border border-graphite/10 p-2">
      <h5 className="font-bold">{title}</h5>

      {rich?.stageDown && <p className="text-[12px] text-amber-700">{t.stageDown}</p>}

      <Field label={t.imagePrompt}>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-snug">{side.changeRequest}</pre>
      </Field>

      {!blind && rich && (
        <>
          <Field label={t.instruction}>
            <p className="text-[12px]" dir="ltr">
              {rich.decision?.image_instruction ?? t.instructionNone}
            </p>
          </Field>
          {rich.decision?.preserve?.length ? (
            <Field label={t.preserve}>
              <ul className="list-disc pr-4 text-[12px]" dir="ltr">
                {rich.decision.preserve.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </Field>
          ) : null}
          {rich.decision?.scope && <Field label={t.scope}><p className="text-[12px]" dir="ltr">{rich.decision.scope}</p></Field>}
          {/* respec מול ייחוס (§6). מוצג רק כשהשלב רץ — ורק מחוץ לדירוג
              עיוור, כי הוא מסגיר איזו זרוע זו (הבלוק כולו כזה). */}
          {rich.ok && (
            <p className="text-[12px] text-ink60">
              {rich.respec ? t.respecOn : t.respecOff}
              {rich.decision?.strategy && rich.decision.strategy !== (rich.respec ? "respec" : "reference_edit")
                ? ` · ${t.strategyLabel}: ${rich.decision.strategy}`
                : ""}
            </p>
          )}
          {rich.coverage && (
            <Field label={t.coverage}>
              <p className="text-[12px]">
                {t.coverageLine(
                  rich.coverage.decided,
                  rich.coverage.total,
                  rich.coverage.bySource.user,
                  rich.coverage.bySource.inferred,
                  rich.coverage.bySource.chosen,
                )}
              </p>
            </Field>
          )}
          {rich.decision?.needs_clarification && (
            <Field label={t.clarification}>
              <p className="text-[12px]" dir="ltr">{rich.decision.needs_clarification}</p>
            </Field>
          )}
          {grade && (
            <Field label={t.gradeTitle}>
              <p className="text-[12px]">
                {t.gradeCovered(grade.covered)} · {t.gradeWords(grade.words)}
                {grade.hebrew && ` · ${t.gradeHebrew}`}
                {grade.echo && ` · ${t.gradeEcho}`}
              </p>
              <p className="text-[12px] text-ink60">
                {INSTRUCTION_AXES.filter((a) => grade.axes[a]).map((a) => t.axes[a]).join(" · ") || "—"}
              </p>
            </Field>
          )}
          {rich.attempts != null && (
            <p className="text-[12px] text-ink60">{t.attempts(rich.attempts)}{rich.ms ? ` · ${Math.round(rich.ms / 100) / 10}s` : ""}</p>
          )}
        </>
      )}

      {/* ===== הדירוג — שתי שאלות נפרדות, כי הן שני צירים (§5.3) ===== */}
      <div className="grid gap-1 border-t border-graphite/10 pt-2 text-[12px]">
        <p className="font-bold">{t.ratingTitle}</p>
        <Toggle
          label={t.satisfied}
          hint={t.satisfiedHint}
          value={rating.satisfied}
          onChange={(v) => onRate({ satisfied: v })}
          onLabel={t.satisfied}
          offLabel={t.notSatisfied}
        />
        <Toggle
          label={t.intentCaptured}
          hint={t.intentHint}
          value={rating.intentCaptured}
          onChange={(v) => onRate({ intentCaptured: v })}
          onLabel={t.intentCaptured}
          offLabel={t.intentMissed}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-[11px] text-ink60">{label}</span>
      {children}
    </div>
  );
}

/** שלושה מצבים ולא שניים: `null` הוא "טרם דורג", והוא לא אותו דבר כמו "לא". */
function Toggle({
  label, hint, value, onChange, onLabel, offLabel,
}: {
  label: string;
  hint: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span title={hint} className="text-ink60">{label}:</span>
      <button
        className={`rounded-[2px] px-2 py-0.5 ${value === true ? "bg-graphite text-white" : "border border-graphite/20"}`}
        onClick={() => onChange(value === true ? null : true)}
      >
        {onLabel}
      </button>
      <button
        className={`rounded-[2px] px-2 py-0.5 ${value === false ? "bg-graphite text-white" : "border border-graphite/20"}`}
        onClick={() => onChange(value === false ? null : false)}
      >
        {offLabel}
      </button>
    </div>
  );
}
