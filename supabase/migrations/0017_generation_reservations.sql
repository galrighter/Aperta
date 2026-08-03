-- שריון מכסה אטומי.
--
-- המכסה נבדקה read-then-act: `countTodayRunsByOutcome` נקרא, ואז הצינור רץ. N
-- בקשות מקבילות רואות כולן `used < LIMIT` וכולן ממשיכות — כלומר התקרה שאמורה
-- לחסום הוצאה נחצית בדיוק ברגע שמישהו דוחף עליה. הבדיקה והרישום חייבים להיות
-- פעולה אחת, והמקום היחיד שבו זה אפשרי הוא המסד.

create table if not exists generation_reservations (
  -- מזהה ההרצה עצמו (`render/attemptId.ts`), ולכן הוא נגזר מה-jobId של
  -- הלקוחה. זה מה שהופך את השריון ל-idempotent: בקשה שמתחדשת אחרי ניתוק
  -- מגיעה עם אותו מזהה ולא צורכת יחידת מכסה שנייה על אותה הרצה.
  id uuid primary key,
  profile_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_generation_reservations_profile_time
  on generation_reservations (profile_id, created_at desc);

-- אין גישת קליינט — הכול דרך service role.
alter table generation_reservations enable row level security;

/**
 * שוריין מקום להרצה, או אמור למה לא.
 *
 * מחזיר 'ok' / 'approved_limit' / 'failed_limit'.
 *
 * הנעילה היא לפי פרופיל ולכל אורך הטרנזקציה: בלעדיה שתי בקשות של אותו פרופיל
 * קוראות את אותו מונה ושתיהן משוריינות, וזה בדיוק המקרה שהפונקציה קיימת בשבילו.
 * פרופילים שונים אינם ממתינים זה לזה.
 *
 * הרצה שעדיין באוויר נספרת מול מכסת ההצלחות. זו בחירה שמרנית ומכוונת: בזמן
 * שהיא רצה כבר שולם עליה, והמכסה היא שער על הוצאה — לא דיווח בדיעבד.
 */
create or replace function reserve_generation(
  p_id uuid,
  p_profile uuid,
  p_since timestamptz,
  p_approved_limit int,
  p_failed_limit int
) returns text
language plpgsql
as $$
declare
  v_approved int;
  v_failed int;
  v_pending int;
begin
  perform pg_advisory_xact_lock(hashtext(p_profile::text)::bigint);

  -- חידוש של הרצה ששוריינה כבר: אותה הרצה, אותה יחידה.
  if exists (select 1 from generation_reservations where id = p_id) then
    return 'ok';
  end if;

  select
    count(*) filter (where r.status = 'approved'),
    count(*) filter (where r.status <> 'approved')
  into v_approved, v_failed
  from generation_runs r
  join designs d on d.id = r.design_id
  where d.profile_id = p_profile
    and r.created_at >= p_since;

  -- שריונים שעדיין לא הפכו לשורת הרצה — ההרצות שבאוויר.
  select count(*)
  into v_pending
  from generation_reservations res
  where res.profile_id = p_profile
    and res.created_at >= p_since
    and not exists (select 1 from generation_runs r where r.id = res.id);

  if v_approved + v_pending >= p_approved_limit then
    return 'approved_limit';
  end if;
  if v_failed >= p_failed_limit then
    return 'failed_limit';
  end if;

  insert into generation_reservations (id, profile_id) values (p_id, p_profile);

  -- ניקוי הזדמנותי של הפרופיל הזה. הטבלה היא מונה של היום, לא ארכיון.
  delete from generation_reservations
   where profile_id = p_profile and created_at < now() - interval '2 days';

  return 'ok';
end;
$$;

-- PostgREST עונה מתוך schema cache; בלי הרענון הפונקציה קיימת אבל ה-API מחזיר
-- "Could not find function ... in the schema cache".
notify pgrst, 'reload schema';
