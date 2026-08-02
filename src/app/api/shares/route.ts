import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { requireDesignAccess } from "@/lib/designAccess";
import { getVersion } from "@/lib/db/designs";
import { attachSharePreview, createShare, findActiveShare } from "@/lib/db/shares";
import { buildShareSnapshot } from "@/lib/shareSnapshot";
import { decodeDataUrl, uploadFile } from "@/lib/db/storage";
import { SITE } from "@/lib/site.config";

// יצירת לינק שיתוף לעיצוב. הדף שהוא פותח: `/d/<token>`.
//
// הבעלות נבדקת דרך `requireDesignAccess` בדיוק כמו בכל מסלול שמקבל מזהה עיצוב:
// שיתוף הוא פרסום, ומי שמחזיק uuid של עיצוב של מישהו אחר לא אמור להיות זה
// שמחליט להוציא אותו החוצה.

const schema = z.object({
  designId: z.string().uuid(),
  /** הגרסה ששותפה. ברירת המחדל היא הנוכחית — מה שעל המסך ברגע הלחיצה. */
  versionId: z.string().uuid().nullable().optional(),
  /**
   * צילום ההדמיה מהקנבס, כ-data URL. זו תמונת השיתוף (ראו 0014). אופציונלי:
   * שיתוף מהסטודיו בטאב הפריסה נוצר בלי קנבס פעיל, ואז נופלים להדמיה של
   * מודל התמונה. התקרה נדיבה ביחס ל-JPEG של קנבס (עשרות KB) ומספיק הדוקה
   * כדי שגוף הבקשה לא ייהפך לערוץ העלאה.
   */
  previewDataUrl: z.string().max(4_000_000).optional(),
});

/** מה שמותר להעלות כצילום. הקנבס פולט JPEG; PNG מתקבל למקרה שדפדפן יסרב לו. */
const PREVIEW_MEDIA = new Set(["image/jpeg", "image/png"]);

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);
    const design = await requireDesignAccess(req, body.designId);

    const versionId = body.versionId ?? design.current_version_id;
    if (!versionId) {
      throw new ApiError("no_version", "This design has no version to share yet", 400);
    }
    const version = await getVersion(versionId);
    // גרסה של עיצוב אחר: אותה החלטה כמו בהזמנה — לא נשמרת כאילו היא נכונה.
    if (version.design_id !== design.id) {
      throw new ApiError("invalid_version", "Version does not belong to design", 400);
    }

    // שיתוף חוזר של אותה גרסה מחזיר את אותו לינק (ראו findActiveShare).
    const existing = await findActiveShare(design.id, version.id);
    const share = existing ?? (await createShare(buildShareSnapshot(design, version)));

    /**
     * צילום ההדמיה, אם הדפדפן שלח אחד. גם על שיתוף חוזר: הלינק זהה, אבל
     * הצילום עשוי להיות טוב יותר מהקודם (זווית אחרת, או שבפעם הראשונה בכלל
     * לא היה קנבס). דריסה של תמונה בנתיב קבוע מרעננת את מה שהעמוד מגיש.
     *
     * best-effort במפורש: הלינק כבר קיים ותקין, וכשל בהעלאה נופל חזרה
     * להדמיה של מודל התמונה במקום להיכשל על משהו שכבר הצליח.
     */
    if (body.previewDataUrl) {
      try {
        const { bytes, mediaType } = decodeDataUrl(body.previewDataUrl);
        if (!PREVIEW_MEDIA.has(mediaType)) {
          throw new Error(`unsupported preview type ${mediaType}`);
        }
        const ext = mediaType === "image/png" ? "png" : "jpg";
        const path = `shares/${share.id}.${ext}`;
        await uploadFile(path, bytes, mediaType);
        await attachSharePreview(share.id, path);
      } catch (e) {
        console.warn(`[shares] preview upload failed for ${share.id}:`, (e as Error).message);
      }
    }

    return NextResponse.json(
      { token: share.token, url: `${SITE.url}/d/${share.token}`, reused: Boolean(existing) },
      { status: existing ? 200 : 201 },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
