// קונפיג אתר המותג — מקור אמת יחיד לפרטי קשר וקישורי ניווט.
// גל: לעדכן כאן את כתובת האימייל / הקישורים כשהם מתגבשים.

export const SITE = {
  // כתובת האתר בייצור (מוגדר ב-wrangler.jsonc כ-custom domain).
  url: "https://aperta-designs.com",
  // כתובת יצירת קשר הרשמית של המותג, על דומיין האתר.
  contactEmail: "info@aperta-designs.com",
  /**
   * פרטי האחראי על נגישות — מה שתקנה 35ה דורשת שיופיע בהצהרת הנגישות:
   * למי פונים, ובאיזה ערוץ, כשמשהו באתר אינו נגיש.
   *
   * **גל — שלוש השורות האלה ממתינות לך** (docs/ACCESSIBILITY_PLAN.md §שלב 0.2).
   * הן מרונדרות כלשונן ב-/accessibility, ולכן `name` חייב להיות שם של אדם.
   * `phone: null` מסתיר את שורת הטלפון בעמוד ואינו שובר אותו — ערוץ אחד
   * (מייל) מספיק כדי לעמוד בדרישה, אבל שניים עדיפים.
   *
   * הכתובת מכוונת כרגע לאותה תיבה כמו `contactEmail`. מה שהתקנה דורשת הוא
   * כתובת **נקובה בהצהרה** ומענה בזמן סביר, לא תיבה נפרדת.
   */
  accessibility: {
    name: "גל ריגטר",
    email: "info@aperta-designs.com",
    phone: null as string | null,
    /** ימי עסקים למענה. מוצהר בעמוד, ולכן צריך להיות מספר שאפשר לעמוד בו. */
    responseDays: 5,
  },
  // רשתות חברתיות — להוסיף כשקיימות (null = לא מוצג).
  instagram: null as string | null,

  /**
   * זהות העוסק — מה שחוק הגנת הצרכן דורש לגלות בעסקת מכר מרחוק.
   *
   * סעיף 14ג(א) לחוק הגנת הצרכן, תשמ"א-1981, מחייב את העוסק למסור לצרכן,
   * לפני העסקה, את "שמו ומספר זהותו" ואת "כתובתו". עד 15.8 לא היה באתר אף
   * אחד מהם — רק `info@aperta-designs.com` (docs/FULL_AUDIT_2026-08.md,
   * פרק 4, ממצא R1). זו הייתה גם חשיפה משפטית וגם חסם האמון הזול ביותר
   * לתיקון: לקוחה שמוסרת כתובת וטלפון ומעבירה ₪434 לא ידעה למי.
   *
   * `null` בכל שדה = השורה פשוט אינה מוצגת, ו-`/terms` אומר "בהשלמה" במקום
   * להציג מייל בודד כאילו זו הזהות המלאה. המנגנון נשאר — הוא מה שיחזיק אם
   * פרט אי-פעם יוסר או יוחלף.
   *
   * `whatsapp` הוא מספר בפורמט בינלאומי בלי סימנים (`972501234567`) — הוא
   * הופך לקישור `wa.me`, ערוץ ההמרה הזול ביותר בקהל ישראלי-מובייל וערוץ
   * ההרגעה הטבעי בצ'קאאוט בלי סליקה (ממצא R5).
   */
  business: {
    /** שם העוסק כפי שהוא רשום — "גל ריגטר" בעוסק מורשה, או שם החברה. */
    legalName: "רייטק" as string | null,
    /** "ע.מ" לעוסק מורשה/פטור, "ח.פ" לחברה. */
    idKind: "ע.מ" as "ע.מ" | "ח.פ",
    /** מספר העוסק / ח.פ. */
    idNumber: "039569009" as string | null,
    /** כתובת למשלוח דואר ולהחזרות. */
    address: "אזור התעשייה סלעית" as string | null,
    // באותה צורה ש-`formatPhone` מייצרת (`054-5669987`), כדי שמה שמוצג באתר
    // ומה שנשמר על הזמנה ייראו אותו דבר.
    phone: "054-5669987" as string | null,
    /** בפורמט בינלאומי, ספרות בלבד: 972501234567. */
    whatsapp: "972545669987" as string | null,
  },
} as const;

/** האם יש מספיק פרטי עוסק כדי להציג אותם כזהות ולא כרשימה חלקית. */
export function businessIdentified(): boolean {
  return Boolean(SITE.business.legalName && SITE.business.idNumber);
}

/**
 * שורות זהות העוסק, לפי הסדר שבו הן נקראות. רק מה שהוגדר — שורה ריקה גרועה
 * משורה חסרה.
 */
export function businessLines(): string[] {
  const b = SITE.business;
  const lines: string[] = [];
  if (b.legalName) lines.push(b.idNumber ? `${b.legalName}, ${b.idKind} ${b.idNumber}` : b.legalName);
  if (b.address) lines.push(b.address);
  if (b.phone) lines.push(b.phone);
  lines.push(SITE.contactEmail);
  return lines;
}

/** קישור וואטסאפ, או null כשלא הוגדר מספר. `text` נפתח כהודעה מוכנה. */
export function whatsappUrl(text?: string): string | null {
  const n = SITE.business.whatsapp;
  if (!n) return null;
  const base = `https://wa.me/${n}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

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
