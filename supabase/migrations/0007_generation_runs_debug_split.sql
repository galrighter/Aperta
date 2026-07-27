-- ה-debug של הרצה מחזיק מועמד לכל שילוב סף/טולרנס, וכל מועמד נושא שני SVG
-- מלאים. הרשימה לא מציגה אותם — slimDebug מסיר אותם ב-JS — אבל היא קוראת
-- אותם: 80 שורות x עד 13 מועמדים x 2 SVG בכל שאילתה, עד statement timeout.
--
-- has_svg (0004) טיפל בעמודת ה-svg העליונה, שהיא החצי הקטן. כאן מפרידים את
-- החצי הגדול: debug נשאר קל ומכיל את מה שהרשימה מציגה, debug_full מחזיק את
-- ה-SVG-ים ונקרא רק בפתיחת הרצה.

alter table generation_runs add column if not exists debug_full jsonb;

-- העברה חד-פעמית לשורות שנשמרו לפני הפיצול: מעתיקים את ה-debug המלא הצידה
-- ומקלפים את ה-SVG-ים מהעותק שנשאר. מוגן ב-debug_full is null כדי שהרצה
-- חוזרת של ההגירה לא תעתיק debug שכבר קולף ותאבד את המקור.
update generation_runs
set
  debug_full = debug,
  debug = jsonb_set(
    debug,
    '{candidates}',
    (
      select coalesce(jsonb_agg(c - 'metal_svg' - 'cutouts_svg'), '[]'::jsonb)
      from jsonb_array_elements(debug -> 'candidates') c
    )
  )
where debug_full is null
  and jsonb_typeof(debug -> 'candidates') = 'array';

notify pgrst, 'reload schema';
