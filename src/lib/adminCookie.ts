/**
 * שם עוגיית הבק־אופיס, לבדו.
 *
 * יושב במודול נפרד ולא ב-`lib/admin` כדי ש-`middleware.ts` יוכל לקרוא אותו בלי
 * לגרור לתוך ה-edge את `lib/api` ואת zod שמאחוריו: ה-middleware רץ על כל בקשה,
 * וכל מודול שנכנס אליו הופך לתלות שחייבת להישאר edge-safe לנצח.
 */
export const ADMIN_COOKIE = "aperta_admin";
