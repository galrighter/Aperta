-- dialogue mode — הערך `dialogue` מותר בעמודת המסלול (0024).
--
-- **מה נשבר בלעדיו, ואיך זה התגלה.** ‏0024 קיבע רשימה סגורה —
-- `check (mode in ('story'))` — ושלב B (הראיון, #300) שומר את המסלול על
-- הרשומה באותה עמודה. הריצה החיה הראשונה דרך `/dialogue/create` (20.8,
-- ‏21:26 UTC) נפלה בדיוק שם: ‏insert של `mode: 'dialogue'` הפר את האילוץ
-- (23514), יצירת העיצוב כולה החזירה 500, ואף שורה לא נכתבה ליומן — הכשל
-- קדם ל-`/api/generate`. הנפילה-לאחור ב-`/api/designs` תפסה רק "עמודה
-- חסרה", לא הפרת אילוץ; היא הורחבה לצידה של המיגרציה הזו.
--
-- drop-ואז-add ולא עריכה: ‏CHECK אינו ניתן לעדכון במקום. עטוף כך שהרצה
-- חוזרת (סביבה שכבר קיבלה את התיקון ידנית) עוברת בשקט.

do $$
begin
  alter table designs drop constraint if exists designs_mode_check;
  alter table designs add constraint designs_mode_check
    check (mode is null or mode in ('story', 'dialogue'));
end $$;

notify pgrst, 'reload schema';
