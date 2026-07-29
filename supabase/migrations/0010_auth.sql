-- כניסה מאומתת: קישור בין `auth.users` (שמנהל את האימות) לבין `profiles`
-- (שממשיך להיות מי שהעיצוב שייך לו).
--
-- הפרדה מכוונת: Supabase Auth מחזיק את הזהות — קוד במייל, חשבון גוגל, רענון
-- סשן — ו-`profiles` מחזיק את הבעלות. `designs.profile_id` לא משתנה, ולכן
-- המכסה היומית, רשימת העיצובים וה-FK ממשיכים לעבוד בדיוק כמו קודם.

alter table profiles add column if not exists auth_user_id uuid
  references auth.users(id) on delete set null;

-- `on delete set null` ולא `cascade`: מחיקת משתמש אימות אינה סיבה למחוק את
-- העיצובים שלו. הפרופיל נשאר, מנותק, וניתן לשיוך מחדש באותו מייל.

create unique index if not exists idx_profiles_auth_user
  on profiles (auth_user_id) where auth_user_id is not null;

-- PostgREST עונה מתוך schema cache. בלי הרענון הזה העמודה קיימת ב-Postgres
-- וה-API מחזיר "Could not find ... in the schema cache" — בדיוק מה שקרה אחרי
-- 0004/0005 והצריך את 0006.
notify pgrst, 'reload schema';
