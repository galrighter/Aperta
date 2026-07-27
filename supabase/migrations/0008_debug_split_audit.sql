-- אבחון בלבד — לא משנה כלום.
--
-- אחרי 0007 הפירוט של הרצה ישנה חזר בלי ה-SVG של המועמדים, ואין לי ערוץ קריאה
-- ל-DB חוץ מפלט psql כאן. במקום לתקן לפי תיאוריה — שכבר טעיתי בה פעמיים היום —
-- קודם מודדים: כמה שורות קיבלו debug_full, כמה נשארו ריקות, וכמה SVG של מועמדים
-- באמת יושבים בכל צד.
--
-- למחיקה אחרי הקריאה.

select
  count(*)                                                          as rows_total,
  count(*) filter (where debug is not null)                         as with_debug,
  count(*) filter (where debug_full is not null)                    as with_debug_full,
  count(*) filter (
    where jsonb_typeof(debug_full -> 'candidates') = 'array'
      and exists (
        select 1 from jsonb_array_elements(debug_full -> 'candidates') c
        where c ? 'cutouts_svg'
      )
  )                                                                 as full_has_candidate_svgs,
  count(*) filter (
    where jsonb_typeof(debug -> 'candidates') = 'array'
      and exists (
        select 1 from jsonb_array_elements(debug -> 'candidates') c
        where c ? 'cutouts_svg'
      )
  )                                                                 as slim_still_has_svgs
from generation_runs;
