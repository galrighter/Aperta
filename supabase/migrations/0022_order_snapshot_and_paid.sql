-- ההזמנה זוכרת את מה שהוזמן, ויודעת אם שולם.
--
-- שני חורים שנמצאו באבחון 14.8 (docs/FULL_AUDIT_2026-08.md, פרק 3, ממצאים
-- 3 ו-6), ושניהם אותו סוג: מידע שקיים בזמן ההזמנה ולא נשמר, ולכן נקרא אחר כך
-- ממקום שיכול היה להשתנות מאז — או לא נקרא בכלל.
--
-- ===== 1. צילום המידות (ממצא 3) =====
--
-- `orders` שמר את מה שהלקוחה **בחרה** (היקף, רוחב, ישיבה) אבל לא את מה
-- שנגזר לייצור: אורך הפריסה, הפער והעובי. `orderedDesignInfo` קרא אותם
-- מהשורה החיה של העיצוב — למרות שההערה מעליו מבטיחה "הגרסה שהוזמנה" —
-- ולכן:
--
--   · במסלול Story המידה נשאלת אחרי שיש עיצוב, ושינוי מידה **אחרי** ההזמנה
--     שינה בשקט את הוראות הערגול שהאדמין רואה.
--   · `PATCH /api/designs/[id]` קיבל כל מספר חיובי; עובי 0.001 הפיל את
--     `GET /api/orders/[id]` ב-500 (‏`resolveFab` לא מוצא עובי כזה).
--
-- שלוש העמודות הן **צילום**, לא מקור: הן נכתבות פעם אחת ביצירת ההזמנה ואינן
-- מתעדכנות. הזמנות שקדמו למיגרציה נשארות NULL, ו-`orderedDesignInfo` נופל
-- אצלן לעיצוב החי כמו קודם — התנהגות ישנה למי שאין לו צילום, ולא ניחוש.
--
-- ===== 2. `paid_at` (ממצא 6) =====
--
-- הצינור הוא sent→approved→in_production→shipped, בלי paid. אין סליקה
-- באתר (TODO C), ולכן התשלום מגיע בהעברה/ביט ומסומן ידנית — כלומר "נחתך פליז
-- בלי שהתקבל כסף" היה עניין של שכחה אנושית בלבד, בלי שום מקום במסד לשאול בו.
--
-- **חותמת ולא boolean**, מאותה סיבה ש-`terms_accepted_at` הוא חותמת: "שולם"
-- בלי "מתי" אינו רשומה חשבונאית. `paid_at` אינו סטטוס ואינו חלק מהצינור —
-- הזמנה יכולה להיות משולמת ועדיין לא מאושרת, ומאושרת ועדיין לא משולמת. מי
-- שמתריע על השנייה הוא הבק־אופיס (`AdminOrders`), לא ה-check constraint.

alter table orders add column if not exists length_mm numeric;
alter table orders add column if not exists gap_mm numeric;
alter table orders add column if not exists thickness_mm numeric;
alter table orders add column if not exists paid_at timestamptz;

-- "מה מחכה לתשלום" היא השאלה של תור העבודה, ולכן היא אינדקס ולא סריקה.
create index if not exists idx_orders_unpaid
  on orders (created_at desc)
  where paid_at is null;

notify pgrst, 'reload schema';
