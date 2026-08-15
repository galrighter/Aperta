-- ראש המשפך — חמשת האירועים שאין עליהם היום שום נתון.
--
-- **מה כבר נמדד ומה לא.** שכבת הנתונים התחתונה מצוינת: ‏designs, ‏versions,
-- ‏orders, ‏generation_runs ו-shares ניתנים לשליפה ב-SQL היום, ולכן "כמה
-- הזמנות" ו"כמה יצירות" הן שאלות פתורות. מה שחסר לגמרי הוא **מה קרה לפני**:
-- כמה נכנסו, מאיפה, וכמה נטשו לפני העיצוב הראשון. בלי זה אי אפשר לדעת אם
-- המשפך דולף בכניסה או בצ'קאאוט, וכל החלטת שיווק היא ניחוש
-- (docs/FULL_AUDIT_2026-08.md, פרק 6, §KPIs).
--
-- **למה טבלה ולא ספק חיצוני.** ‏Cloudflare Web Analytics (חינם, בלי עוגיות)
-- נותן ביקורים ומקורות אבל לא אירועי משפך, ו-Plausible עולה. הטבלה הזאת
-- נותנת בדיוק את חמשת האירועים שנדרשים, יושבת באותו מסד שכל השאר יושב בו,
-- ומאפשרת לחבר משפך להזמנה **באותה שאילתה**. השניים לא סותרים: הביקון של
-- Cloudflare נדלק בנפרד כשמוגדר טוקן.
--
-- **פרטיות — מה במפורש לא נשמר כאן.** אין IP, אין user-agent, אין מזהה
-- שמחזיק בין ביקורים, ואין עוגייה. `session_key` הוא מספר אקראי שנוצר
-- ב-sessionStorage ומת עם הלשונית; תפקידו היחיד הוא לחבר "נכנסה" ל"התחילה
-- לעצב" באותו ביקור. ‏`referrer_host` הוא **הוסט בלבד** ולא ה-URL המלא —
-- כתובת מלאה של מפנה יכולה לשאת מזהים אישיים. בזכות זה אין כאן מידע אישי
-- ואין צורך בבאנר.
--
-- **המחיקה חלק מהעיצוב.** אירועי משפך נשאלים בטווח של שבועות; שורה בת חצי
-- שנה היא נפח בלבד. ‏`sweepFunnelEvents` מוחק מעל 180 יום.

create table if not exists funnel_events (
  id bigserial primary key,

  -- הרשימה סגורה בכוונה: אירוע חופשי הוא טבלה שמתמלאת בשמות שאיש לא זוכר,
  -- ושאילתה שלא ניתן לכתוב מראש. הרחבה = מיגרציה, וזה בסדר.
  event text not null check (event in (
    'page_view',      -- ביקור בעמוד ציבורי
    'design_start',   -- נלחץ "צור" — הכניסה האמיתית למשפך
    'first_version',  -- הגרסה הראשונה הוצגה ללקוחה
    'checkout_view',  -- מסך הצ'קאאוט נצפה
    'order_placed',   -- ההזמנה נשלחה
    'share_view'      -- ‏/d/<token> — עיצוב שנצפה דרך שיתוף
  )),

  -- הנתיב בלבד, בלי query string: פרמטרים יכולים לשאת מזהים.
  path text,
  -- ‏host בלבד. ראו ההערה למעלה.
  referrer_host text,
  utm_source text,
  device text check (device in ('mobile','desktop')),
  -- אקראי, פר-לשונית, מת איתה. לא מזהה אדם ולא נשמר אצלו.
  session_key text,
  -- כשידוע — מחבר את האירוע לעיצוב, ודרכו להזמנה. ‏set null במחיקה: אירוע
  -- אינו נעלם כשהעיצוב נמחק, הוא רק מפסיק להצביע.
  design_id uuid references designs(id) on delete set null,

  created_at timestamptz not null default now()
);

-- שתי השאלות שנשאלות: "מה קרה בשבוע האחרון" ו"כמה מכל שלב". שני האינדקסים
-- הם בדיוק הן.
create index if not exists idx_funnel_events_created on funnel_events(created_at desc);
create index if not exists idx_funnel_events_event on funnel_events(event, created_at desc);
create index if not exists idx_funnel_events_session on funnel_events(session_key);

-- כמו `orders`: אין גישת קליינט ישירה. הכתיבה עוברת דרך `/api/events` עם
-- service role, כדי שהמפתח הציבורי לא יאפשר להזריק אירועים או לקרוא אותם.
alter table funnel_events enable row level security;

notify pgrst, 'reload schema';
