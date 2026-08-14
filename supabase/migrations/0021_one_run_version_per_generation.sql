-- הרצה אחת של המנוע = שורת גרסה אחת. נאכף במסד, ולא רק בסדר הקריאות.
--
-- **מה זה מונע.** `ingestCutouts` כותב גרסה בסוף הצינור, ו-`insertVersion`
-- תמיד מוסיפה שורה. כל עוד רק קורא אחד מריץ את הצינור להרצה נתונה זה נכון —
-- אבל מאז C2 יש שלושה: הבקשה שפתחה, המשיכה של הלקוחה
-- (`api/generate/[jobId]`), והסריקה (`runs/sweep.ts`). ההגנה עד כה הייתה
-- בדיקה-ואז-פעולה ("יש כבר גרסה להרצה הזו?"), וזו בדיוק ההגנה שאובדת במרוץ.
--
-- מה שנמדד (14.8, סריקה על כל `design_versions`):
--
--   · AP-0157 (13.8, 21:21) — שתי שורות `run` לאותו `generation_id`, בהפרש
--     3 שניות, אותו md5. השנייה נוצרה מהרצה חוזרת של אותו job שאספה מהקופסה
--     את ההדמיה ששולמה כבר (3.7ש׳ מול 48–62ש׳ בהרצה אמיתית).
--   · AP-0112/AP-0113 (11.8) — חמור יותר: זו הייתה **עריכה**, ולכן כל ריצה
--     קראה ל-`createSampleDesign` ויצרה עיצוב שלם משלה. שתי דוגמאות זהות של
--     AP-0111 בהפרש חצי שנייה, ושתיהן מופיעות ללקוחה ברשימה.
--
-- שתיהן קדמו ל-`claimRecovery` (#222, 13.8 22:38), ומאז אין אף מקרה. כלומר
-- הקובץ הזה אינו התיקון אלא הרשת מתחתיו: `claimRecovery` מסדר מי רץ, והאינדקס
-- מבטיח שגם אם הסדר הזה ייפרץ אי-פעם, התוצאה תהיה התנגשות ולא כפילות שקטה.
--
-- **וההתנגשות אינה כשל ללקוחה.** `insertVersion` תופסת אותה ומחזירה את השורה
-- הקיימת — כלומר בדיוק מה שהקורא השני היה צריך מלכתחילה. בלי זה האינדקס היה
-- הופך כפילות שקטה ל-500, וזה גרוע יותר.
--
-- **אידמפוטנטי, כי migrate מריץ את כל הקבצים בכל פריסה.** שתי המחיקות מנוסחות
-- כתנאים שהופכים לריקים אחרי הפעם הראשונה, והאינדקס הוא `if not exists`.

-- ---------------------------------------------------------------------------
-- 1. דוגמאות כפולות — עיצוב שלם שנולד מריצה שנייה של אותה עריכה.
--
-- קודם לניקוי הגרסאות: כאן נמחק **העיצוב**, והגרסה יורדת איתו ב-CASCADE.
-- אילו הסדר היה הפוך, מחיקת הגרסה הייתה משאירה עיצוב בלי אף גרסה ועם
-- `current_version_id` שמצביע לשומקום.
--
-- הזהירות היא במה שלא נמחק: רק דוגמה (`root_design_id is not null`), רק כזו
-- שיש לה בדיוק גרסה אחת, ורק אם אין עליה הזמנה, ייצוא או שיתוף. התאום
-- המוקדם יותר הוא זה שנשאר, והשוואת `(created_at, id)` נותנת הכרעה יציבה גם
-- אם שתי השורות נכתבו באותה מילישנייה.
delete from designs d
where d.root_design_id is not null
  and (select count(*) from design_versions v where v.design_id = d.id) = 1
  and not exists (select 1 from orders o where o.design_id = d.id)
  and not exists (select 1 from exports e where e.design_id = d.id)
  and not exists (select 1 from design_shares s where s.design_id = d.id)
  and exists (
    select 1
    from design_versions mine
    join design_versions twin
      on twin.generation_id = mine.generation_id
     and twin.design_id <> mine.design_id
     and md5(twin.svg) = md5(mine.svg)
     and (twin.created_at, twin.id) < (mine.created_at, mine.id)
    where mine.design_id = d.id
      and mine.generation_id is not null
      and mine.candidates is not null
      and mine.candidates <> '[]'::jsonb
  );

-- ---------------------------------------------------------------------------
-- 2. שורות `run` כפולות בתוך אותו עיצוב — נשארת המוקדמת.
--
-- `candidates <> '[]'` הוא מה שמבדיל `run` מ-`pick` (ראו `lib/versionRole.ts`):
-- שורת בחירה נושאת `picked_index` בלי הצעות, והיא **לגיטימית** לצד שורת ההרצה
-- — היא המצביע לאיזו הצעה מוצגת. רוב הכפילויות במסד הן בדיוק זה, ואין לגעת בהן.
--
-- ושוב, רק מה שאיש לא מצביע עליו: לא `current_version_id`, לא הזמנה, לא ייצוא
-- ולא שיתוף. גרסה שכן מוצבעת נשארת גם אם היא כפולה — התיקון הזה לא שווה
-- שבירה של רשומה חיה.
delete from design_versions v
where v.generation_id is not null
  and v.candidates is not null
  and v.candidates <> '[]'::jsonb
  and exists (
    select 1 from design_versions k
    where k.generation_id = v.generation_id
      and k.id <> v.id
      and k.candidates is not null
      and k.candidates <> '[]'::jsonb
      and (k.created_at, k.id) < (v.created_at, v.id)
  )
  and not exists (select 1 from designs d where d.current_version_id = v.id)
  and not exists (select 1 from orders o where o.version_id = v.id)
  and not exists (select 1 from exports e where e.version_id = v.id)
  and not exists (select 1 from design_shares s where s.version_id = v.id);

-- ---------------------------------------------------------------------------
-- 3. האילוץ עצמו.
--
-- חלקי, ועל שורות ההרצה בלבד: שורת `pick` חולקת `generation_id` עם ההרצה
-- שממנה נבחרה, וזה נכון ומכוון.
--
-- `candidates <> '[]'::jsonb` ולא `jsonb_array_length(...) > 0`: תנאי של
-- אינדקס חלקי נבדק בכל insert, ופונקציה שזורקת על קלט לא-מערך הייתה הופכת
-- שורה חריגה לכשל כתיבה. השוואה לערך קבועה לא זורקת לעולם.
create unique index if not exists design_versions_one_run_per_generation
  on design_versions (generation_id)
  where generation_id is not null
    and candidates is not null
    and candidates <> '[]'::jsonb;
