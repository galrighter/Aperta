-- מספר דוגמה לעיצוב: `AP-0085.2` — הדוגמה השנייה שנוצרה משכפול של עיצוב 0085.
--
-- `serial` (0008) הוא מונה רץ אחד לכל השורות ב-`designs`, ולכן שכפול עיצוב
-- (`/api/designs/[id]/duplicate`) הפיק היום מספר עיצוב חדש ובלתי-תלוי — שני
-- ניסויים על אותו רעיון קיבלו שני רפרנסים שאין ביניהם שום קשר נראה, וגל צריך
-- לזכור בעל-פה איזה AP-00xx שייך לאיזה. השדות כאן קושרים כל שכפול לעיצוב
-- שממנו הוא נולד, בלי לגעת ב-`serial` עצמו — הוא נשאר ייחודי ורץ כמו קודם,
-- וכל מקום שלא יודע על שדות הדוגמה ממשיך לעבוד בדיוק כמו לפני המיגרציה.
--
-- `root_design_id` תמיד מצביע על **אב-הקדמון**, לא על ההורה המיידי: שכפול של
-- דוגמה (AP-0085.2) מייצר אח (AP-0085.3) ולא נכד (AP-0085.2.1) — מיספור שטוח
-- בן ספרה אחת אחרי הנקודה, כמו שביקש גל.

alter table designs add column if not exists root_design_id uuid references designs(id) on delete set null;
alter table designs add column if not exists root_serial bigint;
alter table designs add column if not exists sample_no integer;

do $$
begin
  alter table designs add constraint designs_sample_fields_check
    check ((root_design_id is null) = (sample_no is null));
exception
  when duplicate_object then null;
end $$;

-- מונע מירוץ בין שני שכפולים מקבילים מאותו עיצוב-אב לקבל אותו מספר דוגמה.
create unique index if not exists idx_designs_root_sample
  on designs (root_design_id, sample_no)
  where root_design_id is not null;

create index if not exists idx_designs_root_design_id on designs (root_design_id);

notify pgrst, 'reload schema';
