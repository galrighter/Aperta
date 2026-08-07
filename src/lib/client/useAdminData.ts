"use client";

import useSWR, { type SWRConfiguration, useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";

/**
 * טעינת נתונים במסכי הבק־אופיס, במקום אחד.
 *
 * **מה היה כאן קודם.** שבעה מסכים החזיקו כל אחד עותק של אותה פונקציה: דגל
 * טעינה, `fetch`, אותה סולם תגובות (401 / 503 / שאר הכשלים), אותו `useEffect`
 * שקורא לה, ואותה קריאה חוזרת אחרי כל מוטציה. אותו קוד בשבעה מקומות, כלומר
 * שבעה מקומות שבהם באג יכול לחיות לבד — וכשהתשובה על 503 השתנתה פעם אחת,
 * היא השתנתה בחלק מהם.
 *
 * **מה נפתר חוץ מהכפילות.** שני דברים שאף אחד מהעותקים לא עשה:
 *
 * 1. **מרוץ בין תשובות.** לחיצה מהירה על שני מסננים שולחת שתי בקשות, והשנייה
 *    יכולה לחזור ראשונה — ואז המסך מציג את התוצאה של המסנן הישן. `RunsLog`
 *    הוא היחיד שהגן על זה, ביד, עם מונה (`seq.current`). כאן זה מובנה.
 * 2. **רענון בחזרה ללשונית.** בק־אופיס נשאר פתוח שעות; מה שהוצג בו היה מהרגע
 *    שבו נפתח, עד שמישהו רענן ידנית.
 *
 * **למה SWR ולא React Query.** שתיהן היו עושות את העבודה. SWR קטנה בהרבה
 * (~4KB מול ~13KB), וזה משנה: אותה ספרייה תשמש בהמשך גם את `DesignReadyWatch`
 * שיושב על האתר הציבורי לצד three.js. ה-API שלה גם קטן יותר מהצורך כאן —
 * טעינה, רענון, וביטול מטמון אחרי מוטציה.
 */

/** מה שהמסך צריך לעשות כשהתברר שאין הרשאה. זהה לחתימה שהייתה בכל מסך. */
export type AuthLost = (state: "out" | "disabled") => void;

/**
 * 503 מהבק־אופיס הוא שני מצבים שונים לגמרי — "אין ADMIN_TOKEN" מול "המיגרציה
 * לא רצה" — ולכן ההבחנה היא לפי הקוד בגוף ולא לפי הסטטוס. הזורק הזה נושא את
 * ההבדל החוצה כדי שהקורא יציג את הנוסח הנכון.
 */
export class SchemaOutdatedError extends Error {}

/**
 * הפריט אינו קיים. מצב תצוגה בפני עצמו ולא כשל טעינה — מסך פירוט שנפתח על
 * מזהה שנמחק צריך לומר "לא נמצא", לא "הטעינה נכשלה".
 */
export class NotFoundError extends Error {}

/** אין הרשאה. נזרק כדי לצאת מה-fetcher, ומטופל ב-`onError` ולא במסך. */
class AuthLostError extends Error {
  constructor(readonly state: "out" | "disabled") {
    super(`admin auth lost: ${state}`);
  }
}

async function adminFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) throw new AuthLostError("out");
  if (res.status === 404) throw new NotFoundError();
  if (res.status === 503) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (body?.error?.code === "schema_outdated") throw new SchemaOutdatedError();
    throw new AuthLostError("disabled");
  }
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return (await res.json()) as T;
}

export interface AdminDataOptions extends SWRConfiguration {
  /** נקרא כשהתברר שאין הרשאה. המסך אינו רואה את השגיאה הזו בעצמו. */
  onAuthLost?: AuthLost;
}

/**
 * `key` הוא ה-URL, ו-`null` משהה את הטעינה (למשל עד שידוע מזהה).
 *
 * מוחזר `error` רק לכשלים שהמסך אמור להציג: אובדן הרשאה כבר טופל דרך
 * `onAuthLost`, ואינו מגיע לכאן כשגיאה שצריך לנסח לה הודעה.
 */
export function useAdminData<T>(key: string | null, opts: AdminDataOptions = {}) {
  const { onAuthLost, ...swr } = opts;
  const { data, error, isLoading, mutate } = useSWR<T>(key, adminFetch, {
    // בק־אופיס נשאר פתוח שעות. חזרה ללשונית היא הרגע הסביר ביותר לרצות מידע
    // עדכני, וזה מה שהחליף את הרענון הידני.
    revalidateOnFocus: true,
    // כשלי הרשאה אינם חולפים, וניסיון חוזר עליהם רק מרעיש ביומן.
    shouldRetryOnError: false,
    ...swr,
    // אובדן הרשאה יוצא דרך `onAuthLost` **בלבד**, ואינו ממשיך ל-`onError` של
    // הקורא. אחרת כל מסך היה צריך לזהות אותו שוב כדי לא להחליף את המצב
    // המדויק ("disabled") בכללי ("out") — כלומר בדיוק ההבחנה שהמסלול הזה נועד
    // לשמור עליה.
    onError: (e, k, cfg) => {
      if (e instanceof AuthLostError) {
        onAuthLost?.(e.state);
        return;
      }
      swr.onError?.(e, k, cfg);
    },
  });

  return {
    data,
    /**
     * השגיאה שהמסך אמור להציג.
     *
     * אובדן הרשאה מסונן החוצה **רק אם** הקורא מסר `onAuthLost` — כלומר רק אם
     * מישהו באמת מטפל בו. קורא בלי המטפל (`RunsLog`, שיושב כבר מאחורי שער
     * משלו) היה מקבל אחרת שקט מוחלט על 401: לא מטופל ולא מוצג.
     */
    error: error instanceof AuthLostError && onAuthLost ? undefined : (error as Error | undefined),
    /** האם זו מיגרציה חסרה — נוסח משלה בכל מסך. */
    schemaOutdated: error instanceof SchemaOutdatedError,
    /** האם הפריט אינו קיים. מצב תצוגה, לא כשל טעינה. */
    notFound: error instanceof NotFoundError,
    isLoading,
    /** לקרוא אחרי מוטציה: מושך מחדש ומעדכן כל מי שמאזין לאותו מפתח. */
    refresh: mutate,
  };
}

/**
 * רשימה מעומדת — "עוד" שמוסיף עמוד, ולא מחליף.
 *
 * `getUrl` מקבל את מספר העמוד ואת העמוד הקודם, ומחזיר `null` כשנגמר. זה מכסה
 * את שתי הצורות שיש כאן: עימוד לפי `offset` (`AdminDesigns`), ועימוד לפי סמן
 * שמגיע מהעמוד הקודם (`RunsLog`).
 *
 * **שני דברים שהוגדרו במפורש, כי ברירת המחדל לא מתאימה לרשימה שמצטברת:**
 *
 * - `revalidateFirstPage: false` — אחרת כל לחיצה על "עוד" הייתה מושכת מחדש גם
 *   את העמוד הראשון.
 * - `revalidateOnFocus: false` — בניגוד ל-`useAdminData`. חזרה ללשונית עם עשרה
 *   עמודים טעונים הייתה מייצרת עשר בקשות בבת אחת, ובעימוד לפי `offset` גם
 *   מסכנת שכפול או דילוג אם משהו נוסף בינתיים. ביומן ההרצות יש כפתור רענון
 *   מפורש, וזו הדרך הנכונה כאן.
 */
export function useAdminPages<T>(
  getUrl: (index: number, prev: T | null) => string | null,
  opts: AdminDataOptions = {},
) {
  const { onAuthLost, ...swr } = opts;
  const { data, size, setSize, error, isLoading, isValidating, mutate } = useSWRInfinite<T>(
    getUrl,
    adminFetch,
    {
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      ...swr,
      onError: (e, k, cfg) => {
        if (e instanceof AuthLostError) {
          onAuthLost?.(e.state);
          return;
        }
        swr.onError?.(e, k, cfg);
      },
    },
  );

  return {
    /** העמודים שנטענו, לפי סדר. הקורא משטח אותם לפי המבנה שלו. */
    pages: data,
    /** מסונן רק כשיש `onAuthLost` — ראו את ההסבר ב-`useAdminData`. */
    error: error instanceof AuthLostError && onAuthLost ? undefined : (error as Error | undefined),
    schemaOutdated: error instanceof SchemaOutdatedError,
    isLoading,
    /** נכון גם כשמושכים עמוד נוסף, ולא רק בטעינה הראשונה. */
    isValidating,
    /** מושך עמוד נוסף. */
    loadMore: () => setSize(size + 1),
    pageCount: size,
    /** מאפס לעמוד אחד ומושך מחדש — לכפתור רענון מפורש. */
    reload: () => setSize(1).then(() => mutate()),
    refresh: mutate,
  };
}

/**
 * ביטול מטמון לפי קידומת, למוטציה שמשפיעה על יותר ממסך אחד.
 *
 * דוגמה: שינוי סטטוס של הזמנה נוגע גם ב-`/api/orders` וגם ב-`/api/orders/<id>`.
 * בלי זה, מסך הפירוט היה מציג את הסטטוס הישן עד שמישהו רענן.
 */
export function useInvalidate() {
  const { mutate } = useSWRConfig();
  return (prefix: string) =>
    mutate((key) => typeof key === "string" && key.startsWith(prefix), undefined, {
      revalidate: true,
    });
}
