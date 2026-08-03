import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { handleFrame, type FrameRequest } from "@/lib/render/frameRequest";

// מנוע הגיאומטריה כשירות, על הקופסה — לצד ה-vectorizer.
//
// למה כאן ולא ב-Worker: תקרת הזיכרון של Cloudflare היא 128MB לכל isolate,
// משותפת לכל הבקשות שרצות בו, ו-forme-studio נמדד ב-P999 של 135.4MB — מעל
// התקרה. לקופסה יש זיכרון אמיתי ואין לה תקרה כזו. זה גם למה זה עדיף על
// forme-frame, שרק העביר את אותו מקצה ל-isolate אחר עם אותה תקרה.
//
// **ולמה לא בפייתון, שכבר רץ כאן:** כי אלה חוקי הייצור. עותק שני שלהם בשפה
// אחרת הוא היום שבו הם מתפצלים ופריט יוצא פגום. הקובץ הזה מייבא את
// src/lib/geometry/frameCutouts.ts — אותו קוד בדיוק שהאתר מריץ — ונארז ב-esbuild
// בזמן הפריסה. מקור אחד, שני מקומות הרצה.
//
// אין לו סודות משלו, אין לו DB, והוא מאזין רק על לוקאלהוסט: nginx חושף אותו
// תחת /api/frame על אותו vhost של ה-vectorizer, מאחורי אותו bearer token.
//
// המסגור עצמו יושב ב-`src/lib/render/frameRequest.ts` — אותו קובץ בדיוק
// ש-`workers/frame` מריץ. כשהיו כאן שני עותקים, `plan` נוסף לחתימה, ה-Worker
// עודכן והשירות הזה לא, וכל גשרי האותיות נזרקו בשקט בייצור. הקובץ הזה הוא רק
// HTTP: קריאת גוף, שער, ותרגום לתשובה.

const PORT = Number(process.env.PORT || 8100);
const TOKEN = process.env.VECTORIZER_TOKEN || "";

/** הגבול על גוף הבקשה. SVG של מועמד הוא עשרות KB; 8MB הוא תקרה נדיבה שמונעת
 *  מבקשה פגומה לצרוך את הזיכרון שבגללו עברנו לכאן מלכתחילה. */
const MAX_BODY = 8 * 1024 * 1024;

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error(`body exceeds ${MAX_BODY} bytes`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** השוואת bearer בזמן קבוע. timingSafeEqual זורק על אורך שונה, ולכן משווים אורך
 *  קודם — ואי-התאמת אורך ממילא אינה דולפת מידע על תוכן הסוד. */
function bearerOk(authorization: string | undefined): boolean {
  const expected = `Bearer ${TOKEN}`;
  const got = authorization ?? "";
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    const text = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
    res.end(text);
  };

  try {
    if (req.method === "GET" && req.url === "/api/health") return send(200, { ok: true });
    if (req.method !== "POST") return send(405, { error: "POST only" });

    // אותו שער כמו שאר הקופסה. הבדיקה קודמת לקריאת הגוף — בקשה לא מורשית לא
    // אמורה להקצות כלום. נכשל סגור: בלי token השירות מסרב לכול, במקום לרוץ פתוח
    // כשמישהו שכח להעביר את המשתנה. ההשוואה בזמן קבוע כדי לא לדלוף את הסוד.
    if (!TOKEN) return send(503, { error: "auth not configured" });
    if (!bearerOk(req.headers.authorization)) return send(401, { error: "unauthorized" });

    let body: FrameRequest;
    try {
      body = JSON.parse(await readBody(req)) as FrameRequest;
    } catch (e) {
      return send(400, { error: `bad request: ${(e as Error).message}` });
    }
    const answer = handleFrame(body);
    return send(answer.status, answer.body);
  } catch (e) {
    // מסגור שנכשל הוא לא קריסה של השירות: הקורא נופל למסלול הבא.
    return send(500, { error: `frame failed: ${(e as Error).message}` });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`geometry service listening on ${PORT}`);
});
