import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { countRuns } from "@/lib/db/runs";

// כמה הרצות יש, וכמה מהן נכשלו — מספרים בלבד.
//
// מסלול נפרד ולא שדה בתשובת היומן: את המספר צריך גם דף הבית של פורטל הניהול,
// שלא מציג אף שורה, ולעמוד השני והשלישי של היומן הוא לא משתנה. שתי שאילתות
// `count` עם `head: true` הן זולות בסדר גודל משליפת השורות עצמן — וזאת בדיוק
// הסיבה שעד עכשיו לא היה מספר "יצירות שנכשלו" במסך הסקירה.

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    return NextResponse.json(await countRuns());
  } catch (err) {
    return handleRouteError(err);
  }
}
