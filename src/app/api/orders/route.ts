import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { readAccountId } from "@/lib/account";
import { requireDesignAccess } from "@/lib/designAccess";
import {
  createOrderOnce,
  listOrders,
  countRecentOrdersFromEmail,
  ORDER_STATUSES,
  type OrderRow,
  type OrderStatus,
} from "@/lib/db/orders";
import { getVersion } from "@/lib/db/designs";
import { addressLineValid, nameValid, zipValid } from "@/lib/address";
import { designSampleCode } from "@/lib/designCode";
import { priceFor, type ReferralRule } from "@/lib/pricing";
import { resolveReferralCode } from "@/lib/db/referralCodes";
import { sendMail, mailConfigured, notifyAddress } from "@/lib/mail";
import { sendTelegram } from "@/lib/alerts/telegram";
import { SITE } from "@/lib/site.config";
import { orderNotifyMail, orderCustomerAckMail } from "@/lib/mailTemplates";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { clientIp } from "@/lib/ip";
import { formatPhone, isValidPhone } from "@/lib/phone";

// ההזמנה עצמה (docs/TODO.md B1–B3). מסלול ציבורי ליצירה, אדמין לקריאה.
//
// שלושה דברים שהמסלול הזה עושה אחרת מ-`/api/inquiries`, וכולם אותה החלטה —
// שהשרת יחזיק את האמת ולא הדפדפן:
//   · **המחיר מחושב כאן** מ-`lib/pricing`, מאותה פונקציה שהמשפך מציג. מחיר
//     שהדפדפן שולח הוא מחיר שאפשר לזייף, וגם כשאיש לא מזייף — הוא ניתוק בין
//     מה שהוצג למה שנשמר.
//   · **מזהה העיצוב מאומת** מול המסד, ומספר ההזמנה נגזר מה-serial שם ולא
//     מהמחרוזת שהלקוח שלח.
//   · **הסיכום נבנה מהשורה** (lib/orderSummary), כך שההתראה אלינו והאישור
//     ללקוחה הם בהכרח אותו טקסט.

const MAX_PER_EMAIL_PER_DAY = 10;

const createSchema = z.object({
  designId: z.string().uuid().nullable().optional(),
  versionId: z.string().uuid().nullable().optional(),
  /**
   * מזהה ניסיון השליחה (0020). נוצר פעם אחת במסך הצ'קאאוט ונשלח בכל ניסיון,
   * כך ש"נסי שוב" אחרי רשת שנתקעה אינו יוצר הזמנה שנייה.
   */
  idempotencyKey: z.string().uuid().optional(),
  /**
   * אישור התנאים, ברגע ההזמנה. `literal(true)` ולא boolean: ערך אחר אינו
   * "לא אישרה" — הוא בקשה לשמור הזמנה בלי הדבר שנדרש כדי ליצור אותה.
   */
  termsAccepted: z.literal(true),
  /** הסכמה לדבר פרסומת. נפרדת מההזמנה, וברירת המחדל שלה היא לא. */
  marketingOptIn: z.boolean().optional(),
  /**
   * הסכום שהוצג על המסך. השרת מחשב את המחיר בעצמו ממילא — זה כאן אינו מקור
   * אלא **בדיקת התאמה**: אם המחירון השתנה בזמן שהמסך היה פתוח, ההזמנה נעצרת
   * במקום להישמר בסכום אחר מזה שהלקוחה אישרה.
   */
  displayedTotal: z.number().nonnegative().optional(),
  /**
   * קוד הפניה (0026). מה שמגיע כאן הוא **מחרוזת בלבד** — המחיר שמאחוריה נשלף
   * מהמסד כאן, ולעולם לא מגיע מהדפדפן. ראו את פתירת הקוד למטה.
   */
  referralCode: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(120).refine(nameValid, { message: "invalid name" }),
  email: z.string().trim().email().max(200),
  // הטלפון נבדק ונשמר בצורה אחת. הבדיקה בדפדפן היא שירות ללקוחה; זו כאן היא
  // מה שקובע — מה שנשלח לשרת אינו בהכרח מה שהמסך הציג.
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => !v || isValidPhone(v), { message: "invalid phone" })
    .transform((v) => (v ? formatPhone(v) : v))
    .optional(),
  street: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || addressLineValid(v), { message: "invalid street" })
    .optional(),
  city: z
    .string()
    .trim()
    .max(120)
    .refine((v) => !v || addressLineValid(v), { message: "invalid city" })
    .optional(),
  zip: z.string().trim().max(20).refine(zipValid, { message: "invalid zip" }).optional(),
  productType: z.enum(["bracelet", "ring"]),
  circumferenceMm: z.number().positive().max(400),
  widthMm: z.number().positive().max(100),
  fit: z.enum(["tight", "regular", "loose"]).optional(),
  // מה שהיה כאן ואיננו: `density`. הוא נשלח לצורך התמחור בלבד ומעולם לא נשמר
  // על ההזמנה, ומרגע שהמחיר קבוע למוצר לא נותר לו לאן ללכת. לקוח ישן שממשיך
  // לשלוח אותו אינו נשבר — zod מסנן שדה שאינו בסכימה בשקט.
  cuts: z.number().int().min(0).max(10_000).optional(),
  brief: z.string().trim().max(4000).optional(),
  // honeypot נגד בוטים — אמור להישאר ריק
  company: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, createSchema);

    // בוט מילא את ה-honeypot: מחזירים הצלחה בלי לשמור.
    if (body.company) return NextResponse.json({ ok: true }, { status: 201 });

    // לפי IP (30 לשעה) לצד לפי מייל: המכסה לפי מייל נעקפת בשינוי המחרוזת, וכל
    // הזמנה שולחת שני מיילים דרך Resend — וקטור הצפה/reflection.
    if (await tooManyAttempts(`order:${clientIp(req)}`, 60 * 60_000, 30)) {
      throw new ApiError("rate_limited", "Too many requests, try again later", 429);
    }

    if ((await countRecentOrdersFromEmail(body.email)) >= MAX_PER_EMAIL_PER_DAY) {
      throw new ApiError("rate_limited", "Too many orders from this email today", 429);
    }

    // מי מזמינה, כשידוע. לא כל הזמנה חייבת חשבון — מסלול הגיבוי קיים — אבל
    // הזמנה של מי שמחוברת נקשרת אליה, ולא רק לבעלים של העיצוב.
    const accountId = await readAccountId(req);

    // העיצוב, אם נמסר. הזמנה בלי עיצוב עדיין נשמרת — הלקוחה השלימה משפך
    // והכסף אמיתי גם אם המזהה אבד — אבל מזהה **שגוי** לא נשמר כאילו הוא נכון.
    let ref: string | null = null;
    let profileId: string | null = accountId;
    let versionId: string | null = null;
    // צילום המידות לייצור (0022). נקרא מהעיצוב **כאן**, ברגע ההזמנה, ולא
    // מהשורה החיה בזמן שהאדמין פותח את ההזמנה — עריכה של מידה אחרי ההזמנה
    // שינתה עד כה בשקט את הוראות הערגול.
    let snapshot: { length_mm: number; gap_mm: number; thickness_mm: number } | null = null;
    if (body.designId) {
      // `requireDesignAccess` ולא `getDesign`: כאן ישבה הדלת האחרונה שנשארה
      // פתוחה אחרי שכל שאר המסלולים נסגרו. מי שהחזיק uuid של עיצוב זר יכול היה
      // ליצור עליו הזמנה — ומייל האישור, שנבנה מהשורה, היה מגיע לכתובת שהוא
      // עצמו שלח, כלומר תיאור העיצוב של אדם אחר נשלח למי שביקש אותו.
      // `known: accountId` — הזהות כבר נפתרה כאן למעלה, ופתירה שנייה באותה
      // בקשה תיפול בדיוק כשהאסימון פג: הראשונה מסובבת את ה-refresh token,
      // והשנייה קוראת את העוגייה כפי שהגיעה. ראו `designAccess`.
      const design = await requireDesignAccess(req, body.designId, { known: accountId });
      ref = designSampleCode(design);
      profileId = design.profile_id ?? accountId;
      snapshot = {
        length_mm: Number(design.length_mm),
        gap_mm: Number(design.gap_mm),
        thickness_mm: Number(design.thickness_mm),
      };
      // הגרסה שהוזמנה. אם לא נמסרה — הנוכחית. אם נמסרה גרסה של עיצוב אחר, היא
      // נזרקת: קובץ חיתוך של מישהו אחר הוא הטעות היקרה ביותר כאן.
      const candidate = body.versionId ?? design.current_version_id;
      if (candidate) {
        // **גרסה זרה וכשל שליפה אינם אותו דבר.** קודם שניהם נבלעו באותו
        // `.catch(() => null)`, וכשל DB חולף הפיל את ההזמנה בשקט חזרה
        // ל"בלי גרסה" — כלומר הייצוא נפל ל-current, גרסה שהלקוחה לא אישרה,
        // בלי שום אינדיקציה. עכשיו כשל שליפה מפיל את הבקשה: הלקוחה תלחץ שוב,
        // וזה עדיף פי כמה על הזמנה ששקטה נקשרה לגרסה אחרת.
        const version = await getVersion(candidate).catch((err) => {
          if (err instanceof ApiError && err.code === "not_found") return null;
          throw err;
        });
        versionId = version && version.design_id === design.id ? version.id : null;

        // **גרסה שנכשלה בוולידציה אינה ניתנת להזמנה.** החסימה הייתה בדפדפן
        // בלבד, והשרת קיבל בשמחה הזמנה על גרסה ש-`export_blocked` יעצור אחר
        // כך — כלומר הלקוחה קיבלה אישור על משהו שאי אפשר לייצר, והכשל התגלה
        // רק כשגל ניגש לחתוך.
        if (version && version.validation_status === "fail") {
          throw new ApiError(
            "version_not_producible",
            "The selected version failed fabrication validation",
            409,
          );
        }
      }
    }

    // ===== קוד ההפניה (0026) =====
    //
    // **נפתר כאן, ולפני חישוב המחיר.** מה שהדפדפן שלח הוא מחרוזת; הכלל שמאחוריה
    // — מחיר קבוע או אחוז — נקרא מהמסד ברגע הזה. זו אותה החלטה שבגללה המחיר
    // מחושב בשרת מלכתחילה: קוד שהדפדפן "מאשר" הוא קוד שאפשר לאשר מ-devtools.
    //
    // **הבדיקה חוזרת כאן גם אם `/validate` כבר אישר.** בין מסך הצ'קאאוט
    // לשליחה חולפות דקות, ובזמן הזה המכסה יכולה להיגמר, הקוד לפוג, או להיכבות
    // בבק־אופיס. השאלה "האם הקוד תקף" נשאלת ברגע שבו היא עולה כסף.
    let referral: { code: string; rule: ReferralRule; pickupOnly: boolean } | null = null;
    let referralCodeId: string | null = null;
    if (body.referralCode) {
      const resolved = await resolveReferralCode(body.referralCode);
      // הסיבה נוסעת **בתוך הקוד** ולא בטקסט: "פג תוקף" ו"כל המקומות נתפסו" הן
      // שתי הודעות שונות ללקוחה, ו-`ApiError` נושא code אחד בלבד.
      if (!resolved.ok) {
        throw new ApiError(
          `referral_${resolved.reason}`,
          `Referral code rejected: ${resolved.reason}`,
          409,
        );
      }
      // אופן האספקה נקבע מהקוד ולא מהדפדפן, בדיוק כמו המחיר — הוא **חלק**
      // מהמחיר: `pickupOnly` הוא מה שמאפס את המשלוח.
      referral = { code: resolved.row.code, rule: resolved.rule, pickupOnly: resolved.row.pickup_only };
      referralCodeId = resolved.row.id;
    }

    // מחיר קבוע למוצר, אלא אם קוד הפניה קבע אחרת. הרוחב והצפיפות עדיין מגיעים
    // בגוף הבקשה — הם נרשמים על ההזמנה ומתארים את מה שנחתך — אבל אינם נכנסים
    // לחישוב. ראו lib/pricing.ts.
    const price = priceFor({ productType: body.productType, referral });

    // המחיר שהוצג מול המחיר שנשמר. שניהם מחושבים מאותה פונקציה, ולכן פער כאן
    // אינו זיוף אלא **מסך ישן**: מחירון שהתעדכן בזמן שהמשפך היה פתוח. הזמנה
    // שנשמרת בסכום אחר מזה שהלקוחה ראתה היא בדיוק השיחה שאי אפשר לנצח בה.
    //
    // ההשוואה נשארת נכונה מול קוד הפניה **משום** שהקוד נפתר למעלה: שני הצדדים
    // מגיעים לכאן עם אותו קלט. מה שהיה נשבר כאן הוא החלת הקוד בדפדפן בלבד.
    if (body.displayedTotal != null && body.displayedTotal !== price.total) {
      throw new ApiError(
        "price_changed",
        `Price changed while the page was open (shown ${body.displayedTotal}, now ${price.total})`,
        409,
      );
    }

    const { order, created } = await createOrderOnce({
      ref,
      design_id: body.designId ?? null,
      version_id: versionId,
      profile_id: profileId,
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      street: body.street ?? null,
      city: body.city ?? null,
      zip: body.zip ?? null,
      product_type: body.productType,
      circumference_mm: body.circumferenceMm,
      width_mm: body.widthMm,
      fit: body.fit ?? null,
      cuts: body.cuts ?? null,
      brief: body.brief ?? null,
      // 0022 — המידות כפי שהיו ברגע ההזמנה. הזמנה בלי עיצוב נשארת בלי צילום.
      length_mm: snapshot?.length_mm ?? null,
      gap_mm: snapshot?.gap_mm ?? null,
      thickness_mm: snapshot?.thickness_mm ?? null,
      price,
      // 0026 — הקשר החי לספירת המכסה, לצד צילום המחרוזת שיישרוד מחיקת קוד.
      referral_code_id: referralCodeId,
      referral_code: referral?.code ?? null,
      pickup: referral?.pickupOnly ?? false,
      idempotency_key: body.idempotencyKey ?? null,
      // החותמת נכתבת בשרת ולא מהדפדפן: "מתי אושרו התנאים" הוא הראיה עצמה.
      terms_accepted_at: new Date().toISOString(),
      marketing_opt_in: body.marketingOptIn ?? false,
    });

    // מכאן ההזמנה שמורה. שום כשל בדואר לא מחזיר שגיאה ללקוחה — מה שאבד הוא
    // ההתראה, לא ההזמנה; הכיוון ההפוך גורם לה לשלוח שוב.
    //
    // ורק על הזמנה שנוצרה עכשיו: ניסיון שני עם אותו מפתח מחזיר את מה שכבר
    // נשמר, ואין שום סיבה לשלוח את אותם שני מיילים פעם נוספת.
    if (created) await notify(order);

    return NextResponse.json(
      { ok: true, id: order.id, ref: order.ref, price: order.price ?? price, duplicate: !created },
      { status: created ? 201 : 200 },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * ההתראה לגל, והאישור ללקוחה.
 *
 * רץ **בתוך** הבקשה ולא ב-`waitUntil`, כמו ב-`/api/inquiries`: בריפו הזה כבר
 * נמדד ש-`waitUntil` לא רץ בייצור, ואז אין מי שיכתוב אפילו את השגיאה.
 */
async function notify(order: OrderRow): Promise<void> {
  // **הזמנה חדשה יוצאת גם לטלגרם, ולא רק במייל.** ‏7.8 נפל מפתח Resend, ואיתו
  // נשתקו בו-זמנית אישורי הלקוחות וההתראות עלינו — כלומר הזמנה יכלה להיכנס
  // בלי שאיש יידע, לימים. טלגרם יושב על תשתית אחרת, והוא נשלח לפני המיילים:
  // אם משהו כאן ייפול, מה שכבר נשלח הוא הדבר שאי אפשר לפספס.
  await sendTelegram(
    [
      `🟢 Aperta — הזמנה חדשה ${order.ref ?? ""}`.trim(),
      `${order.name} · ${order.email}${order.phone ? ` · ${order.phone}` : ""}`,
      order.price ? `סה"כ ${order.price.total} ₪` : "",
      // הקוד עולה בהתראה עצמה: הזמנה במחיר הפניה היא הזמנה שגל צריך לזהות
      // ככזו **לפני** שהוא מתקשר לתאם תשלום, ולא אחרי.
      order.referral_code ? `קוד הפניה: ${order.referral_code}` : "",
      `${SITE.url}/admin/orders/${order.id}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  if (!mailConfigured()) {
    console.error("order notification skipped: no mail provider configured");
    return;
  }

  const admin = orderNotifyMail(order);
  const res = await sendMail({
    to: notifyAddress(),
    subject: admin.subject,
    text: admin.text,
    // תשובה במייל הולכת ללקוחה עצמה ולא לתיבת ה-noreply.
    replyTo: order.email,
  });
  if (!res.ok) console.error("order notification failed:", res.error);

  const ack = orderCustomerAckMail(order);
  const ackRes = await sendMail({ to: order.email, subject: ack.subject, text: ack.text, html: ack.html });
  if (!ackRes.ok) console.error("order acknowledgement failed:", ackRes.error);
}

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const url = new URL(req.url);
    const param = url.searchParams.get("status") as OrderStatus | null;
    const status = param && ORDER_STATUSES.includes(param) ? param : undefined;
    return NextResponse.json({ orders: await listOrders(status) });
  } catch (err) {
    return handleRouteError(err);
  }
}
