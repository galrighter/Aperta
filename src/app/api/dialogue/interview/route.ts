import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleRouteError, parseBody } from "@/lib/api";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { clientIp } from "@/lib/ip";
import { coerceEditSpec } from "@/lib/dialogue/spec";
import {
  askedOf, coerceInterviewTurns, runInterviewDirections, runInterviewTurn,
} from "@/lib/dialogue/interview";

// dialogue mode — נתיב הראיון (שלב B): סבב שיחה אחד, או הסגירה לכיוונים.
//
// **למה נתיב משלו ולא `/api/generate`.** הראיון רץ לפני שקיים עיצוב בכלל —
// אין `designId`, אין בעלות לבדוק, ואין רנדר. מה שיש הוא קריאת מודל טקסט
// לכל סבב, וזה כל מה שהנתיב עושה: מקבל את התמליל והמפרט שהצטבר, מחזיר את
// הסבב הבא. המצב כולו אצל הלקוח — אין טבלת שיחות ואין מיגרציה; מה שנשמר
// בסוף נוסע בגוף בקשת היצירה ונרשם ביומן שלה (`RunInputs.interview`).
//
// **השער היחיד הוא קצב.** כמו `/api/inquiries`: אין מייל ואין חשבון בשלב
// הזה של המשפך, ודרישת הזדהות לפני שאלה ראשונה הייתה הורגת את המסלול. סבב
// עולה ~$0.01 — המכסה לפי IP היא מה שמפריד את זה מכרטיס אשראי פתוח.

/** הסגירה יכולה לקחת עד ~150 שנ׳ (שני ניסיונות, N מפרטים מלאים) — ראה
 *  התקציבים ב-interview.ts. ברירת המחדל של הפלטפורמה קצרה מזה. */
export const maxDuration = 180;

/** ראיון שלם הוא ‎6–10 סבבים; 40 לשעה מכילים כמה התחלות-מחדש בלי לממן הצפה. */
const IP_WINDOW_MS = 60 * 60_000;
const IP_MAX = 40;

const turnSchema = z.object({
  role: z.enum(["interviewer", "customer"]),
  text: z.string().min(1).max(2000),
});

const schema = z.object({
  phase: z.enum(["turn", "directions"]).default("turn"),
  product: z.enum(["bracelet", "ring"]),
  turns: z.array(turnSchema).min(1).max(40),
  /** המפרט המצטבר, כפי שהסבב הקודם החזיר. מנוקה ב-`coerceEditSpec` —
   *  גוף בקשה אינו הצהרה. */
  spec: z.unknown().optional(),
  /** ‏`utm_content` — הקריאייטיב שהביא אותה (‏PROMPT_SPEC §3.4). */
  utm: z.string().max(200).optional(),
  /** לסגירה בלבד: הסיכום שהלקוחה אישרה. */
  summary: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);

    if (await tooManyAttempts(`dialogue-interview:${clientIp(req)}`, IP_WINDOW_MS, IP_MAX)) {
      throw new ApiError("rate_limited", "Too many requests, try again later", 429);
    }

    const turns = coerceInterviewTurns(body.turns);
    if (!turns.length) throw new ApiError("bad_request", "empty transcript", 400);
    const spec = coerceEditSpec(body.spec);

    if (body.phase === "directions") {
      // הסגירה רצה רק אחרי אישור סיכום — המסך אינו מציע אותה בלעדיו, וגם
      // כאן היא נדחית: כיוונים בלי מפרט מוסכם הם בדיוק הבריף החד-פעמי
      // שהראיון בא להחליף.
      if (!spec || !body.summary?.trim()) {
        throw new ApiError("bad_request", "directions need an agreed spec and summary", 400);
      }
      const out = await runInterviewDirections({
        productType: body.product,
        spec,
        summary: body.summary,
      });
      if (!out.ok) {
        // הכשל חוזר למסך, לא נבלע: אין כאן מסלול-של-היום ליפול אליו, ומה
        // שהמסך עושה איתו — "לנסות שוב" או מעבר לעורך — הוא החלטה שלו.
        throw new ApiError("interview_failed", out.reason.slice(0, 300), 502);
      }
      return NextResponse.json({
        directions: out.json,
        renderJson: out.renderJson,
        designsCount: out.spec.designs.length,
      });
    }

    const out = await runInterviewTurn({
      productType: body.product,
      turns,
      spec,
      // המניין מהתמליל עצמו, לא ממונה שהלקוח שולח — ראה askedOf.
      asked: askedOf(turns),
      utm: body.utm ?? null,
    });
    if (!out.ok) {
      throw new ApiError("interview_failed", out.reason.slice(0, 300), 502);
    }
    return NextResponse.json({
      spec: out.decision.spec,
      ask: out.decision.ask,
      summary: out.decision.summary,
      expectation: out.decision.expectation ?? null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
