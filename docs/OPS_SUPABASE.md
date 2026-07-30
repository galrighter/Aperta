# תפעול Supabase דרך ה-Management API

מדריך הרצה לסשן שמחזיק **טוקן אישי של Supabase במשתנה סביבה**. הוא נכתב כי
פרויקט `Forme` יושב בחשבון Supabase השני של גל (התוכנית החינמית מוגבלת לשלושה
פרויקטים), וה-MCP המחובר לסשנים רואה רק את החשבון הראשון — כלומר את הפרויקט
הזה **אי אפשר להגיע בכלים הרגילים**.

## חוזה הסביבה

| | |
|---|---|
| משתנה | `FORME_SUPABASE_KEY` — טוקן אישי (`sbp_…`) של החשבון שמחזיק את Forme |
| מזהה הפרויקט | `yyonyypptptqznjepytg` |
| בסיס | `https://api.supabase.com/v1/projects/yyonyypptptqznjepytg` |

> **שם המשתנה נמדד ולא הונח.** המסמך נכתב מול `SUPABASE_PAT`; בסביבת ההרצה
> בפועל הוא `FORME_SUPABASE_KEY` (לצד `AUTORIGHTEK_SUPABASE_KEY` של פרויקט אחר —
> שני חשבונות בסביבה אחת, ולכן השם צריך לשאת את שם הפרויקט). לפני הרצה: לוודא
> `env | grep -o '^[A-Z_]*SUPABASE[A-Z_]*'` — לא להדפיס את הערך.

הטוקן נוצר ב-https://supabase.com/dashboard/account/tokens. הוא **אינו צר**:
הוא נותן שליטה על כל הפרויקטים בחשבון. לכן —

> **זה לא מפתח ה-service.** `SUPABASE_SECRET_KEY` (service role) נותן גישה
> לנתונים ועוקף RLS — ובזה נגמר. תבניות המייל, ספקי הכניסה וכתובות ההפניה אינם
> במסד אלא בקונפיגורציה של שירות ה-Auth, ואליה מגיעים **רק** עם טוקן אישי דרך
> ה-Management API. שני מפתחות, שתי מערכות; החלפה ביניהם מחזירה 401 שנראה כמו
> טוקן פגום.

> **גבולות.** אין לכתוב את הטוקן לשום קובץ בריפו ואין להדפיס אותו לפלט. לשאילתות
> אימות יש להשתמש בנקודת הקצה `database/query/read-only`, שרצה כ-
> `supabase_read_only_user` — כתיבה שם **נכשלת**, ולכן זו הגנה ולא הבטחה. כל
> פעולה שכותבת (`database/query`, `config/auth`, מיגרציות) דורשת אישור מפורש של
> גל לפני ההרצה, גם אם היא נראית שגרתית.

---

## משימה A — תבניות מייל הכניסה (חוסם)

**הבעיה:** ברירת המחדל של תבניות Supabase מכילה `{{ .ConfirmationURL }}` בלבד,
ולכן נשלח **קישור ולא קוד** — בזמן שהממשק (`AccountGate`) מבקש קוד בן שש ספרות.
נמדד מול הייצור ב-29.7: הקוד לא הגיע, הקישור כן.

הצד שלנו כבר תוקן ב-PR #84 (`emailRedirectTo` מכוון ל-`/auth/callback`; קודם
הקישור נחת בדף הבית ולא קרה כלום). מה שנשאר הוא הקונפיגורציה.

### למה שתי תבניות ולא אחת

`signInWithOtp` עם `shouldCreateUser: true` משרת שני מקרים: מי שכבר קיים
ב-`auth.users`, ומי שנרשם עכשיו בפעם הראשונה. **לא הצלחתי לאשר מהתיעוד הרשמי
איזו תבנית נשלחת לכל אחד מהם** — הזיכרון שלי הוא שמשתמש חדש מקבל את
`Confirm signup` ולא את `Magic Link`, והתיעוד מדבר רק על "לערוך את תבנית ה-
Magic Link" בלי להבחין בין השניים.

אם הזיכרון נכון, תיקון של Magic Link בלבד היה משאיר בלי קוד בדיוק את מי שהמוצר
צריך — **חבר שנרשם בפעם הראשונה**. לכן שתיהן מקבלות `{{ .Token }}`. זו ביטוח ולא
קביעה: אם התבנית השנייה לעולם לא נשלחת, היא פשוט יושבת שם ולא מזיקה.

### הפעולה

```bash
curl -sS -X PATCH \
  "https://api.supabase.com/v1/projects/yyonyypptptqznjepytg/config/auth" \
  -H "Authorization: Bearer $FORME_SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "mailer_otp_length": 6,
  "mailer_otp_exp": 600,

  "mailer_subjects_magic_link": "קוד הכניסה שלך ל-RM JEWEL",
  "mailer_templates_magic_link_content": "<div dir=\"rtl\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:520px\">\n<p style=\"font-size:13px;letter-spacing:2px;color:#777;margin:0 0 18px\">RM JEWEL</p>\n<p style=\"margin:0 0 6px\">הקוד שלך לכניסה:</p>\n<p style=\"font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 18px\">{{ .Token }}</p>\n<p style=\"margin:0 0 18px\">או פשוט <a href=\"{{ .ConfirmationURL }}\" style=\"color:#315bff\">לחצו כאן להיכנס</a>.</p>\n<p style=\"color:#777;font-size:13px;margin:0\">הקוד תקף לעשר דקות. אם לא ביקשתם אותו — אפשר להתעלם מהמייל הזה.</p>\n</div>",

  "mailer_subjects_confirmation": "קוד הכניסה שלך ל-RM JEWEL",
  "mailer_templates_confirmation_content": "<div dir=\"rtl\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:520px\">\n<p style=\"font-size:13px;letter-spacing:2px;color:#777;margin:0 0 18px\">RM JEWEL</p>\n<p style=\"margin:0 0 6px\">ברוכים הבאים. הקוד שלך לכניסה:</p>\n<p style=\"font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 18px\">{{ .Token }}</p>\n<p style=\"margin:0 0 18px\">או פשוט <a href=\"{{ .ConfirmationURL }}\" style=\"color:#315bff\">לחצו כאן להיכנס</a>.</p>\n<p style=\"color:#777;font-size:13px;margin:0\">הקוד תקף לעשר דקות. אם לא ביקשתם אותו — אפשר להתעלם מהמייל הזה.</p>\n</div>",

  "mailer_subjects_email_change": "אישור שינוי כתובת המייל — RM JEWEL",
  "mailer_templates_email_change_content": "<div dir=\"rtl\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:520px\">\n<p style=\"font-size:13px;letter-spacing:2px;color:#777;margin:0 0 18px\">RM JEWEL</p>\n<p style=\"margin:0 0 6px\">התבקש שינוי של כתובת המייל בחשבון. הקוד לאישור:</p>\n<p style=\"font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 18px\">{{ .Token }}</p>\n<p style=\"color:#777;font-size:13px;margin:0\">אם לא ביקשתם את השינוי — אל תאשרו, ותענו למייל הזה.</p>\n</div>"
}
JSON
```

**למה כל שדה:**

- `{{ .Token }}` **וגם** `{{ .ConfirmationURL }}` בכל תבנית — הקוד עובד גם ממכשיר
  אחר (המייל בטלפון, העיצוב במחשב); הקישור עובד רק בדפדפן שביקש אותו, כי מפתח
  ה-PKCE נשמר שם. לכן הקישור הוא נוחות, לא המסלול העיקרי.
- `mailer_otp_length: 6` — הממשק מאמת בדיוק שש ספרות (`/^\d{6}$/` ב-
  `AccountGate.tsx`). אם מישהו ישנה את האורך, הכפתור פשוט לא יידלק ואיש לא יבין
  למה. מקבעים במפורש.
- `mailer_otp_exp: 600` — עשר דקות במקום ברירת המחדל. **חייב להסכים עם הטקסט
  שבגוף התבניות**; משנים את אחד — משנים את השני. שלושתן אומרות "עשר דקות".
- `email_change` נכלל לשלמות. המוצר לא מציע היום שינוי מייל, ולכן זו תבנית
  שכנראה לא תישלח — אבל אם תישלח, עדיף שלא תהיה באנגלית של ברירת המחדל.

**מה בכוונה לא נגענו בו:** `recovery` (איפוס סיסמה) ו-`reauthentication`. אין
סיסמאות במוצר הזה, ותבנית שמדברת על סיסמה תבלבל יותר משתועיל.

**אימות:**

```bash
curl -sS "https://api.supabase.com/v1/projects/yyonyypptptqznjepytg/config/auth" \
  -H "Authorization: Bearer $FORME_SUPABASE_KEY" \
  | python3 -c "
import json,sys
c = json.load(sys.stdin)
print('otp_length', c['mailer_otp_length'], '| otp_exp', c['mailer_otp_exp'])
for k in ('magic_link', 'confirmation', 'email_change'):
    print(k, 'has Token:', '{{ .Token }}' in (c.get('mailer_templates_%s_content' % k) or ''))
"
```

**הבדיקה האמיתית היא בכל זאת אנושית:** לבקש קוד מ-`/design` ולראות שהוא מגיע —
**פעם אחת עם מייל שכבר קיים במערכת, ופעם עם מייל חדש לגמרי.** זה בדיוק ההבדל
שהסעיף הזה מכסה, והדרך היחידה לדעת אם הזיכרון שלי היה נכון. תבנית תקינה גם לא
מוכיחה ש-ה-SMTP שולח.

### בוצע — 29.7, באישור גל

ה-`PATCH` רץ והוחזר `200`; האימות שלמעלה מראה `otp_length 6 | otp_exp 600`
ו-`Token: True` בשלוש התבניות. `recovery` נשאר באנגלית של ברירת המחדל, כמתוכנן.

**מה שנמדד לפני ההרצה גדול ממה שהמסמך הניח — היו שני באגים, לא אחד:**

| שדה | לפני | אחרי |
|---|---|---|
| `mailer_otp_length` | **8** | 6 |
| `mailer_otp_exp` | 3600 | 600 |
| `magic_link` · `confirmation` · `email_change` | `ConfirmationURL` בלבד, נושא באנגלית | `Token` + קישור, נושא בעברית |
| `site_url` | `http://rmjewel.com` | `https://rmjewel.com` |

`mailer_otp_length` היה **8**. כלומר גם אילו התבנית הייתה שולחת קוד, הוא היה בן
שמונה ספרות בעוד `AccountGate` מאמת `/^\d{6}$/` — הכפתור לא היה נדלק, והמשתמש
היה רואה קוד תקין שהטופס מסרב לקבל. **תמיד למדוד את הקונפיגורציה הקיימת לפני
שכותבים עליה**: ההנחה הייתה "התבניות בברירת מחדל", והמציאות כללה גם שדה שמישהו
כבר שינה. `mailer_otp_length: 6` נכנס למסמך כהקשחה נגד עתיד, והתברר כתיקון בהווה.

`site_url` תוקן ל-`https` באותה הרצה (הרחבה שגל אישר במפורש). הוא היעד שאליו
Supabase מפנה כשאין `emailRedirectTo`, ולכן `http` שם הוא ניתוב ראשוני של כניסה
דרך תעבורה לא מוצפנת.

**מה שנשאר פתוח בקונפיגורציה:** `uri_allow_list` הוא
`https://rmjewel.com/**,https://localhost:3000/**`. ה-`https` על `localhost` כנראה
שגוי — פיתוח מקומי רץ ב-`http://localhost:3000` — ולכן הקישור מהמייל עלול להידחות
בפיתוח. לא נגעתי: זה מחוץ להיקף שאושר, ולא בדקתי אם משהו נשען עליו.

---

## משימה B — אימותים (קריאה בלבד)

השאלות שלא נענו לאורך פיתוח הכניסה המאומתת, כי לא הייתה גישה למסד:

```bash
q() {
  curl -sS -X POST \
    "https://api.supabase.com/v1/projects/yyonyypptptqznjepytg/database/query/read-only" \
    -H "Authorization: Bearer $FORME_SUPABASE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1")}"
}
```

1. **האם `0010_auth.sql` באמת רץ** — הוסק עד היום מלוג workflow בלבד:
   ```sql
   select column_name from information_schema.columns
   where table_name = 'profiles' and column_name = 'auth_user_id';
   ```

2. **האם החבר הראשון שנכנס קיבל את הפרופיל הקיים או פרופיל שני.**
   זה הצעד היחיד בכניסה שאי אפשר לתקן בדיעבד (`linkAuthUser`, שלב 2): פרופיל
   שני משאיר את העיצובים תלויים בראשון בלי דרך להגיע אליהם.
   ```sql
   select lower(email) as email, count(*) as profiles,
          count(auth_user_id) as linked
   from profiles where email is not null
   group by 1 having count(*) > 1;
   ```
   **תוצאה ריקה = תקין.** כל שורה כאן היא מייל שקיבל שני פרופילים.

3. **מי כבר נכנס באמת:**
   ```sql
   select p.name, p.email, p.auth_user_id is not null as verified,
          p.created_at, count(d.id) as designs
   from profiles p left join designs d on d.profile_id = p.id
   where p.kind = 'friend'
   group by p.id order by p.created_at desc limit 50;
   ```

4. **עיצובים ללא בעלים מאומת** — כמה מהם היסטוריה (בודקים) וכמה חדשים:
   ```sql
   select p.kind, count(*) from designs d
   join profiles p on p.id = d.profile_id group by 1;
   ```

5. **משתמשי אימות מול פרופילים** — פער מעיד על כניסה שלא הושלמה:
   ```sql
   select (select count(*) from auth.users) as auth_users,
          (select count(*) from profiles where auth_user_id is not null) as linked_profiles;
   ```

### התשובות — 29.7

| # | תשובה |
|---|---|
| 1 | `profiles.auth_user_id` קיים (`uuid`). `0010_auth.sql` **רץ בייצור** — עד כה הוסק מלוג בלבד |
| 2 | **תוצאה ריקה — תקין.** אף מייל לא קיבל שני פרופילים |
| 3 | שני חברים, שניהם `verified = true`, עיצוב אחד לכל אחד: `mmegides@gmail.com`, `gal@powdercoat.co.il` — שניהם נוצרו ב-29.7 |
| 4 | `friend`: 2 · `tester`: 47. רוב העיצובים במסד הם היסטוריית הסטודיו הפנימי |
| 5 | `auth_users = 2`, `linked_profiles = 2`. **אין פער** — אין כניסה שהתחילה ולא הושלמה |

**הצעד שאי אפשר לתקן בדיעבד נקי** (שאלה 2). שלב 2 של `linkAuthUser` — התאמה לפי
המייל — עבד: אף חבר לא קיבל פרופיל שני, ואין עיצובים תלויים בפרופיל שאי אפשר
להגיע אליו. זה מסיר את הסיכון היחיד בכניסה שהיה בלתי הפיך.

**הסתייגות על מה שהנתונים האלה כן מוכיחים:** שתי הכניסות הקיימות הן **דרך גוגל**
— מסלול הקוד במייל לא עבד עד ה-`PATCH` של משימה A, ולכן שאלה 2 עדיין לא נבדקה
מול הנתיב שהיא באמת מגנה עליו. שתי הכניסות הידניות שגל יריץ (מייל קיים + מייל
חדש) הן גם הבדיקה החוזרת של שאלה 2 — כדאי להריץ אותה שוב אחריהן.

---

## אבחון כשמייל לא מגיע

לוגים של שירות האימות, 24 שעות אחרונות:

```bash
curl -sS "https://api.supabase.com/v1/projects/yyonyypptptqznjepytg/analytics/endpoints/logs.all?sql=$(python3 -c "import urllib.parse;print(urllib.parse.quote(\"select timestamp, event_message from auth_logs order by timestamp desc limit 50\"))")" \
  -H "Authorization: Bearer $FORME_SUPABASE_KEY"
```

סדר החשודים כשקוד לא מגיע: **SMTP** (Authentication → Emails) לפני התבנית,
והתבנית לפני הקוד. ה-SMTP המובנה של Supabase מוגבל לכמה מיילים בשעה ואינו
מיועד לייצור — כאן הוא מוגדר מול Resend, ו-`rmjewel.com` מאומת שם.

---

## חלופה: לחבר את ה-MCP במקום טוקן

`.mcp.json` כבר בריפו ומכוון לפרויקט הנכון, אבל בסשן מרוחק הוא **לא נטען**:
השרת של `mcp.supabase.com` מאמת ב-OAuth, וקונטיינר בענן לא עובר מסך הסכמה
בדפדפן. האישור נעשה מהצד של גל — ב-**claude.ai → Settings → Connectors**, או
בהרצת `claude` מקומית פעם אחת בתיקיית הפרויקט.

אם מחברים, שווה להוסיף `read_only=true` ולצמצם את ה-features:

```
https://mcp.supabase.com/mcp?project_ref=yyonyypptptqznjepytg&read_only=true&features=docs%2Cdatabase%2Cdebugging
```

זה נותן קריאה ולוגים ומוציא מהתמונה `execute_sql` על הייצור, `apply_migration`,
יצירת ענפים ופריסת פונקציות. פתיחה לכתיבה היא שינוי של פרמטר אחד, ואז ידוע מתי
בדיוק היא נפתחה.

**מה שה-MCP לא יפתור:** תבנית המייל. היא אינה במסד אלא בקונפיגורציה של שירות
ה-Auth, ואליה מגיעים רק דרך הדשבורד או ה-Management API.

---

## רקע — איפה הפרויקט עומד

`docs/TODO.md` הוא המקור. בקצרה: מסלול ההזמנה סגור מקצה לקצה (התראה, אסמכתה
ללקוחה, גיבוי `mailto:` כשה-API נופל), `/debug` סגור מאחורי שער אדמין, כל מסלול
שמקבל מזהה עיצוב בודק בעלות, והכניסה מאומתת דרך Supabase Auth. הפתוח הבא הוא
**B1** — לצרף את השרטוט להזמנה; היום נשלח `מזהה עיצוב: <uuid>` בלבד, ואי אפשר
לייצר ממנו בלי לחפש ידנית במסד.
