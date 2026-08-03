-- הגבלת קצב מבוססת-מסד, לפי דלי (למשל "admin_login:<ip>"). כל ניסיון מוסיף
-- שורה, והבדיקה סופרת שורות בחלון הזמן. אין KV מוגדר ל-Worker, וההגבלה הקיימת
-- לפי מייל כבר מבוססת-DB — טבלה אחת נותנת הגבלה אחידה לכל הנתיבים בלי תשתית חדשה.

create table if not exists rate_events (
  id uuid primary key default gen_random_uuid(),
  -- "<action>:<identifier>", למשל "admin_login:1.2.3.4".
  bucket text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_events_bucket_time
  on rate_events (bucket, created_at desc);

-- RLS: אין גישת קליינט — הכול דרך service role. ספירה פנימית בלבד.
alter table rate_events enable row level security;

-- PostgREST עונה מתוך schema cache; בלי הרענון הטבלה קיימת אבל ה-API מחזיר
-- "Could not find ... in the schema cache".
notify pgrst, 'reload schema';
