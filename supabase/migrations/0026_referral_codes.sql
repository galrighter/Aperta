-- קוד הפניה: מחיר אחר לקהל שהוזמן, בלי להזיז את המחירון.
--
-- ההשקה הראשונה יוצאת לחברים ומשפחה במחיר קרוב לעלות, ואחריה — הפניות
-- מחנויות תכשיטים. שני המקרים הם אותו מנגנון: מישהו הופנה לכאן, ולכן המחיר
-- שלו נקבע אחרת. מה שהם **אינם** הוא מבצע, וזו הסיבה שמה שמוצג ללקוחה הוא
-- תמיד מספר אחד סופי — בלי מחיר מחוק ובלי אחוזים על המסך. מי שראה
-- ‎₪399←₪180 למד שהמחיר האמיתי הוא 180, והקהל הזה הוא בדיוק מי שיספר על
-- המוצר הלאה.
--
-- **קוד לקמפיין, לא לאדם.** גל ביקש קוד אחד משותף עם מכסה של 25 לחברים
-- ומשפחה, ובהמשך קוד נפרד לכל חנות. לכן `max_uses` יושב על הקוד ולא נוצרות
-- 25 שורות: המכסה היא תכונה של הקמפיין, וכשהיא נגמרת הקוד נסגר לכולם. זה גם
-- מה שיאפשר לענות "כמה הביאה חנות X" בשאילתה אחת, במקום להצליב מיילים.

create table if not exists referral_codes (
  id uuid primary key default gen_random_uuid(),

  -- נשמר תמיד באותיות גדולות ובלי רווחים (ראו `normalizeCode` בשכבת ה-TS).
  -- אדם שמקליד קוד מוואטסאפ מקליד אותו כמו שבא לו, והשוואה רגישת-רישיות כאן
  -- פירושה קוד תקין שנדחה — התקלה הכי מתסכלת שיש, כי המסך פשוט אומר "לא נמצא".
  code text not null,

  -- למי הקוד שייך, בשפה של גל. "חברים ומשפחה", "תכשיטי אלמוג — הרצליה".
  -- מוצג בבק־אופיס בלבד; ללקוחה מוצגת `public_label`.
  label text not null,

  -- מה שהלקוחה רואה כשהקוד נקלט. שדה משלו ולא שימוש חוזר ב-`label` כי
  -- "תכשיטי אלמוג — הרצליה" הוא רישום פנימי, ומה שצריך להופיע על המסך הוא
  -- "בהפניית תכשיטי אלמוג". NULL — מוצג הנוסח הגנרי מ-i18n.
  public_label text,

  -- ===== איך הקוד קובע מחיר =====
  --
  -- **שני כללים, ומקום אחד שיודע איזה מהם.** היום נדרש רק `fixed_price`
  -- (החלטת גל), אבל הפניה מחנות עשויה בעתיד לזכות באחוז — וזו החלטה שתתקבל
  -- כשהיא תתקבל. העמודה הזאת קיימת מהיום מסיבה אחת: להוסיף אותה אחר כך
  -- פירושו מיגרציה על טבלה שכבר תלויות בה הזמנות אמיתיות עם מחיר שנגבה.
  -- עמודה ריקה היא זולה; מיגרציה על היסטוריה חשבונאית אינה.
  --
  --   · fixed_price — מחיר סופי לפריט לפי סוג מוצר, ב-`base_prices`.
  --   · percent_off — אחוז מהמחירון, ב-`percent_off`.
  --
  -- שניהם חלים על **הפריט בלבד**. המשלוח הוא עלות אמיתית שיוצאת מהכיס
  -- וממשיכה להיגבות ככתבה, בשני הכללים.
  kind text not null default 'fixed_price',

  -- ‎{"bracelet": 180, "ring": 140} — כולל מע"מ ואריזה, בדיוק כמו `BASE`
  -- ב-lib/pricing.ts, ולפני משלוח. jsonb ולא שתי עמודות: `ProductType` הוא
  -- המקור, והוספת מוצר שלישי תהיה מפתח נוסף כאן ולא מיגרציה על כל קוד קיים.
  base_prices jsonb,

  -- אחוז הנחה מהמחירון, כשזה הכלל. התקרה אינה גחמה: קוד של 100% הוא הזמנה
  -- חינם, ומחרוזת שמישהו יעביר הלאה בוואטסאפ הופכת אז את החנות לפתוחה.
  percent_off numeric,

  -- כמה הזמנות הקוד מאפשר. NULL = בלי הגבלה. הספירה עצמה נגזרת מ-`orders`
  -- ואינה מונה כאן — ראו את ההערה על `referral_code_id` למטה.
  max_uses integer,

  expires_at timestamptz,

  -- כיבוי מיידי, בלי למחוק. מחיקת קוד הייתה מנתקת הזמנות שכבר נשענו עליו
  -- מהסיבה שבגללה הן תומחרו כך.
  active boolean not null default true,

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- צורת הקוד. לא קוסמטיקה: קוד שנקרא בטלפון או נכתב על שלט בחנות חייב להיות
  -- חד-משמעי, ורווח נעלם או נקודה בסוף משפט הם בדיוק מה שהופך "הקוד לא עובד"
  -- לשיחה. אורך מינימלי 3 כדי שלא ייווצר קוד שאפשר לנחש בשלוש הקשות.
  constraint referral_codes_code_shape check (code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),

  constraint referral_codes_kind check (kind in ('fixed_price', 'percent_off')),

  -- **הכלל וההגדרה שלו נבדקים יחד.** קוד `fixed_price` בלי מחירים, או קוד
  -- `percent_off` בלי אחוז, הוא קוד שיתמחר לבד ברגע שמישהו יממש אותו. עדיף
  -- שיסרב להיווצר.
  constraint referral_codes_rule_shape check (
    (kind = 'fixed_price' and base_prices is not null and percent_off is null)
    or
    (kind = 'percent_off' and percent_off is not null and base_prices is null
     and percent_off > 0 and percent_off <= 90)
  ),

  -- **שני המוצרים חייבים מחיר.** מפתח חסר היה נופל בשקט למחיר המחירון, כלומר
  -- לקוחה עם קוד תקין הייתה משלמת ‎₪399 בלי שאיש התכוון לכך.
  constraint referral_codes_prices_shape check (
    base_prices is null
    or (
      jsonb_typeof(base_prices) = 'object'
      and jsonb_typeof(base_prices -> 'bracelet') = 'number'
      and jsonb_typeof(base_prices -> 'ring') = 'number'
      and (base_prices ->> 'bracelet')::numeric >= 0
      and (base_prices ->> 'ring')::numeric >= 0
    )
  ),

  constraint referral_codes_max_uses_positive check (max_uses is null or max_uses > 0)
);

-- ייחודיות על הקוד עצמו. הנרמול נעשה בכתיבה ולא כאן ב-`upper()`, כדי
-- שהאינדקס יהיה פשוט וכדי שמה שמאוחסן יהיה מה שמוצג בבק־אופיס.
create unique index if not exists idx_referral_codes_code on referral_codes (code);

-- הטבלה נקראת ונכתבת ב-service role בלבד, כמו `orders` (0011): הקודים
-- הפעילים, המכסות והמחירים אינם מידע ציבורי — מי שיכול לקרוא אותם יכול גם
-- למצוא את הקוד בלי שהופנה. הוולידציה ללקוחה עוברת דרך המסלול בשרת.
alter table referral_codes enable row level security;

-- ===== ההזמנה זוכרת את הקוד =====
--
-- **שתי עמודות, לא אחת.** ‏`referral_code_id` הוא הקשר החי — הוא מה שמאפשר
-- לספור מכסה ולשאול "כמה הביאה החנות". ‏`referral_code` הוא צילום המחרוזת
-- כפי שנקלטה, מאותה משפחה כמו `length_mm` ו-`price` ב-0022: אם הקוד יימחק
-- אי-פעם, ההזמנה עדיין צריכה להסביר למה נגבו בה ‎₪180. חשבונית שאי אפשר
-- להצדיק היא בעיה חשבונאית, לא בעיית תצוגה.
alter table orders add column if not exists referral_code_id uuid references referral_codes(id) on delete set null;
alter table orders add column if not exists referral_code text;

-- **המכסה נספרת מכאן, ואין עמודת מונה.** מונה על `referral_codes` היה מחייב
-- להגדיל אותו ולהוסיף את ההזמנה בשתי פעולות נפרדות (אין כאן טרנזקציה מעבר
-- ל-PostgREST), ולכן היה נסחף: הגדלה שהצליחה לפני הוספה שנפלה = מקום שאבד
-- לתמיד, בלי דרך לדעת שזה מה שקרה. ספירה נגזרת אינה יכולה להיסחף, וניסיון
-- חוזר עם אותו `idempotency_key` מחזיר את אותה שורה ולכן אינו נספר פעמיים.
--
-- המחיר: שתי הזמנות שנשלחות באותה שנייה יכולות שתיהן לעבור את הבדיקה ולחרוג
-- באחת. במכסה של 25 מול תעבורה של חברים ומשפחה זה מקרה שלא ייווצר, ואם ייווצר
-- — מקום אחד עודף אינו נזק. הכיוון ההפוך, מקום שנעלם, כן.
--
-- ה-`status` באינדקס: הזמנה מבוטלת אינה תופסת מקום (ראו `countCodeUses`).
create index if not exists idx_orders_referral_code
  on orders (referral_code_id, status)
  where referral_code_id is not null;

notify pgrst, 'reload schema';
