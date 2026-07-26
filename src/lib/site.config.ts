// קונפיג אתר המותג — מקור אמת יחיד לפרטי קשר וקישורי ניווט.
// גל: לעדכן כאן את כתובת האימייל / הקישורים כשהם מתגבשים.

export const SITE = {
  // כתובת האתר בייצור (מוגדר ב-wrangler.jsonc כ-custom domain).
  url: "https://rmjewel.com",
  // כתובת יצירת קשר הרשמית של המותג, על דומיין האתר.
  contactEmail: "info@rmjewel.com",
  // רשתות חברתיות — להוסיף כשקיימות (null = לא מוצג).
  instagram: null as string | null,
} as const;

// פריטי הניווט הראשיים. label הוא מפתח לתוך he.site.
export const NAV = [
  { href: "/", key: "navHome" as const },
  { href: "/how-it-works", key: "navHowItWorks" as const },
  { href: "/gallery", key: "navGallery" as const },
  { href: "/faq", key: "navFaq" as const },
  { href: "/contact", key: "navContact" as const },
] as const;
