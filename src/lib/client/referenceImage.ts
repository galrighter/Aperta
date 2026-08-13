// תמונת ההשראה, בגודל שהמודל באמת רואה.
//
// **מה זה מתקן.** הקובץ שהלקוחה בוחרת נקרא כמו שהוא (`BriefScreen`,
// `readAsDataURL`) ונוסע גולמי — עד 5MB, כלומר ~6.7MB בבסיס64 — ומשם הוא עובר
// שלוש פעמים: בגוף ה-POST מהדפדפן, מה-Worker לקופסה, ומה-Worker ל-storage
// ליומן. שתי האחרונות חוזרות בכל ניסיון. הראשונה היא הגרועה מכולן: היא רצה על
// הקו של הלקוחה, **בזמן שמסך הטעינה כבר מסתובב**, ובסלולר איטי היא לבדה דקות.
//
// ומה זה קונה למודל: כלום. הקנבס שנשלח הוא 1536x1024 (`vectorizer/imagegen.py`,
// `ALLOWED_SIZES`), ותמונת ייחוס גדולה ממנו מוקטנת ממילא בצד השני. כלומר
// המשקל העודף משולם במלואו בהמתנה ואינו נראה בפיקסל אחד של התוצאה.
//
// **מה שלא עובר כאן:** קובץ מוכן לחיתוך (`imageRole === "ready"`). הוא הולך
// ל-`/api/vectorize`, שם הרזולוציה היא כן התוכן — הטרייסר קורא את הפיקסלים
// עצמם. לכן ההקטנה מופעלת בנקודת השליחה של היצירה ולא בבחירת הקובץ: בזמן
// הבחירה עוד לא ידוע איזה תפקיד התמונה תקבל.

/** הצלע הארוכה שאליה מכווצים — הצלע הארוכה של הקנבס שהמודל מצייר עליו. */
export const REFERENCE_MAX_EDGE = 1536;

/** איכות ה-JPEG. 0.85 הוא הסף שבו הארטיפקטים מפסיקים להיות נראים בצילום. */
const QUALITY = 0.85;

/**
 * מתחת לזה לא נוגעים. תמונה קטנה ממילא לא תרוויח מהמרה, ו-re-encode שלה הוא
 * איבוד איכות בלי שום החזר בזמן.
 */
const LEAVE_ALONE_BYTES = 300_000;

/** כמה בייטים data URL באמת שוקל — בסיס64 הוא 4 תווים לכל 3 בייטים. */
function approxBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  return Math.floor(((comma < 0 ? dataUrl.length : dataUrl.length - comma - 1) * 3) / 4);
}

/**
 * מכווץ תמונת ייחוס לגודל שהמודל מצייר בו.
 *
 * **לעולם לא זורק ולא חוסם יצירה.** כל כשל — דפדפן בלי `createImageBitmap`,
 * קנבס שנחסם, תמונה שאי אפשר לפענח — מחזיר את המקור. תמונה כבדה היא המתנה
 * ארוכה; יצירה שנופלת על ההקטנה היא באג חדש במקום ישן.
 */
export async function shrinkReferenceImage(dataUrl: string): Promise<string> {
  try {
    if (approxBytes(dataUrl) <= LEAVE_ALONE_BYTES) return dataUrl;
    if (typeof createImageBitmap !== "function") return dataUrl;

    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, REFERENCE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    // רקע לבן לפני הציור: המקור יכול לשאת שקיפות (PNG), ו-JPEG אין לו ערוץ
    // אלפא — בלי המילוי כל אזור שקוף היה יוצא שחור, כלומר צורה שהמודל יראה
    // ולא הייתה בתמונה שנבחרה.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const out = canvas.toDataURL("image/jpeg", QUALITY);
    // רק אם באמת הרווחנו. תמונה שכבר קטנה ודחוסה היטב יכולה לצאת גדולה יותר
    // מהמקור אחרי המרה, ואז ההקטנה עשתה בדיוק את ההפך ממה שהיא כאן בשבילו.
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}
