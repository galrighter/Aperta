-- הזמנה היא ישות, לא "פנייה" (docs/TODO.md B1–B3, D1–D3).
--
-- עד כאן כל הזמנה נדחסה ל-`inquiries` — טבלת טופס־צור־קשר — כשכל מה שיש בה
-- יושב ב-`message` כטקסט חופשי: המידות, המחיר, ומזהה העיצוב כ-uuid בתוך שורה.
-- שלוש תוצאות מעשיות, וכולן נראו:
--   · אי אפשר לשאול "מה בייצור" — אין סטטוס מעבר ל-new/contacted/closed,
--     שהם מצבים של פנייה ולא של הזמנה.
--   · אי אפשר לעבור מהזמנה לקובץ החיתוך בלי לחפש את העיצוב ידנית לפי מספר.
--   · המחיר שנרשם הוא מה שהדפדפן אמר, ורק כסכום אחד — בלי הפירוט שהחשבונית
--     תצטרך ממילא.
--
-- `inquiries` נשארת למה שהיא: פניות יצירת קשר. ההזמנות ההיסטוריות שכתובות בה
-- **לא** מומרות — חילוץ מידות ומחיר מטקסט חופשי בעברית הוא ניחוש שנשמר כאילו
-- הוא נתון. הן נשארות שם וניתן לראותן בלשונית "פניות".

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  -- הרפרנס האנושי שהלקוחה רואה ואומרת בטלפון (`RM-0047`). נגזר ממספר העיצוב,
  -- ולכן אינו unique: אפשר להזמין את אותו עיצוב פעמיים.
  ref text,

  -- מה הוזמן. on delete set null ולא cascade: מחיקת עיצוב לא מוחקת הזמנה —
  -- היסטוריה מסחרית שורדת את מה שהיא מצביעה עליו.
  design_id uuid references designs(id) on delete set null,
  -- הגרסה **שהוזמנה**, לא "הנוכחית". אחרי שהלקוחה מזמינה היא יכולה להמשיך
  -- לערוך; מה שנחתך חייב להיות מה שהיא אישרה.
  version_id uuid references design_versions(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,

  -- צילום פרטי הלקוחה ברגע ההזמנה. כפילות מכוונת מול `profiles`: כתובת
  -- למשלוח היא של ההזמנה הזאת, ושינוי בפרופיל אחר כך לא משנה לאן נשלח מה
  -- שכבר נשלח.
  name text not null,
  email text not null,
  phone text,
  street text,
  city text,
  zip text,

  product_type text check (product_type in ('bracelet','ring')),
  circumference_mm numeric,
  width_mm numeric,
  fit text check (fit in ('tight','regular','loose')),
  cuts integer,
  brief text,

  -- הפירוט המלא (base/widthAdd/complexity/packaging/shipping/tax/total),
  -- כפי שחושב **בשרת**. jsonb ולא עמודות: זו רשומה היסטורית של מחירון שיכול
  -- להשתנות, לא שדות שמסננים לפיהם.
  price jsonb,

  status text not null default 'sent'
    check (status in ('sent','approved','in_production','shipped','cancelled')),
  -- כל מעבר סטטוס, לפי הסדר: [{ status, at }]. בלי זה "מתי זה נכנס לייצור"
  -- הוא שאלה שאין עליה תשובה שבוע אחרי.
  status_history jsonb not null default '[]',
  -- הערה פנימית לגל. לא נשלחת ללקוחה.
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_created on orders(created_at desc);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_email on orders(email);
create index if not exists idx_orders_design on orders(design_id);

-- RLS: אין גישת קליינט ישירה — הכול דרך service role שעוקף RLS. מפעילים בלי
-- policies כדי שה-public key לא יחשוף כלום גם אם ידלוף.
alter table orders enable row level security;

notify pgrst, 'reload schema';
