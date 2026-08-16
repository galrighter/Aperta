-- ‏`public` מפסיק להיות תלוי ב-`auth`.
--
-- **מה שהתגלה בתרגיל שחזור (16.8).** ‏`profiles.auth_user_id` נשא FK
-- ל-`auth.users` — טבלה של Supabase Auth שאינה בסכימה `public`, ולכן אינה
-- ב-`pg_dump --schema=public`, כלומר **אינה בגיבוי**. בשחזור לפרויקט חדש
-- ‏`auth.users` קיימת אבל ריקה (המשתמשים נכנסים מחדש במייל), והמשפט שמוסיף
-- את ה-FK — שרץ בסוף, אחרי שכל הנתונים כבר נטענו — נכשל:
--
--     ERROR: insert or update on table "profiles" violates foreign key
--     constraint "profiles_auth_user_id_fkey"
--     DETAIL: Key (auth_user_id)=(…) is not present in table "users".
--
-- כלומר הגיבוי לא היה בר-שחזור בפעולה אחת, וזה היה מתגלה בזמן חירום.
--
-- ===== למה ההסרה בטוחה =====
--
-- מה שה-FK אכף היה **שני** דברים בלבד: שהערך הוא משתמש קיים, ואיפוס אוטומטי
-- במחיקת משתמש. מה שהוא **לא** אכף — ששני פרופילים לא יצביעו לאותו משתמש —
-- נאכף ב-`idx_profiles_auth_user`, אינדקס ייחודי נפרד שנשאר על כנו.
--
-- ‏`linkAuthUser` (`src/lib/db/accounts.ts`) מחפש פרופיל בשלושה צעדים: לפי
-- `auth_user_id`, אחרת לפי **מייל** — ואז הוא **דורס** את `auth_user_id` —
-- ואחרת יוצר חדש. כלומר מזהה שהתייתם מתקן את עצמו בכניסה הבאה.
--
-- ואין תרחיש שבו לקוחה מגיעה לעיצוב של אחרת: הבעלות נפתרת ממזהה הסשן, ולמשתמש
-- מחוק אין סשן — כלומר שורה מיותמת פשוט אינה ניתנת להגעה. ‏uuid חדש לא יתנגש
-- בישן.
--
-- **מה שכן אובד:** מזהה מת יכול להישאר בשורה עד שאותו אדם ייכנס שוב, והמסד
-- מפסיק להיות שכבת אכיפה שנייה מאחורי הקוד. את שניהם מחליף `dangling_auth_links`
-- למטה: ה-FK מנע את המצב, החיישן אומר שהוא קרה.
--
-- (מחיקת משתמש אימות מעולם לא הייתה מחיקת מידע: השם, המייל והטלפון יושבים
-- ב-`profiles` וב-`orders` ללא קשר ל-FK. מחיקה אמיתית היא פעולה נפרדת.)

alter table profiles drop constraint if exists profiles_auth_user_id_fkey;

-- לא נגענו: `idx_profiles_auth_user` — הוא זה שמונע שני פרופילים לאותו משתמש.

-- ===== החיישן שמחליף את ה-FK =====
--
-- ‏`security definer` כי `auth.users` אינה חשופה ב-PostREST, ו-`stable` כי זו
-- קריאה בלבד. מחזיר מספר ותו לא — אין כאן מזהים ואין מידע אישי, ולכן אפשר
-- להציג אותו בסטטוס התפעולי בלי לחשוב פעמיים.
--
-- `search_path` ננעל: פונקציית `security definer` בלי נעילה כזאת היא הדרך
-- הקלאסית להסלמת הרשאות דרך schema שנשתל בנתיב.
create or replace function public.dangling_auth_links()
returns integer
language sql
stable
security definer
set search_path = public, auth
as $$
  select count(*)::int
  from profiles p
  where p.auth_user_id is not null
    and not exists (select 1 from auth.users u where u.id = p.auth_user_id);
$$;

-- מ-`public` בלבד, ובכוונה: ‏`anon` ו-`authenticated` אינם מקבלים הרשאה
-- משלהם על הפונקציה — הם יורשים אותה מ-PUBLIC, וביטולה שם מספיק. וזה גם
-- היחיד שנייד: התפקידים של Supabase אינם קיימים בהתקנת Postgres רגילה,
-- ומיגרציה שנשענת עליהם נופלת בכל שחזור ובכל בדיקה מקומית
-- (`role "anon" does not exist`).
revoke all on function public.dangling_auth_links() from public;

notify pgrst, 'reload schema';
