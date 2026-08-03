/**
 * ה-IP של הפונה. ב-Cloudflare הכתובת האמיתית יושבת ב-`cf-connecting-ip`;
 * `x-forwarded-for` הוא גיבוי (הראשון ברשימה הוא הלקוח). כשאין אף אחד מהם
 * מחזירים "unknown" — דלי אחד משותף עדיף על קריסה, וההגבלה היא ממילא שכבת הגנה.
 */
export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}
