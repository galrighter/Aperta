import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody } from "@/lib/api";
import { requireDesignAccess } from "@/lib/designAccess";
import { getVersion, renderPathOf, updateDesignWidth } from "@/lib/db/designs";
import { isReplaceablePick } from "@/lib/versionRole";
import { designDims, ingestCutouts } from "@/lib/vectorizer";
import { STORY_MODE, isStory, storyFrameDims } from "@/lib/story/mode";
// dialogue mode — גם במסלול הזה לכל הצעה רוחב משלה, מאותו נימוק בדיוק.
import { DIALOGUE_MODE, isDialogue } from "@/lib/dialogue/mode";

// בחירת מועמד. /api/generate מחזיר כמה הצעות ושומר את הטובה ביותר כגרסה;
// כשהלקוחה בוחרת אחרת, הבחירה נרשמת כגרסה — אבל **שורה אחת לכל הרצה**:
// הלחיצה הראשונה פותחת אותה, וכל לחיצה נוספת באותה הרצה מעדכנת אותה.
//
// קודם כל לחיצה הוסיפה שורה, מתוך הנחה שבחירה היא "שינוי כמו כל אחר". היא
// אינה: הלקוחה משווה בין אפשרויות שכבר נוצרו ולא מבקשת מהמנוע דבר. AP-0061
// (נמדד) הגיע לשש שורות ביומן על יצירה אחת עם שלוש הצעות, שלוש מהן אותה
// גיאומטריה בדיוק — כי חזרה להצעה שכבר נבחרה נספרה כאירוע חדש.
//
// ה-SVG חוזר מהדפדפן ולכן אינו אמין: הוא עובר את אותו צינור מסגור וולידציה
// כמו כל cutouts אחר, ונדחה בדיוק באותם תנאים.

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  svg: z.string().min(1).max(500_000),
  /** איזו הצעה נבחרה. אופציונלי כדי שלקוח ישן לא יישבר על שדה חדש. */
  index: z.number().int().min(0).max(50).optional(),
  /**
   * מאיזו גרסה נבחר. הלקוחה יכולה לצפות בגרסה שאינה האחרונה (שחזור מהיומן),
   * ואז `current_version_id` מצביע על משהו אחר לגמרי — וההרצה שממנה ההצעה
   * באה נקבעה לפי השורה הלא נכונה. אופציונלי, עם נפילה־לאחור להתנהגות הישנה.
   */
  fromVersionId: z.string().uuid().optional(),
  /**
   * story mode — במסלול Story לכל הצעה יש רוחב משלה: הוא נגזר מהיחס שהמודל
   * צייר בה, ולא מבחירה של הלקוחה. בלי הדגל הזה מעבר להצעה אחרת היה ממסגר
   * אותה לרוחב של ההצעה הזוכה — כלומר מותח אותה בדיוק בציר שהמסלול הזה בא
   * לשמור. ריק = ההתנהגות הקיימת.
   * dialogue mode — אותו דין, מאותו נימוק: הרוחב נגזר, לא הוזמן.
   */
  mode: z.union([z.literal(STORY_MODE), z.literal(DIALOGUE_MODE)]).optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const design = await requireDesignAccess(req, id);
    const body = await parseBody(req, schema);

    // הגרסה שממנה נבחר. `fromVersionId` נבדק מול העיצוב — מזהה של עיצוב אחר
    // לא ייתן גישה לשורה שלו, הוא פשוט נופל חזרה לגרסה הנוכחית.
    const fromId = body.fromVersionId ?? design.current_version_id;
    const current = fromId ? await getVersion(fromId).catch(() => null) : null;
    const source = current?.design_id === design.id ? current : null;

    // הבחירה היא אירוע *בתוך* ההרצה הקיימת ולא הרצה חדשה, ולכן היא יורשת את
    // `generation_id` מהגרסה שממנה נבחרה. את ההצעות עצמן היא **לא** משכפלת: הן
    // כבר שמורות על הגרסה שההרצה יצרה, והקורא מאתר אותן לפי אותו מזהה.
    const generationId = source?.generation_id ?? null;

    // story mode — ההצעה נמסגרת למידות של עצמה: האורך שהוזמן, והרוחב שקנה מידה
    // אחיד מייצר עבורה. ה-SVG שהגיע כבר יושב במסגרת הזו (הוא מוסגר כך ביצירה),
    // ולכן זו זהות ולא מתיחה שנייה — והרשומה מתעדכנת כדי שההזמנה, ההדמיה וכל
    // בקשת שינוי שתבוא אחריה ידברו על אותו רוחב.
    const storyDims = isStory(body.mode) || isDialogue(body.mode) // dialogue mode
      ? storyFrameDims(designDims(design), body.svg)
      : null;
    if (storyDims) await updateDesignWidth(design.id, storyDims.widthMm);

    const { version, report, geometry, lengthMm, widthMm } = await ingestCutouts({
      design: storyDims ? { ...design, width_mm: storyDims.widthMm } : design,
      cutoutsSvg: body.svg,
      userPrompt: null,
      /**
       * ההדמיה נרשמת **להרצה**, לא להצעה: `/api/generate` מייצר תמונה אחת (או
       * רשת פאנלים) לכל קריאת רנדר ורושם את הראשונה על הגרסה שנשמרה. בחירת
       * הצעה אחרת אינה הרצה חדשה ולכן אין לה הדמיה משלה — ומכיוון שכאן נשלח
       * `null`, היא איבדה גם את זו של ההרצה שממנה באה.
       *
       * מה שזה שבר בפועל (נמדד ב-2.8 על AP-0069): הגרסה שנבחרה נשמרה בלי נתיב
       * הדמיה, ולכן בשיתוף שלה `render_path` היה ריק ו-`og:image` לא נפלט
       * בכלל — הלינק בוואטסאפ הגיע בלי תמונה. אותו חסר מרוקן גם את ההדמיה
       * ביומן הבק־אופיס לכל גרסה שנבחרה, וזה המסלול הרגיל במשפך.
       *
       * ירושה ולא חיפוש: שתי הגרסאות חולקות `generation_id`, וההדמיה של אותה
       * הרצה היא בדיוק מה שצריך להופיע. אין מיפוי הצעה→תמונה שאפשר לחפש —
       * הסדר משתנה במיון, ותמונה אחת מכילה כמה פאנלים.
       */
      renderPngPath: source ? renderPathOf(source) : null,
      generationId,
      pickedIndex: body.index ?? null,
      // כבר יש שורת בחירה להרצה הזו — מעדכנים אותה במקום להוסיף עוד אחת.
      replaceVersionId:
        source && isReplaceablePick(source, generationId) ? source.id : null,
    });
    return NextResponse.json({ version, report, geometry, lengthMm, widthMm });
  } catch (err) {
    return handleRouteError(err);
  }
}
