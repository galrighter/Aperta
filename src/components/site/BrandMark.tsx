// סימן Aperta — הטבעת הפתוחה. מקור אמת יחיד לגאומטריה של הסימן.
//
// הסימן הוא גאומטריה טהורה ולא אותיות, ולכן אינו תלוי בטעינת ווב-פונט: הקשרי
// רינדור של אייקונים (פאביקון, אייקון אפליקציה) כלל אינם טוענים ווב-פונטים,
// והסימן הקודם — שהיה מולבש על אותיות — נאלץ להיות מותווה כווקטור מראש כדי
// לשרוד שם. פתח הטבעת הוא המותג עצמו (aperta = פתוחה), והקשת בכחול היא
// ההדגשה היחידה.
//
// המידות נמדדו מהלוגו המקורי (docs/brand/README.md): מעגל חיצוני מושלם, פנים
// אליפטי — הטבעת עבה יותר באגפים מאשר למעלה ולמטה, כמו O של גרסה סריפית.
// אותה גאומטריה בדיוק משרתת את ההדר, את /icon.svg ואת האייקונים ב-public,
// כדי שהסימן ייראה זהה בכל מקום. שינוי כאן מחייב עדכון מקביל ב-src/app/icon.svg
// וריצה מחדש של docs/brand/build-brand-assets.py.

// viewBox 0 0 64 64 · מרכז (32,32) · רדיוס חיצוני 30 · פנים 25.91×26.96.
/** הקשת הראשית — מהסוף של קשת ההדגשה ועד לפתח. */
export const RING_ARC =
  "M56.72 15.01A30 30 0 1 1 23.48 3.24L24.64 6.15A25.91 26.96 0 1 0 53.35 16.73Z";

/** קשת ההדגשה בכחול, מיד אחרי הפתח. */
export const RING_ACCENT_ARC =
  "M42.01 3.72A30 30 0 0 1 56.72 15.01L53.35 16.73A25.91 26.96 0 0 0 40.65 6.59Z";

/**
 * הסימן עצמו. `aria-hidden` כברירת מחדל — הוא מלווה במילולוגו (`Wordmark`),
 * וקריאה כפולה של אותו שם רק מרעישה לקוראי מסך. `title` הופך אותו לתמונה
 * נגישה בפני עצמה, לשימוש היחיד שבו הוא עומד לבדו.
 */
export default function BrandMark({
  size = 38,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <path d={RING_ARC} fill="var(--color-graphite, #202326)" />
      <path d={RING_ACCENT_ARC} fill="var(--color-lapis, #3f6297)" />
    </svg>
  );
}
