"use client";

import { useSyncExternalStore } from "react";

const COARSE = "(pointer: coarse)";

/**
 * האם המצביע גס — כלומר אצבע ולא עכבר. קובע איזה רמז גרירה מוצג מתחת להדמיה.
 *
 * **למה לא `useState` + `useEffect`.** זו הייתה הצורה הקודמת, בשני עותקים
 * (`RolledStage`, `SharedPiece`), ושתי בעיות היו בה. הראשונה: `window` לא קיים
 * בשרת, ולכן הקריאה חייבת לקרות אחרי ההרכבה — מה שגורר רנדר שני בכל טעינה,
 * ובדיוק את זה `set-state-in-effect` מסמן. השנייה, והאמיתית יותר: היא נקראה
 * **פעם אחת** ולא נרשמה לשינויים, כך שהרמז נשאר תקוע על מה שהיה בהרכבה.
 * מכשיר היברידי — טאבלט עם מקלדת מחוברת, מסך מגע בלפטופ — מחליף את סוג
 * המצביע תוך כדי, והרמז המשיך לומר "גרירה" למי שנוגעת באצבע.
 *
 * `useSyncExternalStore` פותר את שתיהן באותו מנגנון: `getServerSnapshot`
 * מחזיר `false` (בשרת אין מצביע, וזו גם ברירת המחדל הנכונה — עכבר), ההרשמה
 * מעדכנת כשהשאילתה משתנה, ואין רנדר נוסף רק כדי לגלות איפה אנחנו רצים.
 */
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(COARSE);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COARSE).matches,
    () => false,
  );
}
