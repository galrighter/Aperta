import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { requireBearerAdmin } from "@/lib/admin";
import { opsStatus } from "@/lib/opsStatus";

// תמונת המצב לתורן האוטומטי (`lib/opsStatus.ts`) — נקרא על ידי ה-workflow
// ‏"Ops status", שמדפיס אותה ללוג כדי שסשן הרוטין יקרא אותה משם. קריאה בלבד:
// אין כאן שום פעולה, רק התשובה ל"מה שבור עכשיו".

export async function GET(req: Request) {
  try {
    requireBearerAdmin(req);
    return NextResponse.json(await opsStatus());
  } catch (err) {
    return handleRouteError(err);
  }
}
