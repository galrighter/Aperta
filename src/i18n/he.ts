// כל מחרוזות הממשק — עברית. אין להטמיע טקסט ממשק בתוך קומפוננטות.
export const he = {
  appTitle: "סטודיו עיצוב",
  loading: "טוען…",

  // Header
  myDesigns: "העיצובים שלי",
  newDesign: "עיצוב חדש",
  unnamedDesign: "עיצוב ללא שם",
  designNamePlaceholder: "שם העיצוב",
  selectProfile: "בחירת בודק",
  duplicate: "שכפול",
  delete: "מחיקה",
  open: "פתיחה",
  confirmDelete: "למחוק את העיצוב? הפעולה אינה הפיכה.",
  noDesignsYet: "אין עדיין עיצובים לפרופיל הזה",

  // Params panel
  parameters: "פרמטרים",
  productType: "סוג מוצר",
  bracelet: "צמיד",
  ring: "טבעת",
  lengthMm: "אורך (מ\"מ)",
  widthMm: "רוחב (מ\"מ)",
  gapMm: "פער (מ\"מ)",
  thicknessMm: "עובי (מ\"מ)",
  dimsChangeTitle: "שינוי מידות",
  dimsChangeBody: "המידות ישתנו והעיצוב הקיים יותאם אליהן על ידי ה-AI. להמשיך?",
  confirm: "אישור",
  cancel: "ביטול",

  // Canvas tabs
  flatView: "שטוח",
  view3d: "הדמיה",
  renderView: "רנדר AI",

  // Annotation tools
  annotationTools: "כלי סימון",
  toolPen: "עט חופשי",
  toolArrow: "חץ",
  toolEllipse: "מסגרת",
  toolText: "תווית טקסט",
  toolEraser: "מחק",
  toolClearAll: "ניקוי הכול",
  textLabelPrompt: "טקסט לתווית:",
  annotationsWillBeSent: "הסימונים יישלחו יחד עם ההוראה",

  // Prompt bar
  promptPlaceholder: "תיאור העיצוב או הוראת שינוי…",
  attachImage: "צירוף תמונה",
  send: "שליחה",
  convertToSvg: "המרת תמונה ל-SVG",
  convertToSvgHint: "הופך תמונת עיצוב מתכתית ל-SVG נקי לייצור",
  statusGenerating: "מייצר…",
  statusValidating: "בודק ייצוריות…",
  statusRepairing: "מתקן…",
  statusError: "שגיאה",

  // Empty state
  emptyTitle: "מתחילים לעצב",
  emptyBody: "תארו את העיצוב הרצוי — ה-AI יצייר אותו, יבדוק שהוא ניתן לייצור, ותוכלו לעדן אותו בשיחה ובסימונים על הקנבס.",
  examplePrompts: [
    "משושים משורגים בצפיפות בינונית",
    "גלים אורגניים זורמים לאורך הצמיד, עם קצה גלי",
    "שורת עיגולים בגדלים משתנים עם תחושת קצב",
  ],

  // Validation panel
  validation: "בדיקת ייצור",
  validationPass: "תקין לייצור",
  validationWarn: "אזהרות ייצור",
  validationFail: "בעיות ייצור",
  estWeight: "משקל משוער",
  grams: "גרם",
  openAreaPct: "שטח פתוח",
  focusOnIssue: "מיקוד",
  repairFailedTitle: "הוולידציה נכשלה גם אחרי תיקונים אוטומטיים",
  repairFailedBody: "נסו לנסח את הבקשה אחרת, או לבקש עיצוב פתוח פחות / גשרים רחבים יותר.",

  // Version actions
  prevVersion: "גרסה קודמת",
  nextVersion: "גרסה הבאה",
  versionLabel: "גרסה",
  exportBtn: "ייצוא לייצור",
  exportBlockedFail: "לא ניתן לייצא עיצוב עם בעיות ייצור. יש לתקן קודם.",
  exportWarnTitle: "ייצוא עם אזהרות",
  exportWarnBody: "בעיצוב יש אזהרות ייצור. לייצא בכל זאת?",
  exportForce: "ייצוא בכל זאת",
  downloadDxf: "הורדת DXF",
  downloadSvg: "הורדת SVG",
  exportReady: "קובצי הייצור מוכנים",

  // Errors
  errNetwork: "אובדן תקשורת. בדקו את החיבור ונסו שוב.",
  errLlmNotSvg: "ה-AI החזיר פלט שאינו עיצוב תקין. נסו שוב.",
  errRateLimit: "הגעתם למכסת הבקשות היומית לפרופיל זה. נסו שוב מחר.",
  errGeneric: "משהו השתבש. נסו שוב.",
  errVectorizeFailed:
    "ההדמיה שיצאה לא הומרה לתבנית חיתוך נקייה. זה קורה לפעמים — אפשר לנסות שוב, או לנסח את התיאור מעט אחרת.",
  errAccountRequired: "צריך להזדהות לפני היצירה.",
  errSchemaOutdated: "המערכת עודכנה אבל מסד הנתונים לא. יש להריץ את המיגרציות האחרונות.",
  retry: "נסה שוב",

  // Validation messages by check id — הפרמטרים מוזרקים בקוד
  checks: {
    V1: "מבנה ה-SVG אינו תקין",
    V2: "החומר אינו רציף — יש חלקים מנותקים שייפלו בחיתוך",
    V3: "יש \"אי\" של חומר בתוך פתח — הוא ייפול בחיתוך",
    V4: "גשר חומר צר מדי",
    V4bend: "גשר חומר צר מדי לשרידות בערגול (עובר חיתוך, אך עלול להיקרע בכיפוף)",
    V5: "פתח קטן מדי לחיתוך",
    V6: "חריץ צר מדי",
    V7: "חירור בתוך אזור השוליים שחייב להישאר מלא",
    V8warn: "שטח פתוח גבוה — עלול להקשות על ערגול",
    V8fail: "שטח פתוח גבוה מדי לערגול",
    V9: "פינה פנימית חדה — מומלץ לעגל",
    V10: "פרט חומר קטן/עדין מדי",
  },

  // ===== אתר המותג (עמודים ציבוריים סביב הסטודיו) =====
  site: {
    brand: "RM JEWEL",
    brandHe: "אר. אם. ג'ואל",
    tagline: "Precision jewelry, formed around you.",
    /** הכותרת של האתר — מה שרואים בתוצאת חיפוש, בטאב ובשיתוף בוואטסאפ.
     *  נפרדת מ-`tagline` בכוונה: הטאגליין נשאר האנגלית של המותג בפוטר, אבל
     *  אתר `lang="he"` שכל כותרותיו אנגליות אינו מופיע בחיפוש עברי. */
    titleHe: "RM JEWEL — תכשיטים בעיצוב אישי",

    // ניווט
    navHome: "בית",
    navHowItWorks: "איך זה עובד",
    navGallery: "גלריה",
    navFaq: "שאלות ותשובות",
    navContact: "יצירת קשר",
    ctaStart: "התחלת עיצוב",
    ctaStartLong: "עיצוב תכשיט משלכם",
    openMenu: "פתיחת תפריט",
    closeMenu: "סגירת תפריט",

    // Hero (עמוד בית) — handoff v3: הצהרה רגשית, CTA יחיד, בלי הסבר תהליך.
    heroEyebrow: "ONE OF ONE · MADE AROUND YOU",
    heroTitleLine1: "אינסוף צורות.",
    heroTitleLine2: "אחת שלך.",
    heroTitle: "אינסוף צורות. אחת שלך.",
    heroEnglishTagline: "Precision jewelry, formed around you.",
    heroSubtitle:
      "תכשיט לא בוחרים מתוך מדף. הוא מתחיל בקו שרק את רואה — ונגמר בחפץ שאין עוד אחד כמוהו בעולם.",
    heroSubtitleSeo:
      "עצבו צמיד או טבעת פתוחים משלכם. התחילו מרעיון, שרטוט או תמונה — נהלו שיחה קצרה עם מנוע העיצוב, קבלו חלופות וערכו אותן עד לתכשיט שהוא רק שלכם.",
    heroPriceNote: "מ־₪240",
    heroCtaPrimary: "ליצור את שלי",
    heroImageAlt: "צמיד פליז פתוח עם חיתוכי לייזר אלכסוניים",
    heroPieceTag: "PIECE Nº 001 — YOURS",

    // רצועת מניפסט (עמוד בית) — מחליפה את הסברי התהליך.
    manifestoLine: "העיצוב שלך. הידיים שלנו. חפץ אחד בעולם.",
    manifestoTag1: "חיתוך לייזר",
    manifestoTag2: "עבודת יד",

    // רצועת ערך (עמוד בית)
    valuesTitle: "מהרעיון למתכת, בלי מתווכים",
    value1Title: "עיצוב בשיחה",
    value1Body: "מתארים במילים מה בא לכם, ומעדנים בשיחה ובסימונים על הקנבס — בלי תוכנות גרפיקה.",
    value2Title: "בדוק לייצור",
    value2Body: "כל עיצוב עובר בדיקת ייצוריות אוטומטית: רוחב גשרים, גודל פתחים, שוליים ושרידות בערגול.",
    value3Title: "מוכן לחיתוך",
    value3Body: "הפלט הוא קובץ DXF במ\"מ, מוכן ישירות לחיתוך לייזר — בלי סבב תיקונים ידני.",

    // חומר ומוצר (עמוד בית)
    materialTitle: "פליז אמיתי, חתוך בלייזר",
    materialBody:
      "כל פריט נחתך מלוח פליז בעובי 1.5 מ\"מ בחיתוך לייזר סיבים, ואז מעורגל לקשת פתוחה — צמיד או טבעת שנפתחים בעדינות ומתאימים למידה. הלייזר חותך את החומר ומשאיר את העיצוב שבחרתם.",
    materialSpecMaterial: "חומר",
    materialSpecMaterialVal: "פליז",
    materialSpecCut: "חיתוך",
    materialSpecCutVal: "לייזר סיבים",
    materialSpecProducts: "מוצרים",
    materialSpecProductsVal: "צמיד · טבעת",
    materialSpecMade: "ייצור",
    materialSpecMadeVal: "לפי הזמנה",

    // רצועת תהליך (עמוד בית) — לפי ה-handoff
    proc: [
      { n: "שלב 01", title: "רעיון", body: "טקסט, שרטוט או תמונה שממנה מתחילים." },
      { n: "שלב 02", title: "עיצוב", body: "מנוע ה־AI מציע חלופות ואתם עורכים אותן." },
      { n: "שלב 03", title: "חיתוך", body: "חיתוך לייזר, הסרת גראדים, החלקה וערגול." },
      { n: "שלב 04", title: "משלוח", body: "בדיקת איכות, אריזה ומשלוח עד אליכם." },
    ],

    // סעיף איך זה עובד (עמוד בית + עמוד ייעודי)
    howTitle: "איך זה עובד",
    howSubtitle: "ארבעה צעדים מהמשפט הראשון ועד קובץ חיתוך מוכן.",
    step1Title: "מתארים",
    step1Body: "מספרים באמצעות סקיצה או מילים מה העיצוב שאתם רוצים — גיאומטרי, אורגני, עדין או נועז.",
    step2Title: "הבינה מציירת",
    step2Body: "המנוע מייצר עיצוב מלא, ואפשר לעדן אותו בשיחה: \"תגדיל את זה\", \"פחות צפוף כאן\" — או לסמן ישירות על הקנבס.",
    step3Title: "בדיקת ייצור",
    step3Body: "כל גרסה נבדקת אוטומטית מול מגבלות הייצור בפועל, ואם משהו לא יחזיק — המערכת מתקנת לבד ומראה לכם איפה.",
    step4Title: "ייצוא לייצור",
    step4Body: "מקבלים קובץ DXF מדויק במ\"מ, מוכן לחיתוך לייזר. משם — למכונה.",

    // גלריה
    galleryTitle: "גלריה",
    gallerySubtitle: "דוגמאות להמחשת סגנונות עיצוב אפשריים. כל עיצוב אמיתי נוצר מחדש מהתיאור שלכם.",
    galleryDisclaimer: "האיורים כאן להמחשה בלבד ואינם מוצרים ממשי למכירה.",
    galleryItems: [
      { title: "משושים משורגים", desc: "רשת גיאומטרית משורגת בצפיפות בינונית" },
      { title: "גלים זורמים", desc: "קו אורגני רך לאורך הפריט" },
      { title: "קצב עיגולים", desc: "עיגולים בגדלים משתנים בתחושת מקצב" },
      { title: "רשת יהלומים", desc: "מעוינים חוזרים בסידור סימטרי" },
      { title: "טיפות אנכיות", desc: "חיתוכים מוארכים בהטיה עדינה" },
      { title: "פסים דקים", desc: "חריצים מקבילים בקצב אחיד" },
    ],
    galleryFeaturedTag: "צילום מוצר",
    galleryFeaturedTitle: "טבעת פסים אלכסוניים",
    galleryFeaturedDesc: "פליז חתוך בלייזר — חיתוכים אלכסוניים בקצב אחיד, רצועה פתוחה שנסגרת בעדינות למידה.",
    galleryFeaturedAlt: "טבעת פליז פתוחה עם חיתוכי לייזר אלכסוניים על רקע אבן",
    galleryCta: "רוצים כזה? עצבו משלכם",

    // שאלות נפוצות
    faqTitle: "שאלות נפוצות",
    faqSubtitle: "מה שכדאי לדעת על העיצוב, החומר והייצור.",
    faqItems: [
      {
        q: "איך מעצבים תכשיט בלי לדעת לצייר?",
        a: "מתארים במילים. כותבים משפט כמו \"משושים משורגים בצפיפות בינונית, עם קצה גלי\", והבינה המלאכותית מציירת עיצוב מלא. משם מעדנים בשיחה ובסימונים על הקנבס — בלי שום תוכנת גרפיקה.",
      },
      {
        q: "מאיזה חומר עשוי התכשיט?",
        a: "פליז בעובי 1.5 מ\"מ, נחתך בלייזר סיבים ומעורגל לקשת פתוחה. פליז הוא חומר חם בגוונו, עמיד, וקל לתחזוקה.",
      },
      {
        q: "מה אפשר לעצב — צמיד או טבעת?",
        a: "את שניהם. שניהם רצועה פתוחה שמעורגלת לקשת ונפתחת בעדינות למידה. בוחרים סוג מוצר ומידות, והעיצוב מתאים את עצמו.",
      },
      {
        q: "איך אתם מוודאים שהעיצוב באמת יוצא טוב?",
        a: "כל עיצוב עובר בדיקת ייצוריות אוטומטית: שהחומר נשאר גוף אחד רציף, שאין חלק שייפול בחיתוך, שהגשרים רחבים מספיק לשרוד את הכיפוף, ושהשוליים נשמרים. אם משהו לא עומד בזה, המערכת מתקנת לבד או מראה לכם איפה הבעיה.",
      },
      {
        q: "מה מקבלים בסוף?",
        a: "קובץ DXF מדויק ביחידות מ\"מ, מוכן ישירות לחיתוך לייזר, וגם תצוגת SVG נקייה. משם אפשר לגשת לייצור.",
      },
      {
        q: "כמה זה עולה וכמה זמן לוקח?",
        a: "המחיר וזמן האספקה תלויים בעיצוב ובמידה. צרו קשר ונחזור אליכם עם פרטים מדויקים.",
      },
    ],

    // יצירת קשר
    contactTitle: "יצירת קשר",
    contactSubtitle: "יש שאלה, רעיון או בקשת הזמנה? כתבו לנו ונחזור אליכם.",
    contactName: "שם",
    contactEmail: "אימייל",
    contactMessage: "הודעה",
    contactNamePlaceholder: "השם שלכם",
    contactEmailPlaceholder: "you@example.com",
    contactMessagePlaceholder: "מה תרצו לספר לנו?",
    contactSubmit: "שליחת הודעה",
    contactOr: "או ישירות באימייל:",
    contactErrorRequired: "נא למלא שם, אימייל והודעה.",
    contactErrorEmail: "כתובת האימייל אינה תקינה.",

    // פוטר
    footerTagline: "RM JEWEL — Precision jewelry, formed around you.",
    footerCopyright: "© 2026",
    footerRights: "כל הזכויות שמורות",
    footerBuiltWith: "מעוצב ומיוצר בישראל",
    footerLegal: "מדיניות ומידע",
    navTerms: "תנאי שימוש",
    navPrivacy: "מדיניות פרטיות",

    // 404
    notFoundTitle: "הדף לא נמצא",
    notFoundBody: "הקישור שגוי או שהדף הוסר. אפשר לחזור לבית או להתחיל לעצב.",
    notFoundHome: "חזרה לבית",

    // עמודים משפטיים — נוסח כללי, טעון בדיקת עורך דין לפני עלייה לאוויר
    legalNote: "המסמך מובא כבסיס כללי ואינו ייעוץ משפטי. לפני פרסום — מומלץ לעבור עם עורך/ת דין.",
    legalUpdated: "עודכן לאחרונה: יולי 2026",
    terms: {
      title: "תנאי שימוש",
      intro: "השימוש באתר forme ובכלי העיצוב שבו כפוף לתנאים שלהלן. עצם השימוש מהווה הסכמה להם.",
      sections: [
        { h: "השירות", p: "האתר מאפשר לעצב צמיד או טבעת מפליז באמצעות כלי בינה מלאכותית, ולהפיק קובץ ייצור. עיצוב שנוצר הוא הצעה — ייצור בפועל כפוף לבדיקה ולתיאום נפרד." },
        { h: "קניין רוחני", p: "הכלים, הקוד והמותג שייכים ל-forme. עיצוב שיצרתם נשאר שלכם לשימושכם; אין להעלות תוכן שמפר זכויות של צד שלישי." },
        { h: "אחריות", p: "העיצובים והבדיקות ניתנים כפי שהם (as-is). אנו משתדלים שהבדיקה הייצורית תהיה מדויקת, אך האחריות הסופית לתקינות הייצור היא של הגורם המייצר." },
        { h: "שינויים", p: "אנו רשאים לעדכן את השירות ואת התנאים. גרסה מעודכנת תפורסם בעמוד זה." },
      ],
    },
    privacy: {
      title: "מדיניות פרטיות",
      intro: "אנו מכבדים את פרטיותכם. להלן איזה מידע נאסף וכיצד הוא משמש.",
      sections: [
        { h: "איזה מידע נאסף", p: "מידע שתמסרו ביצירת קשר (שם, אימייל, תוכן ההודעה) והעיצובים שאתם יוצרים באתר. איננו אוספים אמצעי תשלום בשלב זה." },
        { h: "שימוש במידע", p: "המידע משמש למתן השירות, לשמירת העיצובים שלכם ולחזרה אליכם בעקבות פנייה. איננו מוכרים מידע לצד שלישי." },
        { h: "אחסון", p: "הנתונים מאוחסנים בשירותי ענן (Supabase, Cloudflare). קבצים ותוכן נשמרים כל עוד נדרש למתן השירות." },
        { h: "יצירת קשר בנושא פרטיות", p: "לכל שאלה או בקשה למחיקת מידע — כתבו לנו ונטפל בהקדם." },
      ],
    },

    // (עמוד /order והמחרוזות שלו הוסרו — הטופס כתב לטבלה שלא קיימת בייצור.
    //  יצירת קשר עוברת דרך /contact; ההזמנה עצמה נסגרת בסוף משפך /design.)

    // אדמין (מוגן ב-ADMIN_TOKEN)
    adminTitle: "בק־אופיס",
    adminLoginTitle: "כניסת מנהל",
    adminTokenLabel: "סיסמת ניהול",
    adminLogin: "כניסה",
    adminLogout: "יציאה",
    adminBadToken: "סיסמה שגויה.",
    adminDisabled: "האדמין אינו מוגדר (חסר ADMIN_TOKEN).",
    adminEmpty: "אין פניות עדיין.",
    adminColDate: "תאריך",
    adminColKind: "סוג",
    adminColContact: "פונה",
    adminColProduct: "פריט",
    adminColMessage: "הודעה",
    adminColStatus: "סטטוס",
    adminKindOrder: "הזמנה",
    adminKindContact: "יצירת קשר",
    adminStatusNew: "חדש",
    adminStatusContacted: "טופל",
    adminStatusClosed: "סגור",
    adminFilterAll: "הכול",
    adminLoadError: "טעינת הפניות נכשלה.",

    // ---- לשונית העיצובים ----
    adminTabInquiries: "פניות",
    adminTabDesigns: "עיצובים",
    adminDesignsEmpty: "אין עיצובים עדיין.",
    adminDesignsError: "טעינת העיצובים נכשלה.",
    adminDesignsSchema: "מסד הנתונים חסר את מיגרציה 0008 — הרשימה תתמלא אחרי שתרוץ.",
    adminNoOwner: "ללא שיוך",
    adminTesterBadge: "בודק",
    adminVersions: "גרסאות",
    adminNoPreview: "טרם הושלם",
    adminMore: "טעינת עוד",
    adminShowing: "מוצגים",
    adminOf: "מתוך",
  },

  // ===== מסע היצירה (/design) — לפי handoff_design_flow =====
  design: {
    // ---- סרגל שלבים (6 שלבים; מסך העיבוד מוצג תחת "עיצוב") ----
    steps: {
      product: "מוצר",
      sizes: "מידות",
      brief: "עיצוב",
      result: "תוצאה",
      summary: "סיכום",
      checkout: "תשלום",
    },
    stepAria: "שלבי היצירה",
    stepLocked: "יש להשלים את השלבים הקודמים",

    // ---- מסך מוצר ----
    productEyebrow: "שלב 1 · בחירת מוצר",
    productTitle: "מה נעצב?",
    productSubtitle: "בוחרים מוצר, וממשיכים למידות. אפשר לשנות בהמשך.",
    braceletName: "צמיד פתוח",
    braceletPrice: "החל מ־₪320",
    braceletDesc: "רצועה פתוחה שמעורגלת לקשת ונפתחת בעדינות למידה.",
    braceletMeta: ["רוחב 5–80 מ״מ", "פליז", "10–14 ימי עבודה"],
    ringName: "טבעת פתוחה",
    ringPrice: "החל מ־₪240",
    ringDesc: "טבעת פתוחה וגמישה, שמתאימה את עצמה לאצבע.",
    ringMeta: ["רוחב 4–18 מ״מ", "פליז", "10–14 ימי עבודה"],

    // ---- מסך מידות ----
    sizesEyebrow: "שלב 2 · מידות",
    sizesTitleBracelet: "מידת פרק כף היד",
    sizesTitleRing: "מידת הטבעת",
    sizesSubBracelet: "המידה קובעת את אורך הפס ואת גודל הפתח.",
    sizesSubRing: "טבעת פתוחה סלחנית במידה — ובכל זאת שווה למדוד.",
    sizesGuideBtn: "איך למדוד את ההיקף?",
    sizesGuideBtnRing: "איך למדוד את המידה?",

    // צמיד
    wristPresetLabel: "היקף סטנדרטי",
    wristPresets: [
      { id: "narrow", name: "צר", sub: "145–158 מ״מ", mm: 152 },
      { id: "medium", name: "ממוצע", sub: "159–172 מ״מ", mm: 165 },
      { id: "wide", name: "רחב", sub: "173–190 מ״מ", mm: 181 },
    ],
    circLabel: "או היקף מדויק (מ״מ)",
    circPlaceholder: "לדוגמה: 168",
    fitLabel: "איך יושב הצמיד",
    fits: { tight: "צמוד", regular: "נוח", loose: "משוחרר" },
    fitSubs: { tight: "ישיבה הדוקה", regular: "ברירת מחדל", loose: "תנועה חופשית" },
    presetDefaultTag: "ברירת מחדל",
    braceletWidthLabel: "רוחב הצמיד",

    // טבעת
    ringPresetLabel: "מידה סטנדרטית",
    ringPresets: [
      { id: "narrow", name: "צר", sub: "מידה 4–5", mm: 49 },
      { id: "medium", name: "ממוצע", sub: "מידה 6–7", mm: 55 },
      { id: "wide", name: "רחב", sub: "מידה 8–9", mm: 59 },
    ],
    ringSizeLabel: "או מידת טבעת מדויקת",
    ringSizePlaceholder: "לדוגמה: 6.5",
    ringWidthLabel: "רוחב הטבעת",
    ringDisclaimer:
      "טבעת פתוחה במידה ממוצעת (היקף 54–56 מ״מ, מידה 6–7) מתאימה בפועל למידה אחת למעלה או למטה, כך שאין לחץ למידה מדויקת — ובכל זאת מומלץ למדוד לפי המדריך.",

    // הרשימה כוללת את ההצעה המוצגת כרגע, ולכן לא "עוד".
    candidatesLabel: "ההצעות מאותה יצירה",
    candidateChosen: "מוצג כעת",
    exactOverridesPreset: "הזנת מידה מדויקת מבטלת את בחירת המידה הסטנדרטית.",
    noAllowanceNote: "אין צורך להוסיף תוספת להיקף — המערכת מחשבת פתח וערגול לפי סוג הישיבה.",
    sizesContinue: "המשך לעיצוב",

    // תצוגת רוחב
    widthPreviewTitle: "תצוגת רוחב",
    widthPreviewBracelet: "על פרק כף יד נשי ממוצע",
    widthPreviewBraceletBase: "היקף פרק כף יד 165 מ״מ",
    widthPreviewRing: "על אצבע ממוצעת",
    widthPreviewRingBase: "אצבע בקוטר 17 מ״מ",
    widthPreviewNote: "התצוגה להמחשת הפרופורציה בלבד.",
    widthPreviewBraceletAlt: "פרק כף יד נשי, להמחשת רוחב הצמיד",
    widthPreviewRingAlt: "יד נשית, להמחשת רוחב הטבעת",

    // מדריך מדידה
    guideTitleBracelet: "איך מודדים את היקף פרק כף היד",
    guideTitleRing: "איך מודדים מידת טבעת",
    guideStepsBracelet: [
      "קחי סרט מדידה גמיש, או חוט וסרגל.",
      "כרכי סביב פרק כף היד בדיוק מתחת לבליטת העצם, במקום שבו הצמיד יישב.",
      "הקפידי שהסרט צמוד לעור אבל לא לוחץ.",
      "קראי את המידה במ״מ והזיני אותה בשדה ההיקף — אין צורך להוסיף תוספת, המערכת מחשבת את הפתח לפי סוג הישיבה.",
    ],
    guideNoteBracelet: "מדידה על היד הדומיננטית תיתן בדרך כלל היקף גדול ב־2–4 מ״מ.",
    guideStepsRing: [
      "קחי חוט דק או רצועת נייר ברוחב 5 מ״מ וכרכי אותה סביב בסיס האצבע שעליה תלבשי את הטבעת.",
      "הקפידי שהרצועה צמודה אך לא לוחצת — היא צריכה לעבור מעל מפרק האצבע בלי מאמץ.",
      "סמני את נקודת המפגש, פרסי על סרגל ומדדי באורך במ״מ. זה ההיקף.",
      "היקף 54 מ״מ ≈ מידה 6, 56 מ״מ ≈ מידה 7. מדדי בסוף היום, כשהאצבעות בנפח מלא.",
    ],
    guideNoteRing: "אם את בין שתי מידות — בחרי את הגדולה מבין השתיים. הטבעת פתוחה וניתן לכוונן אותה מעט.",
    guideClose: "הבנתי",

    // ---- מסך עיצוב ----
    briefEyebrow: "שלב 3 · עיצוב",
    briefTitle: "איך התכשיט ייראה?",
    briefSubtitle: "אפשר לתאר במילים, להעלות תמונה, או שניהם.",
    attrsTitle: "מאפייני העיצוב",
    attrsDefaultNote: "הסימון · מציין את ברירת המחדל.",
    symmetryLabel: "סימטריה",
    syms: { symmetric: "סימטרי", asymmetric: "א־סימטרי" },
    densityLabel: "צפיפות",
    densities: { low: "נמוכה", medium: "בינונית", high: "גבוהה" },
    feelLabel: "תחושה",
    feels: { delicate: "עדין", balanced: "מאוזן", massive: "מאסיבי" },

    imageTitle: "תמונה (אופציונלי)",
    imageUpload: "+ העלאת תמונה",
    imageFormats: "PNG · JPG · SVG",
    imageRoleTitle: "מה התפקיד של התמונה?",
    imageRoles: {
      inspiration: { name: "השראה", desc: "רוח וסגנון בלבד, לא העתק." },
      sketch: { name: "סקיצה", desc: "שרטוט שלך שממנו יוצאים לעיצוב." },
      ready: { name: "קובץ מוכן לחיתוך", desc: "נחתך כפי שהוא, ללא עיצוב נוסף." },
    },
    readyLockNote:
      "נבחר קובץ מוכן לחיתוך — מאפייני העיצוב והתיאור אינם רלוונטיים והקובץ ייחתך כפי שהוא.",
    imageRemove: "הסרת התמונה",
    imageTooLarge: (gotMb: number, maxMb: number) =>
      `התמונה גדולה מדי (${gotMb}MB). הגודל המרבי הוא ${maxMb}MB — אפשר לצלם מחדש באיכות נמוכה יותר או להקטין לפני ההעלאה.`,
    imageReadFailed: "לא הצלחנו לקרוא את הקובץ. אפשר לנסות תמונה אחרת.",

    briefLabel: "תיאור חופשי",
    briefPlaceholder: "לדוגמה: קווים אלכסוניים דקים שמתעבים לכיוון המרכז, קצה גלי, אזור ריק בצד אחד...",
    briefHint:
      "ככל שיהיה יותר פירוט — כך התוצאה תהיה יותר מדויקת. אפשר לתאר צורות, קצב, אזורים ריקים, קצוות, השראה ותחושה.",
    briefSubmit: "שלח",
    briefBlocked: "צריך תיאור, תמונה, או קובץ מוכן לחיתוך",

    // ---- מסך עיבוד ----
    procTitle: "מייצרים את העיצוב שלך",
    procBody:
      "התהליך יכול לקחת עד כשתי דקות — המנוע בונה גאומטריה חתיכה בלייזר, בודק רוחבי גשרים ומרחקים מהקצה. אפשר להשאיר את החלון פתוח.",
    // 34 ציטוטים — שני הנוסחים המקוריים לכל מחבר משותף, בתוספת קלאסיקות
    // מתועדות של עיצוב, אדריכלות ומלאכה. מוצגים בסדר אקראי, 7 שניות לכל אחד.
    procQuotes: [
      { text: "פחות, אבל טוב יותר.", by: "DIETER RAMS" },
      { text: "עיצוב טוב הוא כמה שפחות עיצוב.", by: "DIETER RAMS" },
      { text: "הפשטות היא התחכום האמיתי.", by: "COCO CHANEL" },
      { text: "הפשטות היא מילת המפתח של כל אלגנטיות אמיתית.", by: "COCO CHANEL" },
      { text: "האופנה חולפת. הסגנון נשאר.", by: "COCO CHANEL" },
      { text: "החלל הוא חומר הגלם של האדריכלות.", by: "LE CORBUSIER" },
      { text: "חלל, אור וסדר — אלה הדברים שהאדם זקוק להם.", by: "LE CORBUSIER" },
      { text: "צורה נכונה נולדת מתוך אילוץ.", by: "CHARLOTTE PERRIAND" },
      { text: "אמנות המגורים היא המשך של אמנות החיים.", by: "CHARLOTTE PERRIAND" },
      { text: "הפשטות היא מורכבות שנפתרה.", by: "CONSTANTIN BRANCUSI" },
      { text: "פשטות אינה מטרה, אלא תוצאה.", by: "CONSTANTIN BRANCUSI" },
      { text: "יש 360 מעלות — למה להיצמד לאחת?", by: "ZAHA HADID" },
      { text: "אין קווים ישרים ואין פינות חדות בטבע.", by: "ANTONI GAUDÍ" },
      { text: "פחות זה יותר.", by: "MIES VAN DER ROHE" },
      { text: "אלוהים נמצא בפרטים.", by: "MIES VAN DER ROHE" },
      { text: "הפרטים אינם פרטים. הם העיצוב עצמו.", by: "CHARLES EAMES" },
      { text: "מה שעובד טוב עדיף על מה שנראה טוב — כי מה שעובד טוב מחזיק מעמד.", by: "RAY EAMES" },
      { text: "השלמות מושגת לא כשאין מה להוסיף, אלא כשאין מה להסיר.", by: "ANTOINE DE SAINT-EXUPÉRY" },
      { text: "עיצוב הוא לא רק איך זה נראה ומרגיש. עיצוב הוא איך זה עובד.", by: "STEVE JOBS" },
      { text: "עיצוב הוא כל כך פשוט — ובדיוק לכן הוא כל כך מסובך.", by: "PAUL RAND" },
      { text: "הצורה תמיד נגזרת מן התפקיד.", by: "LOUIS SULLIVAN" },
      { text: "הצורה והתפקיד הם אחד.", by: "FRANK LLOYD WRIGHT" },
      { text: "שאל את הלבנה מה היא רוצה להיות, והיא תענה: קשת.", by: "LOUIS KAHN" },
      { text: "אל תחזיקו בביתכם דבר שאינכם יודעים שהוא שימושי, או מאמינים שהוא יפה.", by: "WILLIAM MORRIS" },
      { text: "כדי ליצור, צריך קודם כול לפקפק בכול.", by: "EILEEN GRAY" },
      { text: "לסבך זה קל. לפשט זה קשה.", by: "BRUNO MUNARI" },
      { text: "פשטות אינה היעדר עומס — היא התוצאה שלה.", by: "JONY IVE" },
      { text: "הריק אינו כלום; הוא מכל של אפשרויות.", by: "KENYA HARA" },
      { text: "אם אינך סקרן — עזוב את זה.", by: "ACHILLE CASTIGLIONI" },
      { text: "כשסיימתי, אם הפתרון אינו יפה — אני יודע שהוא שגוי.", by: "BUCKMINSTER FULLER" },
      { text: "חיי המעצב הם מאבק מתמיד בכיעור.", by: "MASSIMO VIGNELLI" },
      { text: "אני יוצר חלל כדי שהאור יוכל לשכון בו.", by: "TADAO ANDO" },
      { text: "לברוא כמו אל, לצוות כמו מלך, לעבוד כמו עבד.", by: "CONSTANTIN BRANCUSI" },
      { text: "האמת היא ביופיו של החומר עצמו.", by: "ALVAR AALTO" },
    ],
    // מצב כשל — נדרש ב-handoff §11.2 ולא היה בפרוטוטייפ
    procErrorTitle: "היצירה נכשלה",
    procErrorBody: "משהו השתבש בדרך למנוע. אפשר לנסות שוב — הפרטים שמילאת נשמרו.",
    procRetry: "נסה שוב",
    procBack: "חזרה לעיצוב",

    // ---- מסך תוצאה ----
    resultEyebrow: "שלב 4 · תוצאה",
    resultEmptyTitle: "העיצוב חזר ריק",
    resultEmptyBody:
      "המנוע לא החזיר תבנית חיתוך לגרסה הזו. אפשר לנסות שוב מהעיצוב — הפרטים שמילאת נשמרו.",
    resultTitle: "העיצוב שלך מוכן",
    resultTitleReady: "הקובץ שלך מוכן",
    modeRender: "הדמיה",
    modeFlat: "עריכה · פריסה",
    renderNote:
      "הדמיה של הקובץ לאחר ערגול. ייתכנו הבדלים בגוון ובטקסטורה במוצר הפיזי.",
    renderDragHint: "גרירה מסובבת את ההדמיה",
    renderTapToRotate: "לגעת כדי לסובב",

    regionTitle: "סימון אזור",
    regionHint: "אפשר לסמן אזור על השרטוט, או להשאיר הערה כללית.",
    regions: { right: "אזור ימין", center: "אזור מרכז", left: "אזור שמאל", all: "הערה כללית" },
    editReqTitle: "בקשה למודל",
    editReqPlaceholder: "לדוגמה: לדלל את החיתוכים כאן, ולהשאיר יותר מתכת בקצה.",
    editApply: "החלת שינוי",
    editApplying: "מחיל...",
    versionsTitle: "יומן גרסאות",
    versionsEmpty: "עוד לא בוצעו שינויים.",
    versionLabel: "גרסה",
    versionRestore: "חזרה לגרסה זו",
    versionOriginal: "העיצוב המקורי",

    tuneTitle: "כוונון מהיר",
    tuneDensity: "צפיפות חיתוכים",
    tuneBridge: "עובי גשרים",
    fabTitle: "מצב ייצור",
    fabOk: "ניתן לייצור",
    fabWarn: "דורש בדיקה",
    fabFail: "לא ניתן לייצור",
    fabMinBridge: "גשר מינימלי",
    fabOpenArea: "שטח פתוח",
    fabWeight: "משקל משוער",
    fabFormat: "פורמט",
    fabFormatVal: "SVG שטוח",
    /** כמה מקומות נכשלו — ממצא אחד ושמונה הם שני מצבים שונים לחלוטין. */
    fabIssueCount: (n: number) => (n === 1 ? "מקום אחד" : `${n} מקומות`),
    fabIssueMarked: "המקומות מסומנים בעיגול על הפריסה.",
    fabIssueSeeFlat: "עברו לתצוגת פריסה כדי לראות איפה.",
    resultOrder: "בצע הזמנה",

    // ---- מסך סיכום ----
    summaryEyebrow: "שלב 5 · סיכום הזמנה",
    summaryTitle: "לפני שממשיכים",
    sketchTitle: "סקיצה פרוסה",
    specTitle: "מפרט",
    specKeys: {
      type: "סוג",
      size: "מידה / היקף",
      width: "רוחב",
      fit: "ישיבה",
      material: "חומר",
      thickness: "עובי חומר",
      finish: "גימור",
      source: "מקור העיצוב",
      file: "קובץ",
    },
    specMaterial: "פליז",
    specThickness: "1.5 מ״מ",
    specFinish: "ליטוש",
    ringFitVal: "גמישה (פתוחה)",
    sources: {
      brief: "תיאור חופשי",
      inspiration: "השראה + תיאור",
      sketch: "סקיצה + תיאור",
      ready: "קובץ מוכן לחיתוך",
    },
    specFileVal: "SVG שטוח",
    specCuts: "חיתוכים",

    disclaimersTitle: "לפני ההזמנה",
    disclaimers: [
      "ייצור לפי הזמנה — לא ניתן להחזרה או להחלפה למעט פגם ייצור.",
      "ייתכנו הבדלים של עד 1 מ״מ בין השרטוט למוצר הפיזי, ושינויי גוון וטקסטורה טבעיים.",
      "השרטוט עובר בדיקת ייצור אנושית; אם נדרשת התאמה קטנה ניצור קשר לפני החיתוך.",
      "אין לייצר העתק מדויק של מוצר מוגן — תמונת השראה משמשת כהשראה בלבד.",
      "זמן אספקה משוער 10–14 ימי עבודה מרגע אישור השרטוט.",
    ],
    priceTitle: "מחיר",
    priceBase: "מחיר בסיס",
    priceWidth: "תוספת רוחב",
    priceComplexity: "תוספת מורכבות",
    pricePackaging: "אריזה",
    priceShipping: "משלוח",
    priceVat: "מע״מ 17%",
    priceTotal: "סה״כ",
    termsLabel: "קראתי ואני מאשרת את תנאי השימוש ואת תנאי ההזמנה.",
    summaryContinue: "המשך לתשלום",

    // ---- מסך כתובת ותשלום ----
    checkoutEyebrow: "שלב 6 · פרטים ותשלום",
    checkoutTitle: "כתובת ותשלום",
    addrTitle: "כתובת למשלוח",
    addrFields: {
      name: "שם מלא",
      street: "רחוב ומספר",
      city: "עיר",
      zip: "מיקוד",
      phone: "טלפון",
      email: "אימייל",
    },
    addrPlaceholders: {
      name: "שם ושם משפחה",
      street: "הרצל 14",
      city: "תל אביב",
      zip: "6100001",
      phone: "050-0000000",
      email: "name@mail.com",
    },
    payTitle: "תשלום",
    payPendingTitle: "התשלום מתבצע בתיאום אישי",
    payPendingBody:
      "כרגע לא נגבה תשלום באתר. נשלח את ההזמנה, נחזור אליך תוך יום עסקים לאישור השרטוט, ואז נתאם את התשלום. הייצור מתחיל רק אחרי שאישרת את השרטוט.",
    checkoutSummaryTitle: "סיכום",
    checkoutKeys: { item: "פריט", size: "מידה", width: "רוחב", delivery: "אספקה" },
    deliveryVal: "10–14 ימי עבודה",
    checkoutTotal: "סכום לתשלום",
    checkoutSubmit: "שליחת ההזמנה",
    checkoutSending: "שולח...",
    checkoutError: "שליחת ההזמנה נכשלה. אפשר לנסות שוב.",
    orderMailSubject: "הזמנה",
    checkoutMailtoCta: "שליחת ההזמנה במייל",
    checkoutMailtoNote: "או, כדי שההזמנה לא תלך לאיבוד — כל הפרטים כבר ממולאים:",
    requiredMark: "שדה חובה",

    // ---- מסך אישור ----
    doneTitle: "תודה",
    doneSub: "ההזמנה התקבלה",
    doneOrderNo: "מספר הזמנה",
    doneBody:
      "העיצוב עובר עכשיו בדיקת ייצור אנושית — נחזור אליך תוך יום עסקים עם אישור סופי, תיאום תשלום ותאריך משלוח משוער.",
    doneHome: "חזרה לדף הבית",

    // ---- העיצובים שלי (תוספת מעבר ל-handoff §12) ----
    savedTitle: "העיצובים שלי",
    savedSubtitle: "עיצובים ששמרת במכשיר הזה. אפשר להמשיך מאיפה שהפסקת.",
    savedCountOne: "עיצוב אחד שמור",
    savedCountMany: "עיצובים שמורים",
    savedShow: "הצגה",
    savedHide: "הסתרה",
    savedResume: "המשך עיצוב",
    savedFinish: "להשלים את היצירה",
    savedPending: "טרם הושלם",
    savedRemove: "הסרה",
    savedRemoveConfirm: "להסיר את העיצוב מהרשימה? הפעולה לא מוחקת אותו מהשרת.",
    savedLoading: "טוען עיצוב...",
    savedLoadError: "טעינת העיצוב נכשלה.",
    savedCuts: "חיתוכים",
    savedNew: "התחלת עיצוב חדש",

    // ---- זיהוי ----
    acctTitle: "רגע לפני שמתחילים",
    acctSubtitle:
      "היצירה נשמרת על שמך — כדי שתוכלו לחזור אליה מכל מכשיר, וכדי שנדע למי לענות על הפידבק.",
    acctEmail: "אימייל",
    acctSending: "רגע…",
    acctError: "הזיהוי נכשל. נסו שוב.",
    acctNote: "בלי סיסמה. חשבון גוגל, או קוד חד־פעמי למייל — וזה מה שמחזיר אתכם לעיצובים שלכם, מכל מכשיר.",

    // כניסה מאומתת — גוגל או קוד חד־פעמי במייל
    acctGoogle: "המשך עם Google",
    acctOr: "או",
    acctEmailPh: "you@example.com",
    acctSendCode: "שליחת קוד",
    acctCodeTitle: "הקוד נשלח",
    acctCodeSentTo: "שלחנו קוד בן שש ספרות אל",
    acctCodeLabel: "הקוד מהמייל",
    acctCodeEnter: "כניסה",
    acctCodeResend: "לא הגיע? שליחה חוזרת",
    acctCodeOtherEmail: "מייל אחר",
    acctCodeInvalid: "הקוד שגוי או פג תוקף. אפשר לבקש חדש.",
    acctCodeSpam: "אם הוא לא מגיע תוך דקה, שווה להציץ בתיקיית הספאם.",
    acctGoogleFailed: "הכניסה עם Google לא הושלמה. אפשר לנסות שוב, או קוד במייל.",
    acctUnavailable: "הכניסה אינה זמינה כרגע. נסו שוב בעוד רגע.",

    acctSignedIn: "מחוברים כ־",
    acctSwitch: "לא אתם?",
    acctCancel: "לא עכשיו",

    // ---- מספר העיצוב ----
    codeLabel: "מספר עיצוב",

    // ---- כללי ----
    mm: "מ״מ",
    back: "חזרה",
    ils: "₪",
  },

  // ===== מיילים =====
  // טקסט שנשלח החוצה ולא מוצג במסך. יושב כאן ולא בקוד השליחה מאותה סיבה
  // שכל שאר המחרוזות יושבות כאן: מי שמתקן ניסוח לא צריך לקרוא לוגיקה.
  mail: {
    notifyOrderSubject: "הזמנה חדשה",
    notifyContactSubject: "פנייה חדשה",
    notifyIntroOrder: "התקבלה הזמנה חדשה באתר.",
    notifyIntroContact: "התקבלה פנייה חדשה באתר.",
    notifyFrom: "מאת",
    notifyPhone: "טלפון",
    notifyEmail: "מייל",
    notifyAdminHint: "הפנייה נשמרה גם בבק־אופיס:",

    orderAckSubject: "קיבלנו את ההזמנה שלך",
    orderAckHello: "היי",
    orderAckIntro:
      "ההזמנה שלך התקבלה. זה מה שרשום אצלנו — אם משהו כאן לא נכון, אפשר פשוט להשיב למייל הזה.",
    orderAckRef: "מספר ההזמנה",
    orderAckNext:
      "נחזור אליך בהקדם עם אישור ופרטי המשך. הייצור מתחיל רק אחרי שנאשר איתך.",
    orderAckSignature: "RM JEWEL",
  },
} as const;

export type I18n = typeof he;
