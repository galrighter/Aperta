import { handleFrame, type FrameRequest } from "@/lib/render/frameRequest";

// Worker נפרד שכל תפקידו למסגר מועמד אחד.
//
// למה בכלל Worker שני: תקרת הזיכרון של Cloudflare היא 128MB **לכל isolate, לא
// לכל בקשה** — ו-isolate אחד משרת הרבה בקשות במקביל. כלומר המסגור של ארבעה
// מועמדים לא מתחרה רק בעצמו, אלא גם בכל בקשה אחרת שרצה באותו רגע באותו
// isolate. זה מה שהרג הרצה יחידה (28.7, reqs=1) ב-exceededResources.
//
// למה לא subrequest ל-Worker של האתר עצמו: אותו script = אותו isolate. זה היה
// מוסיף round-trip ולא מוסיף ולו בייט אחד של תקציב. script אחר הוא isolate אחר,
// ולכן תקרה משלו — זו כל הסיבה שהקובץ הזה קיים.
//
// מאז נוסף מסלול טוב ממנו — `geometry-service` על הקופסה, שאין לה תקרת 128MB
// בכלל — והוא נוסה ראשון. הקובץ הזה הוא הנפילה הראשונה כשהקופסה לא עונה.
//
// מה שהוא לא: הוא לא מחזיק סודות, לא ניגש ל-DB, ולא חשוף לאינטרנט
// (workers_dev=false, בלי routes) — הדרך היחידה להגיע אליו היא ה-service binding.
//
// ומה שהוא כבר לא עושה בעצמו: את המסגור. ההחלטה יושבת ב-`frameRequest`,
// שהקופסה מריצה בדיוק כמוהו — כי כשהיו כאן שני עותקים, החתימה זזה בקצה אחד
// והשני המשיך לענות בשקט לפי הישנה. כאן נשאר רק התרגום ל-Request/Response.

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });

    let body: FrameRequest;
    try {
      body = (await req.json()) as FrameRequest;
    } catch (e) {
      return Response.json({ error: `bad JSON: ${(e as Error).message}` }, { status: 400 });
    }

    const answer = handleFrame(body);
    return Response.json(answer.body, { status: answer.status });
  },
};
