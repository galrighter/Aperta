// המזהה שבכתובת של דף שיתוף (`/d/<token>`).
//
// base58 — ספרות ואותיות בלי `0`, `O`, `I` ו-`l`. הלינק נשלח בוואטסאפ ונקרא
// מהמסך; זוג תווים שנראים אותו דבר הוא הבדל בין דף שנפתח לדף שמחזיר 404, ומי
// שקיבל אותו לא ידע מה קרה.
//
// 12 תווים = 58^12 ≈ 2^70 אפשרויות. ניחוש אינו מסלול: הטבלה קטנה ביחס למרחב
// בסדרי גודל, וכל ניסיון עולה בקשה שלמה.
//
// חסר תלויות בכוונה: גם השרת וגם הדפדפן משתמשים בו.

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const SHARE_TOKEN_LENGTH = 12;

/** טוקן חדש. `crypto.getRandomValues` ולא `Math.random`: זהו סוד לכל דבר. */
export function newShareToken(): string {
  const bytes = new Uint8Array(SHARE_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) {
    // הטיה זניחה (256 mod 58 = 24): על מרחב של 2^70 היא אינה מקרבת ניחוש.
    out += ALPHABET[b % ALPHABET.length];
  }
  return out;
}

const TOKEN_RE = new RegExp(`^[${ALPHABET}]{${SHARE_TOKEN_LENGTH}}$`);

/**
 * האם המחרוזת יכולה להיות טוקן.
 *
 * נבדק לפני הפנייה למסד ולא רק כדי לחסוך שאילתה: `/d/<כל דבר>` הוא נתיב
 * שזחלנים וסורקים מגיעים אליו, ואין סיבה שכל מחרוזת שהודבקה בכתובת תיהפך
 * לשאילתה.
 */
export function isShareToken(value: string | null | undefined): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}
