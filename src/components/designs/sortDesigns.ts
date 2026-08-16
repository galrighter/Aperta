// המיון של דף "העיצובים שלי" — לוגיקה טהורה, נבדקת בנפרד מהרכיב.

import type { SavedDesign } from "@/lib/client/myDesigns";

export type DesignsSortKey = "updated" | "serial" | "product";

/** החדש ראשון. שובר-השוויון של כל שאר המיונים, כי הוא ברירת המחדל. */
const byUpdated = (a: SavedDesign, b: SavedDesign): number =>
  a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;

/**
 * רשימה ממוינת. תמיד עותק — הקלט הוא ה-state של הרכיב, ומיון בו-במקום הוא
 * מוטציה של state.
 *
 * - `updated` — "השתנה לאחרונה": החדש ראשון. ברירת המחדל, וזה גם הסדר
 *   שהאינדקס המקומי נשמר בו.
 * - `serial` — "מספר עיצוב": AP-0001 ראשון. עולה ולא יורד, כי מי שממיין לפי
 *   מספר מחפש עיצוב שהוא יודע את מספרו — סדר קריאה טבעי. עיצובים בלי מספר
 *   (טרם נשמרו בשרת / קדמו למיגרציה) יורדים לסוף, לא נעלמים.
 * - `product` — "פריט": צמידים ואז טבעות, באותו סדר שבו המשפך מציג את
 *   המוצרים; בתוך כל קבוצה — החדש ראשון.
 */
export function sortDesigns(items: readonly SavedDesign[], key: DesignsSortKey): SavedDesign[] {
  const list = [...items];
  switch (key) {
    case "serial":
      return list.sort((a, b) => {
        const as = a.serial ?? null;
        const bs = b.serial ?? null;
        if (as === null && bs === null) return byUpdated(a, b);
        if (as === null) return 1;
        if (bs === null) return -1;
        return as !== bs ? as - bs : byUpdated(a, b);
      });
    case "product":
      return list.sort((a, b) => {
        if (a.product !== b.product) return a.product === "bracelet" ? -1 : 1;
        return byUpdated(a, b);
      });
    default:
      return list.sort(byUpdated);
  }
}
