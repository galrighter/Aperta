-- יצירה עמידה לניתוק. עד כה /api/generate הייתה בקשה סינכרונית אחת של ~30-90
-- שניות: אם החיבור נקטע באמצע — סלולר שמתחלף, מסך שננעל, טאב שנרדם — העבודה
-- הושלמה בשרת והלקוחה קיבלה שגיאה, בלי דרך לחזור אליה.
--
-- הבקשה נרשמת כאן ומוחזרת מיד; העבודה ממשיכה ברקע וכותבת לשורה הזו. הלקוחה
-- מושכת את המצב, וניתוק הוא רק הפסקה במשיכה — לא אובדן.
--
-- הערה תפעולית: ה-migrate workflow חייב SUPABASE_DB_URL של ה-Session pooler
-- (host: *.pooler.supabase.com, IPv4). החיבור הישיר הוא IPv6-only.

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  design_id uuid references designs(id) on delete cascade,
  -- ההרצה המקבילה ביומן הבק־אופיס (generation_runs), לאבחון.
  run_id uuid,
  -- 'running' (רצה) | 'done' (הסתיימה) | 'error' (נכשלה)
  status text not null check (status in ('running', 'done', 'error')),
  -- לאן הגיעה, להצגת התקדמות: 'rendering' | 'saving'
  stage text,
  -- התשובה המלאה שהמסלול היה מחזיר קודם, כמו שהיא.
  result jsonb,
  -- { code, message } — אותו חוזה שגיאה של שאר ה-API.
  error jsonb
);

create index if not exists idx_generation_jobs_design on generation_jobs(design_id);
create index if not exists idx_generation_jobs_created on generation_jobs(created_at desc);

-- RLS: אין גישת קליינט ישירה — הכול דרך service role שעוקף RLS.
alter table generation_jobs enable row level security;

-- הערה: ההגירה נכשלה ב-27.7 כי SUPABASE_DB_URL הצביע על החיבור הישיר
-- (db.<ref>.supabase.co), שהוא IPv6-only, ו-runners של GitHub הם IPv4 —
-- "Network is unreachable" על 0001, כלומר psql לא התחבר בכלל.
