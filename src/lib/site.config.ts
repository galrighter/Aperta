// קונפיג אתר המותג — מקור אמת יחיד לפרטי קשר וקישורי ניווט.
// גל: לעדכן כאן את כתובת האימייל / הקישורים כשהם מתגבשים.

export const SITE = {
  // כתובת האתר בייצור (מוגדר ב-wrangler.jsonc כ-custom domain).
  url: "https://aperta-designs.com",
  // כתובת יצירת קשר הרשמית של המותג, על דומיין האתר.
  contactEmail: "info@aperta-designs.com",
  // רשתות חברתיות — להוסיף כשקיימות (null = לא מוצג).
  instagram: null as string | null,
} as const;

/**
 * כתובת השירות על הקופסה.
 *
 * מקום אחד, כי היו שניים: `lib/vectorizer.ts` ו-`lib/render/service.ts` נשאו
 * כל אחד עותק של אותה נפילה-לברירת-מחדל. בהחלפת דומיין שני עותקים פירושם
 * הזדמנות אחת לפספס אחד מהם — ואז חצי מהצינור מדבר עם ההוסט הישן, וזה עובד עד
 * שהוא מפסיק (docs/SITE_AUDIT_2026-08.md §7א).
 */
export function vectorizerUrl(): string {
  return process.env.VECTORIZER_URL || "https://vec.aperta-designs.com";
}

// פריטי הניווט הראשיים. label הוא מפתח לתוך he.site.
export const NAV = [
  { href: "/", key: "navHome" as const },
  { href: "/how-it-works", key: "navHowItWorks" as const },
  { href: "/gallery", key: "navGallery" as const },
  { href: "/sizing", key: "navSizing" as const },
  { href: "/faq", key: "navFaq" as const },
  { href: "/contact", key: "navContact" as const },
] as const;
