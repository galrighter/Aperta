-- שיתוף עיצוב: לינק ציבורי שפותח דף נחיתה עם ההדמיה של העיצוב.
--
-- שלוש החלטות שכדאי שיהיו כתובות:
--
-- 1) **השורה מחזיקה צילום מצב, לא מצביע.** הדרך הקצרה הייתה לשמור `version_id`
--    ולקרוא ממנו את ה-SVG בכל צפייה. היא שגויה כאן משתי סיבות. הראשונה:
--    `designs` ממשיך להשתנות אחרי השיתוף — המידות נערכות, ולכן אותו SVG היה
--    מוצג בעוד שבוע במסגרת אחרת. השנייה, והחמורה: גרסה **אינה** בלתי־משתנה.
--    `ingestCutouts(replaceVersionId)` דורס שורת גרסה קיימת כשעוברים בין
--    ההצעות של אותה הרצה, כך שלינק שנשלח בוואטסאפ היה מציג עיצוב אחר מזה
--    שנשלח — בלי ששולח הלינק עשה דבר. מה שנשלח הוא מה שנשמר.
--
-- 2) **הטוקן אינו ה-uuid של העיצוב.** מזהה אקראי נפרד הופך את השיתוף לפעולה
--    מפורשת: מי שמחזיק uuid של עיצוב (הוא עובר ב-API של הבעלים) אינו מקבל דרכו
--    דף ציבורי, וביטול שיתוף אפשרי בלי לגעת בעיצוב עצמו.
--
-- 3) **`material` נשמר ולא מחושב בצפייה.** ההדמיה התלת־ממדית צריכה את
--    הפוליגונים, והמסלול הקיים משיג אותם בקריאת `POST /api/validate` מהדפדפן.
--    בדף ציבורי זה סבב רשת וחישוב חיתוך פוליגונים לפני שרואים משהו, על עמוד
--    שנפתח ברובו מלינק בטלפון. מחושב פעם אחת, ביצירת השיתוף.

create table if not exists design_shares (
  id uuid primary key default gen_random_uuid(),
  -- המזהה שבכתובת. base58, 12 תווים (ראו src/lib/shareToken.ts).
  token text not null unique,

  design_id uuid references designs(id) on delete cascade not null,
  version_id uuid references design_versions(id) on delete set null,

  -- ===== צילום המצב ששותף (ראו החלטה 1) =====
  product_type text not null check (product_type in ('bracelet', 'ring')),
  length_mm numeric not null,
  width_mm numeric not null,
  gap_mm numeric not null,
  thickness_mm numeric not null,
  -- ה-SVG הקנוני כפי שהיה ברגע השיתוף.
  svg text not null,
  -- הפוליגונים של המתכת (MultiPolygon) להדמיה. null = ההדמיה תיפול לתצוגה
  -- השטוחה, בדיוק כמו גרסה שחזרה בלי גאומטריה במסע היצירה.
  material jsonb,
  -- נתיב ההדמיה שמודל התמונה ייצר, ב-storage. משמש כתמונת השיתוף (og:image)
  -- ולא בגוף העמוד. null = נופלים לתמונת ברירת המחדל של האתר.
  render_path text,
  -- המספר הסידורי כפי שהיה בשיתוף (RM-0007). מוצג בדף.
  serial bigint,

  created_at timestamptz not null default now(),
  -- ביטול שיתוף. השורה נשארת כדי שהטוקן לא ימוחזר ושהצפיות לא יאבדו.
  revoked_at timestamptz,
  views integer not null default 0,
  -- סימון ידני בבק־אופיס: עיצוב שראוי להופיע בגלריה הציבורית. דפי השיתוף
  -- עצמם הם noindex (ראו docs/SHARING.md) — זה הפתח היחיד מהם לתוכן מאונדקס.
  featured boolean not null default false
);

-- שיתוף חוזר של אותה גרסה מחזיר את אותו לינק ולא מייצר עוד אחד. חלקי, כי
-- שיתוף מבוטל אינו תופס את המקום של אחד חדש.
create unique index if not exists idx_design_shares_design_version
  on design_shares (design_id, version_id)
  where revoked_at is null;

create index if not exists idx_design_shares_design on design_shares (design_id);
create index if not exists idx_design_shares_created on design_shares (created_at desc);
create index if not exists idx_design_shares_featured
  on design_shares (created_at desc) where featured;

-- ספירת צפייה כפעולה אטומית. `update ... set views = views + 1` בתוך פונקציה
-- ולא קריאה-שינוי-כתיבה מהשרת: שני מבקרים בו-זמנית על אותו לינק (וזה בדיוק מה
-- שקורה כשהוא נשלח לקבוצה) היו קוראים את אותו מספר וכותבים אותו בחזרה.
create or replace function increment_share_views(share_id uuid)
returns void
language sql
as $$
  update design_shares set views = views + 1 where id = share_id;
$$;

-- RLS: אין גישת קליינט ישירה — הכול דרך service role שעוקף RLS. החשיפה
-- הציבורית עוברת במסלול השרת, שבוחר במפורש אילו שדות יוצאים (ולא, למשל, את
-- דוח הוולידציה או את הפרומפט של המשתמש).
alter table design_shares enable row level security;

-- PostgREST עונה מתוך schema cache. בלי הרענון הזה הטבלה קיימת ב-Postgres
-- וה-API מחזיר "Could not find ... in the schema cache" — כפי שקרה אחרי
-- 0004/0005 והצריך את 0006.
notify pgrst, 'reload schema';
