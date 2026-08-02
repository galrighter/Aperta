/**
 * הכתובת שנפלטת ב-`og:image`, וחותמת הגרסה שבתוכה.
 *
 * `/d/<token>/render` היא כתובת יציבה שמוגשת `immutable` לשנה — וזה נכון,
 * כי מה שהיא מגישה הוא צילום מצב. אבל **שיתוף חוזר של אותה גרסה מחליף את
 * התמונה** (זווית טובה יותר, ומאז 2.8 גם הפריסה מתחת להדמיה), והכתובת נשארה
 * זהה: הדפדפן ווואטסאפ המשיכו להגיש את הישנה, ולפעמים לנצח. עדכון שאיש לא
 * רואה אינו עדכון.
 *
 * לכן הכתובת נושאת `?v=` שנגזר מנתיב הקובץ שמוגש. הנתיב מקבל חותמת זמן בכל
 * העלאה, ולכן `v` משתנה בדיוק כשהתמונה משתנה — ולא רגע לפני. המסלול עצמו
 * מתעלם מהפרמטר; תפקידו היחיד הוא להיות כתובת אחרת.
 */

/** FNV-1a 32-bit. די בו: זו חותמת שינוי, לא חתימה. */
export function imageVersion(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * `null` כשאין לשיתוף שום תמונה — ואז לא נפלט `og:image` כלל והלינק נופל
 * לתמונת ברירת המחדל של האתר.
 *
 * התנאי הוא על **שתי** התמונות, ולא על `render_path` בלבד. קודם הוא היה על
 * ההדמיה של מודל התמונה בלבד, בזמן שהמסלול מגיש `preview_path ?? render_path`
 * — כלומר שיתוף שיש לו צילום ואין לו הדמיה (וזה קורה: יצירה שנשמרה בלי נתיב
 * הדמיה) נשלח בלי תמונה בכלל, כשהתמונה שלו מוכנה ומחכה במסלול.
 */
export function shareImageUrl(
  baseUrl: string,
  token: string,
  share: { preview_path?: string | null; render_path?: string | null },
): string | null {
  const path = share.preview_path ?? share.render_path;
  if (!path) return null;
  return `${baseUrl}/d/${token}/render?v=${imageVersion(path)}`;
}
