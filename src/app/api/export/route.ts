import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { getVersion } from "@/lib/db/designs";
import { requireDesignAccess } from "@/lib/designAccess";
import { buildVersionExport } from "@/lib/export/build";

// ייצוא ייצור — סעיף 10. זמין בסטטוס pass; ב-warn רק עם forced=true; fail חסום.
// בניית הקבצים עצמה יושבת ב-lib/export/build.ts, משותפת עם מסלול הבק־אופיס.

const schema = z.object({
  versionId: z.string().uuid(),
  forced: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);
    const version = await getVersion(body.versionId);
    const design = await requireDesignAccess(req, version.design_id);

    if (version.validation_status === "fail") {
      throw new ApiError("export_blocked", "Cannot export a design with validation failures", 409);
    }
    if (version.validation_status === "warn" && !body.forced) {
      throw new ApiError("export_needs_confirmation", "Design has warnings — confirm forced export", 409);
    }

    return NextResponse.json(await buildVersionExport(design, version, body.forced));
  } catch (err) {
    return handleRouteError(err);
  }
}
