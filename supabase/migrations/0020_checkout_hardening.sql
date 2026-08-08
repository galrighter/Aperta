-- הקשחת הצ'קאאוט: הזמנה כפולה, אישור תנאים, הסכמת דיוור, וכתובת שנשמרת.
--
-- ארבעה דברים שהמסך הקודם לא יכול היה לומר עליהם דבר, וכולם נמדדים בשורה
-- ולא בזיכרון של הדפדפן:
--
-- 1) **הזמנה כפולה.** הכפתור ננעל בזמן השליחה, אבל רשת שנתקעת ואז "אפשר לנסות
--    שוב" יוצרת שתי שורות עם אותו עיצוב, ואי אפשר לדעת בדיעבד אם הלקוחה
--    התכוונה לשתיים. `idempotency_key` נוצר פעם אחת למסך הצ'קאאוט: ניסיון
--    שני עם אותו מפתח מחזיר את ההזמנה הקיימת במקום ליצור אחת נוספת.
--    האינדקס חלקי — הזמנות שנוצרו לפני המיגרציה, ומסלול המייל, נשארות NULL
--    ואינן מתנגשות זו בזו.
--
-- 2) **אישור התנאים.** עד כה הוא נאכף בדפדפן בלבד (`s.terms` במסך הסיכום):
--    ההזמנה נשמרה בלי שום עדות שמישהו אישר משהו. `terms_accepted_at` הוא
--    חותמת זמן ולא boolean — "אישרה" בלי "מתי" אינו ראיה.
--
-- 3) **הסכמת דיוור, בנפרד מההזמנה.** חוק התקשורת (סעיף 30א) דורש הסכמה
--    מפורשת לדבר פרסומת. מייל שנמסר כדי לקבל אישור הזמנה אינו הסכמה לדיוור,
--    ולכן זו עמודה משלה שברירת המחדל שלה false.
--
-- 4) **הכתובת נשמרת בפרופיל.** הצילום ב-`orders` נשאר כפי שהוא — הוא של
--    ההזמנה ההיא — אבל בלי עותק ברמת האדם, כל הזמנה שנייה מתחילה מטופס ריק.

-- ===== 1–3: ההזמנה =====

alter table orders add column if not exists idempotency_key text;
alter table orders add column if not exists terms_accepted_at timestamptz;
alter table orders add column if not exists marketing_opt_in boolean not null default false;

create unique index if not exists idx_orders_idempotency
  on orders (idempotency_key)
  where idempotency_key is not null;

-- ===== 4: הכתובת האחרונה של האדם =====

alter table profiles add column if not exists street text;
alter table profiles add column if not exists city text;
alter table profiles add column if not exists zip text;

notify pgrst, 'reload schema';
