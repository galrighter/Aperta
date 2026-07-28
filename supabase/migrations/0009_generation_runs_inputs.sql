-- מה בעצם נשלח למודל, ומה המשתמש נתן.
--
-- עד כאן היומן שמר את `prompt` — הטקסט של המשתמש — ולא את הפרומפט הבנוי שיצא
-- למודל התמונה. זה בדיוק ההבדל שאי אפשר לאבחן בלעדיו: כשהדמיה חוזרת עבה מדי
-- או עם מסגרת, השאלה הראשונה היא מה נאמר למודל, וזה נבנה בקוד מהמידות ומהתכנון
-- ולא נכתב לשום מקום. `render_prompt` שומר את המחרוזת המדויקת שנשלחה.
--
-- `inputs` שומר את המאפיינים שקבעו אותה (מוצר, מידות, עובי, שורות, פתח מינימלי,
-- מפתח צבע) — שחזור של הרצה בלעדיהם הוא ניחוש. `input_image_path` הוא קובץ
-- ההשראה שהמשתמש צירף: עד עכשיו הוא נכנס לקריאה למודל ונעלם.

alter table generation_runs add column if not exists render_prompt text;
alter table generation_runs add column if not exists inputs jsonb;
alter table generation_runs add column if not exists input_image_path text;

notify pgrst, 'reload schema';
