import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { requireDesignAccess } from "@/lib/designAccess";
import { getVersion } from "@/lib/db/designs";
import { createShare, findActiveShare } from "@/lib/db/shares";
import { buildShareSnapshot } from "@/lib/shareSnapshot";
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
});

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

    return NextResponse.json(
      { token: share.token, url: `${SITE.url}/d/${share.token}`, reused: Boolean(existing) },
      { status: existing ? 200 : 201 },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
