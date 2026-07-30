-- היומן צריך לדעת רק *האם* להרצה יש SVG, אבל PostgREST לא מאפשר ביטוי מחושב
-- ב-select, אז הרשימה משכה את ה-svg המלא של 80 הרצות (כ-31KB כל אחת) כדי
-- לחשב בוליאני אחד — 451KB ו-13.7 שניות לפתיחת הדף.
--
-- עמודה מחושבת מזיזה את החישוב ל-DB: הרשימה בוחרת אותה ולא נוגעת ב-svg בכלל.
-- generated always ... stored נשמרת עם השורה ומתעדכנת אוטומטית בכל כתיבה, כך
-- שאין דרך שהיא תסתור את ה-svg — הבעיה שהופכת דגל מטמון לשקר.
--
-- הערה תפעולית: ה-migrate workflow חייב SUPABASE_DB_URL של ה-Session pooler
-- (host: *.pooler.supabase.com, IPv4). החיבור הישיר הוא IPv6-only ו-runners של
-- GitHub Actions לא מגיעים אליו ("Network is unreachable").

alter table generation_runs
  add column if not exists has_svg boolean
  generated always as (svg is not null) stored;
