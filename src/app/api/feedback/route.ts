import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError, ApiError } from "@/lib/api";
import { requireAccountId } from "@/lib/account";
import { getAccount } from "@/lib/db/accounts";
import { getDesign, type DesignRow } from "@/lib/db/designs";
import { createInquiry } from "@/lib/db/inquiries";
import { sendMail, mailConfigured, notifyAddress } from "@/lib/mail";
import { feedbackAckMail, feedbackNotifyMail } from "@/lib/mailTemplates";
import { designCode } from "@/lib/designCode";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { clientIp } from "@/lib/ip";
import { he } from "@/i18n/he";

// משוב על תקלה חוזרת ביצירה — נשלח ממסך השגיאה עצמו, אחרי ש"נסו שוב" נכשל
// גם הוא. שלושה דברים קורים כאן, בסדר הזה: הפנייה נשמרת (inquiries — אותה
// טבלה ואותו בק־אופיס כמו טופס צור-קשר), גל מקבל התראה עם פרטי הכשל, והמשתמש
// מקבל מייל אישור עם קישור שממשיך את העיצוב מהנקודה שבה עצר.
//
// המסלול דורש חשבון מחובר — יצירה ממילא רצה רק אחרי כניסה, ולכן מי שמגיע
// למסך השגיאה תמיד מזוהה. זה גם מה שנותן כתובת מאומתת למייל האישור, בלי לבקש
// מהמשתמש להקליד אותה מחדש בתוך תקלה.

/** מכסה נדיבה: תקלה אמיתית מייצרת דיווח אחד-שניים, הצפה מייצרת מאות. */
const PER_ACCOUNT_WINDOW_MS = 60 * 60_000;
const PER_ACCOUNT_MAX = 5;
const IP_WINDOW_MS = 60 * 60_000;
const IP_MAX = 30;

const schema = z.object({
  /** העיצוב שנכשל, כשנוצר. הכשל יכול לקרות גם לפני שנוצרה רשומה בשרת. */
  designId: z.string().uuid().optional(),
  /** מה שהמשתמש כתב. רשות — הדיווח עצמו הוא ההודעה. */
  message: z.string().trim().max(2000).optional(),
  /** ההודעה שהוצגה על המסך, והמזהה הטכני שלצידה (`internal · 500`). */
  errorMessage: z.string().trim().max(300).optional(),
  errorDetail: z.string().trim().max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const accountId = await requireAccountId(req);
    const body = await parseBody(req, schema);

    if (await tooManyAttempts(`feedback:ip:${clientIp(req)}`, IP_WINDOW_MS, IP_MAX)) {
      throw new ApiError("rate_limited", "Too many requests, try again later", 429);
    }
    if (await tooManyAttempts(`feedback:${accountId}`, PER_ACCOUNT_WINDOW_MS, PER_ACCOUNT_MAX)) {
      throw new ApiError("rate_limited", "Too many feedback reports, try again later", 429);
    }

    const account = await getAccount(accountId);
    if (!account?.email) throw new ApiError("account_required", "Sign in before sending feedback", 401);

    // העיצוב נטען רק כדי להעשיר את הדיווח ואת קישור ההמשך. מזהה שאינו של
    // החשבון הזה פשוט נזרק — משוב על תקלה לא צריך להיות דרך לגשש עיצובים
    // של אחרים, וגם לא להיכשל בגלל מזהה ישן שנשאר בדפדפן.
    let design: DesignRow | null = null;
    if (body.designId) {
      design = await getDesign(body.designId).catch(() => null);
      if (design && design.profile_id !== accountId) design = null;
    }
    const ref = design ? designCode(design.serial) : null;

    const errorShown = [body.errorMessage, body.errorDetail].filter(Boolean).join(" · ") || "—";
    const name = account.name?.trim() || account.email.split("@")[0];

    // הפנייה נשמרת כ-kind "contact" ולא כסוג חדש: טבלת inquiries נועלת את
    // הסוגים ב-CHECK, והבחנה נוספת שם גוררת מיגרציה ושינוי בבק־אופיס בשביל
    // שדה שממילא נקרא בעין. הכותרת הקבועה בראש ההודעה היא ההבחנה.
    const inquiry = await createInquiry({
      kind: "contact",
      name,
      email: account.email,
      product_type: design?.product_type ?? null,
      message: [
        he.mail.feedbackNotifySubject,
        "",
        ref ? `${he.mail.feedbackDesign}: ${ref}` : null,
        design ? `${he.mail.feedbackDesign} (id): ${design.id}` : null,
        `${he.mail.feedbackError}: ${errorShown}`,
        "",
        `${he.mail.feedbackUserSaid}:`,
        body.message || he.mail.feedbackUserSaidEmpty,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    });

    // מכאן הפנייה כבר שמורה — כשל בדואר לא מחזיר שגיאה למי שבדיוק דיווח על
    // תקלה. מה שכן חוזר הוא `mailed`: המסך מבטיח מייל אישור רק אם הוא באמת יצא.
    let mailed = false;
    if (mailConfigured()) {
      const admin = feedbackNotifyMail({
        name,
        email: account.email,
        designRef: ref,
        errorShown,
        message: body.message ?? "",
      });
      const adminRes = await sendMail({
        to: notifyAddress(),
        subject: admin.subject,
        text: admin.text,
        replyTo: account.email,
      });
      if (!adminRes.ok) console.error("feedback notification failed:", adminRes.error);

      const ack = feedbackAckMail({ name, code: ref });
      const ackRes = await sendMail({
        to: account.email,
        subject: ack.subject,
        text: ack.text,
        html: ack.html,
      });
      if (!ackRes.ok) console.error("feedback acknowledgement failed:", ackRes.error);
      mailed = ackRes.ok;
    } else {
      console.error("feedback notification skipped: no mail provider configured");
    }

    return NextResponse.json({ ok: true, id: inquiry.id, mailed }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
