-- PostgREST (ה-API של Supabase) עונה מתוך schema cache, לא מתוך ה-DB. אחרי
-- 0004/0005 העמודה והטבלה קיימות ב-Postgres, אבל ה-API עוד החזיר "Could not
-- find ... in the schema cache" — כלומר listRuns נפל לנסיגה, שם נשאב ה-SVG
-- המלא של 80 הרצות, ו-Postgres חתך אותה ב-statement timeout. שדרוג שנראה כמו
-- רגרסיה, רק בגלל cache.
--
-- ה-notify הזה מבקש רענון. הוא זול, בטוח, ורץ בכל הרצת הגירה — ולכן כל DDL
-- עתידי מקבל את הרענון שלו בלי לזכור לבקש.

notify pgrst, 'reload schema';
