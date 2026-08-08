# תפעול Supabase דרך ה-Management API

מדריך הרצה לסשן שמחזיק **טוקן אישי של Supabase במשתנה סביבה**. הוא נכתב כי
פרויקט `Forme` יושב בחשבון Supabase השני של גל (התוכנית החינמית מוגבלת לשלושה
פרויקטים), וה-MCP המחובר לסשנים רואה רק את החשבון הראשון — כלומר את הפרויקט
הזה **אי אפשר להגיע בכלים הרגילים**.

## חוזה הסביבה

| | |
|---|---|
| משתנה | `APERTA_SUPABASE_KEY` — טוקן אישי (`sbp_…`) של החשבון שמחזיק את Aperta |
| מפתח Resend | `APERTA_RESEND_KEY` — לקריאת לוגי המסירה של `aperta-designs.com` |
| מזהה הפרויקט | `yyonyypptptqznjepytg` |
| בסיס | `https://api.supabase.com/v1/projects/yyonyypptptqznjepytg` |

> **שם המשתנה נמדד ולא הונח — וגם המדידה מתיישנת.** המסמך נכתב מול
> `SUPABASE_PAT`, תוקן ל-`FORME_SUPABASE_KEY`, ו-**ב-8.8 נמדד כ-
> `APERTA_SUPABASE_KEY`**: המיתוג הדביק גם את שם המשתנה. לצדו יושב
> `AUTORIGHTEK_SUPABASE_KEY` של פרויקט אחר — שני חשבונות בסביבה אחת, ולכן השם
> נושא את שם הפרויקט. **לפני כל הרצה, לא פעם אחת:**
> `env | grep -o '^[A-Z_]*\(SUPABASE\|RESEND\)[A-Z_]*'` — לא להדפיס את הערך.
> שם משתנה הוא בדיוק סוג הפרט שמשתנה בשקט ומחזיר `401` שנראה כמו טוקן פגום.

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
  -H "Authorization: Bearer $APERTA_SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "mailer_otp_length": 6,
  "mailer_otp_exp": 600,

  "mailer_subjects_magic_link": "קוד הכניסה שלך ל-Aperta",
  "mailer_templates_magic_link_content": "<div dir=\"rtl\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:520px\">\n<p style=\"font-size:13px;letter-spacing:2px;color:#777;margin:0 0 18px\">Aperta</p>\n<p style=\"margin:0 0 6px\">הקוד שלך לכניסה:</p>\n<p style=\"font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 18px\">{{ .Token }}</p>\n<p style=\"margin:0 0 18px\">או פשוט <a href=\"{{ .ConfirmationURL }}\" style=\"color:#3f6297\">לחצו כאן להיכנס</a>.</p>\n<p style=\"color:#777;font-size:13px;margin:0\">הקוד תקף לעשר דקות. אם לא ביקשתם אותו — אפשר להתעלם מהמייל הזה.</p>\n</div>",

  "mailer_subjects_confirmation": "קוד הכניסה שלך ל-Aperta",
  "mailer_templates_confirmation_content": "<div dir=\"rtl\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:520px\">\n<p style=\"font-size:13px;letter-spacing:2px;color:#777;margin:0 0 18px\">Aperta</p>\n<p style=\"margin:0 0 6px\">ברוכים הבאים. הקוד שלך לכניסה:</p>\n<p style=\"font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 18px\">{{ .Token }}</p>\n<p style=\"margin:0 0 18px\">או פשוט <a href=\"{{ .ConfirmationURL }}\" style=\"color:#3f6297\">לחצו כאן להיכנס</a>.</p>\n<p style=\"color:#777;font-size:13px;margin:0\">הקוד תקף לעשר דקות. אם לא ביקשתם אותו — אפשר להתעלם מהמייל הזה.</p>\n</div>",

  "mailer_subjects_email_change": "אישור שינוי כתובת המייל — Aperta",
  "mailer_templates_email_change_content": "<div dir=\"rtl\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:520px\">\n<p style=\"font-size:13px;letter-spacing:2px;color:#777;margin:0 0 18px\">Aperta</p>\n<p style=\"margin:0 0 6px\">התבקש שינוי של כתובת המייל בחשבון. הקוד לאישור:</p>\n<p style=\"font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 18px\">{{ .Token }}</p>\n<p style=\"color:#777;font-size:13px;margin:0\">אם לא ביקשתם את השינוי — אל תאשרו, ותענו למייל הזה.</p>\n</div>"
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
  -H "Authorization: Bearer $APERTA_SUPABASE_KEY" \
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

### הורץ שוב — 7.8, באישור גל: המיתוג

הפקודה שלמעלה **מיתוג מחדש אינו שינוי בריפו.** ב-#168 הוחלף בגוף ה-`PATCH`
שבמסמך הזה `RM JEWEL` ל-`Aperta` (וצבע הקישור `#315bff` ל-`#3f6297`), אבל
הפקודה עצמה לא רצה. התוצאה החזיקה שלושה חודשים: המסמך תיאר תבניות שאומרות
Aperta, והייצור שלח תבניות שאומרות RM JEWEL — כלומר כל מי שנרשם ראה בנושא
המייל שם של מותג שאינו קיים, בדיוק ברגע שהוא הכי חשדן.

**זה הפער המסוכן בתיעוד תפעולי:** לא מסמך שחסר, אלא מסמך שמתאר מצב רצוי בלשון
של מצב קיים. מי שקרא אותו היה בטוח שזה מאחוריו.

הפעם הורצו שש השדות של המיתוג בלבד (`mailer_subjects_*` ו-
`mailer_templates_*_content`); `mailer_otp_length` ו-`mailer_otp_exp` לא נכתבו
שוב, כי הם כבר נכונים. האימות מראה `Aperta` בשלושת הנושאים והגופים, `{{ .Token }}`
בשלושתם, ואפס שאריות של `RM JEWEL` או `#315bff`. אחריו נשלח מייל אמיתי —
`POST /otp` החזיר `200`.

> **הכלל שנובע מכאן:** גוף ה-`PATCH` שבמסמך הזה הוא **הצהרת כוונה, לא תיאור
> הייצור**. עריכה שלו אינה שינוי, וכל שינוי מיתוג שנוגע בו חייב להיגמר בהרצה
> ובאימות — אחרת המסמך מתחיל לשקר דווקא במקום שבו סומכים עליו.

**מה שנשאר פתוח בקונפיגורציה:** `uri_allow_list` הוא
`https://rmjewel.com/**,https://localhost:3000/**`. ה-`https` על `localhost` כנראה
שגוי — פיתוח מקומי רץ ב-`http://localhost:3000` — ולכן הקישור מהמייל עלול להידחות
בפיתוח. לא נגעתי: זה מחוץ להיקף שאושר, ולא בדקתי אם משהו נשען עליו.

> **נסגר — נמדד 8.8.** `uri_allow_list` בייצור הוא היום
> `https://aperta-designs.com/**,https://www.aperta-designs.com/**,http://localhost:3000/**`:
> הדומיין עודכן מ-`rmjewel.com`, נוסף `www`, ו-`localhost` הוא `http`. אין כאן
> יותר פתוח.

---

## משימה B — אימותים (קריאה בלבד)

השאלות שלא נענו לאורך פיתוח הכניסה המאומתת, כי לא הייתה גישה למסד:

```bash
q() {
  curl -sS -X POST \
    "https://api.supabase.com/v1/projects/yyonyypptptqznjepytg/database/query/read-only" \
    -H "Authorization: Bearer $APERTA_SUPABASE_KEY" \
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
START=$(python3 -c "import datetime;print((datetime.datetime.utcnow()-datetime.timedelta(hours=23,minutes=55)).strftime('%Y-%m-%dT%H:%M:%SZ'))")
END=$(python3 -c "import datetime;print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'))")
SQL=$(python3 -c "import urllib.parse;print(urllib.parse.quote('select timestamp, event_message from auth_logs order by timestamp desc limit 200'))")
curl -sS "https://api.supabase.com/v1/projects/yyonyypptptqznjepytg/analytics/endpoints/logs.all?sql=$SQL&iso_timestamp_start=$START&iso_timestamp_end=$END" \
  -H "Authorization: Bearer $APERTA_SUPABASE_KEY"
```

> **`iso_timestamp_start` הוא חובה ולא קישוט.** בלעדיו הנקודה מחזירה
> `{"result":[],"error":null}` — לא שגיאה, אלא חלון ריק שנראה בדיוק כמו "אין
> תקלות". הגרסה הקודמת של הפקודה כאן נכתבה בלי הפרמטרים, ולכן הטעתה: היא אמרה
> "שקט" בזמן שהשירות החזיר 500 על כל בקשה. גם `count(*) from auth_logs` מחזיר
> `0` באותו חלון — כלומר אין בדיקת שפיות שמסגירה את הטעות.

סדר החשודים כשקוד לא מגיע: **SMTP** (Authentication → Emails) לפני התבנית,
והתבנית לפני הקוד. ה-SMTP המובנה של Supabase מוגבל לכמה מיילים בשעה ואינו
מיועד לייצור — כאן הוא מוגדר מול Resend.

**אבל קודם כל — לפצל לפי מה ש-`POST /otp` החזיר.** שלושת החשודים שלמעלה מכסים
רק את הענף שבו Supabase עצמו נכשל. יש ענף שני, ובו כל הקונפיגורציה תקינה:

| `/otp` | מי אשם | לאן ללכת |
|---|---|---|
| **500** | Supabase/SMTP — המייל *לא יצא*. `error` נושא את תשובת ה-SMTP (למשל `535`) | הסעיפים שלמעלה: SMTP → תבנית → קוד |
| **200** | Supabase מסר את המייל ל-Resend בהצלחה. הכשל הוא **במורד הזרם** | Resend (bounce/suppression) ואז הדומיין המקבל |

הבדיקה המשלימה ל-200 היא `auth.users`: `confirmation_sent_at` מלא ו-
`email_confirmed_at` ריק פירושו "נשלח ולא הושלם" — בדיוק התמונה של מייל שלא הגיע.

```sql
select email, created_at, confirmation_sent_at, email_confirmed_at
from auth.users where lower(email) = lower('<הכתובת>');
```

ואם רוצים לדעת אם זו תקלה כללית או ספק־מייל מסוים — לחתוך לפי דומיין המקבל.
עמודה `confirmed` שנופלת בדומיין אחד בלבד היא בעיית **הגעה**, לא בעיית מערכת:

```sql
select split_part(lower(email),'@',2) as domain, count(*) as users,
       count(*) filter (where email_confirmed_at is not null) as confirmed
from auth.users group by 1 order by users desc;
```

**את הצד של Resend בודקים ישירות, עם `APERTA_RESEND_KEY`** — זה המדד שמכריע
בין "walla חסמה" לבין "walla קיבלה והמשתמש לא מצא":

```bash
curl -sS "https://api.resend.com/emails?limit=20" \
  -H "Authorization: Bearer $APERTA_RESEND_KEY" \
  | python3 -c "
import json,sys
for e in json.load(sys.stdin)['data']:
    print(e['created_at'], '|', e['last_event'], '|', e['to'], '|', e['subject'])
"
```

`last_event` הוא התשובה: `delivered` = השרת המקבל **אישר קבלה**, ואז הבעיה היא
בתוך תיבת הדואר (ספאם/סינון) ולא אצלנו. `bounced` = נדחה, ואז הכתובת כנראה גם
נכנסה ל-suppression list ותצטרך הסרה. `sent` בלי `delivered` = נמסר לשרת ועדיין
לא אושר — **לא** הוכחה שהגיע. לפרטי הודעה בודדת (כולל הגוף שנשלח בפועל):
`curl -sS https://api.resend.com/emails/<id> -H "Authorization: Bearer $APERTA_RESEND_KEY"`.

> **ההיסטוריה של השורה הזאת היא האזהרה.** עד 8.8 עמד כאן שחשבון ה-Resend של
> `aperta-designs.com` אינו נגיש מסשן של הסוכן, ושיש לבדוק בדשבורד. זה היה נכון
> באותו רגע — ה-MCP המחובר מחזיק `willit.news` בלבד, ו-`get-suppression` שם
> מחזיר `404` שנקרא כמו "הכתובת לא חסומה" ופירושו "החשבון הלא נכון". מה שהשתנה
> הוא שהסביבה קיבלה `APERTA_RESEND_KEY`. **המסקנה הכללית:** "אין גישה" הוא מצב
> של הסביבה ברגע מסוים, לא תכונה קבועה — לבדוק `env` לפני שמוותרים על מדידה.

---

## תקלה — 7.8: `535 Authentication credentials invalid`

**מה נראה מבחוץ:** לחיצה על "שליחת קוד" ב-`/design` החזירה "הזיהוי נכשל. נסו
שוב", בלי שאף מייל יצא.

**מה הלוג אמר** — שלוש בקשות רצופות, אותה כתובת, אותה שגיאה:

```
POST /otp  status 500  error_code unexpected_failure
error: 535 "Authentication credentials invalid"
auth_event.action: user_confirmation_requested   traits.provider: email
```

`535` הוא תשובת SMTP, לא תשובת Supabase: השרת של Resend דחה את שם המשתמש והסיסמה
ש-`smtp_user` / `smtp_pass` נושאים בקונפיגורציית ה-Auth. כלומר **המפתח שמוגדר שם
אינו תקף יותר** — נמחק, סובב, או שייך לחשבון Resend אחר. שאר הקונפיגורציה תקינה:
`external_email_enabled = true`, `disable_signup = false`, `mailer_otp_length = 6`,
התבניות עם `{{ .Token }}`, ו-`uri_allow_list` כולל את `aperta-designs.com`.

**מה זה לא היה** — כדי לא לחפש שם בפעם הבאה: לא הרשמה סגורה, לא תבנית, לא מגבלת
קצב (`rate_limit_email_sent = 30`), ולא הקוד באתר. כניסת גוגל עבדה כל אותו הזמן,
וזה מה שהופך את התסמין למטעה: "הזיהוי" לא נכשל, רק המייל.

**נזק נלווה: אין.** Supabase מגלגל לאחור את יצירת המשתמש כשהשליחה נופלת —
ה-`actor_id` שבלוג אינו קיים ב-`auth.users`, ולא נוצרו כפילויות. כניסות המייל
האחרונות שהצליחו הן מ-31.7, כלומר המפתח היה תקף אז ופג בין לבין.

**התיקון (דורש את גל — מפתח Resend אינו בסביבה הזאת):**

1. ב-Resend של החשבון שמחזיק את `aperta-designs.com` — לוודא שהדומיין `verified`,
   וליצור מפתח API חדש.
2. להזין אותו כ-`smtp_pass` (`smtp_user` נשאר `resend`), בדשבורד תחת
   Authentication → Emails, או ב-`PATCH /config/auth`. **לכתוב את הערך רק שם —
   לא לקובץ בריפו ולא לפלט.**
3. לאמת בשליחה אמיתית מ-`/design`: פעם עם מייל שכבר קיים ופעם עם מייל חדש
   (ההבחנה של משימה A), ולוודא בלוג ש-`POST /otp` מחזיר `200`.

**נסגר 7.8:** גל יצר מפתח Resend חדש והזין אותו כ-`smtp_pass`. אומת בשליחה
אמיתית: `POST /otp` החזיר `200`, המייל הגיע לתיבה. שים לב שזה אימת את מסלול
**המשתמש הקיים** (`user_recovery_requested`, תבנית `magic_link`); מסלול הנרשם
החדש (`user_confirmation_requested`, תבנית `confirmation`) הוא ענף אחר ולא נבדק.

> **עודכן 8.8 — הענף הזה כן נבדק, ועבד.** הפסקה שמעל נשארת כלשונה כי היא הייתה
> נכונה כשנכתבה, אבל היא כבר לא מתארת את הייצור: בלוג של 7.8 יש
> `16:59:20 /otp 200 user_confirmation_requested` ואחריו
> `16:59:32 /verify 200 user_signedup` — נרשם חדש (`jmpstillsart@gmail.com`)
> שקיבל קוד והשלים כניסה תוך 12 שניות. מסלול `confirmation` **מוכח מקצה לקצה**.
> זה חוסך את החשד הראשון בתקלה הבאה: כשנרשם חדש לא מקבל קוד, התבנית שלו כבר
> אינה חשודה סבירה.

**מה נסגר בצד שלנו:** `AccountGate` הפריד בין המקרים במקום להציג משפט אחד לכולם —
תקלת שרת אומרת שהיא אצלנו ומפנה לגוגל, מגבלת קצב מבקשת להמתין, ואובדן רשת נאמר
בשמו. השגיאה האמיתית (`status`, `code`, `message`) נרשמת לקונסולה, כדי שהאבחון הבא
לא יתחיל בטוקן ניהול. הסיווג יושב ב-`src/lib/client/authFailure.ts` ומכוסה
ב-`src/lib/__tests__/authFailure.test.ts`.

---

## תקלה — 8.8: `/otp` החזיר `200` והמייל לא הגיע (walla.com)

**מה נראה מבחוץ:** משתמש הכניס מייל להרשמה ב-`/design` ולא קיבל קוד. **בלי שום
הודעת שגיאה** — הטופס עבר למסך "הקוד נשלח" כרגיל. זה ההבדל מהתקלה של 7.8, ששם
הממשק אמר "הזיהוי נכשל".

**מה הלוג אמר** — הפוך מ-7.8, וזה כל העניין:

```
08-08 14:23:44  POST /otp  status 200  auth_event.action: user_confirmation_requested
                actor_username: alon3244@walla.com   traits.provider: email
```

אין `/verify` אחריו. ב-`auth.users`: `confirmation_sent_at = 14:23:41`,
`email_confirmed_at = null` — Supabase **יצר את המשתמש ומסר את המייל ל-Resend
בהצלחה**, והמשתמש מעולם לא הקליד קוד. כלומר המייל יצא מ-Supabase ולא הגיע לתיבה.

**החתך שמצביע על האשם** — אחוז ההשלמה לפי דומיין המקבל:

| דומיין | משתמשים | אומתו |
|---|---|---|
| gmail.com | 7 | **7** |
| rightek.co.il | 1 | 1 |
| powdercoat.co.il | 1 | 1 |
| **walla.com** | **1** | **0** |

הכשל היחיד הוא הכתובת היחידה ב-walla. זו בעיית **הגעה אצל ספק מסוים**, לא תקלת
מערכת.

**מה זה לא היה** — נמדד, לא הונח: לא `535` (הקונפיגורציה נקייה —
`external_email_enabled=true`, `disable_signup=false`, `mailer_otp_length=6`,
`mailer_otp_exp=600`, `{{ .Token }}` ב-`magic_link` וב-`confirmation`); לא מגבלת
קצב (`rate_limit_email_sent=30`, בקשה בודדת); לא התבנית של הנרשם החדש (הוכחה
ב-7.8, ראו התיקון שם); ולא הקוד באתר — `AccountGate` מציג נכון את מסך הקוד, ובו
כבר יש רמז לתיקיית ספאם, שליחה חוזרת, וחזרה למסלול גוגל.

**מה לא נמדד, וצריך את גל:** מה Resend עשה עם המייל אחרי שקיבל אותו. חשבון
ה-Resend של `aperta-designs.com` אינו נגיש מסשן של הסוכן (ראו האזהרה בסעיף
האבחון). הצעד הבא הוא בדשבורד של Resend:

1. לחפש את המשלוח ל-`alon3244@walla.com` מ-8.8 14:23 — `delivered` / `bounced` /
   `complained`? bounce קשיח גם מוסיף את הכתובת ל-**suppression list**, ואז כל
   ניסיון חוזר יישלח לכאורה ולא יגיע לעולם. אם היא שם — להסיר.
2. לוודא ש-`aperta-designs.com` הוא `verified` ושרשומות ה-**SPF/DKIM** קיימות.
   ספקים ישראליים ותיקים (walla, נטוויז'ן) מחמירים יותר מ-gmail, ולכן הם הראשונים
   ליפול כשהאימות חלקי — gmail יכול להמשיך לעבוד ולהסתיר את זה.
3. לשקול **DMARC** על הדומיין אם אין.

**הצעות שדורשות אישור לפני הרצה** (כתיבה לקונפיגורציה — לא הורצו):

- להוסיף לתבניות גוף **טקסט רגיל** לצד ה-HTML. תבנית HTML-only שכל תוכנה מספר
  גדול וקישור היא דפוס שמסננים מחמירים מדרגים גבוה, וזה בדיוק פרופיל המייל הזה.
- `smtp_admin_email` הוא `info@aperta-designs.com`. אם התיבה הזו אינה קיימת
  בפועל, מייל שנשלח ממנה נכשל בבדיקות שמוודאות שכתובת השולח מקבלת דואר.

**הכלל שנובע מכאן:** `200` על `/otp` פירושו "Supabase מסר", לא "המשתמש קיבל".
בין השניים יש ספק מייל שיכול להשתיק את המייל בלי להחזיר שום שגיאה לשום מקום
שאנחנו רואים — ולכן `confirmation_sent_at` מלא מול `email_confirmed_at` ריק הוא
התסמין, והחתך לפי דומיין הוא האבחנה.

### נסגר — 8.8, נמדד מול Resend

הסביבה קיבלה `APERTA_RESEND_KEY` (לא היה בה קודם), וזה איפשר למדוד את הצד שנשאר
פתוח. **המייל נמסר.**

| שדה | ערך |
|---|---|
| `last_event` | **`delivered`** — השרת של walla אישר קבלה |
| `created_at` | `2026-08-08 14:23:43.859Z` |
| `from` | `"Aperta" <info@aperta-designs.com>` |
| נושא | `קוד הכניסה שלך ל-Aperta` |
| גוף | HTML **וגם** `text/plain`, קוד תקין בן שש ספרות, מיתוג Aperta |

כלומר הצד שלנו נקי מקצה לקצה: Supabase שלח, Resend מסר, walla קיבלה, והתוכן היה
נכון. מה שנשאר הוא **בתוך תיבת הדואר** — סינון לספאם, או שהמשתמש לא מצא. שתי
ההשערות שהסעיף שלמעלה הציע נשללו: לא bounce, ולא suppression.

**שתי הצעות שהסעיף הזה העלה — ובוטלו אחרי מדידה:**

- *"להוסיף גוף טקסט רגיל לצד ה-HTML"* — **כבר קיים.** Supabase שולח multipart,
  ושדה `text` בתשובת Resend מכיל את הגרסה המלאה. ההצעה נכתבה מתוך הנחה על מבנה
  המייל בלי לפתוח אותו; פתיחה אחת של ההודעה ב-API הייתה חוסכת אותה.
- *"לבדוק אם `info@aperta-designs.com` מקבלת דואר"* — נשארת רלוונטית לתשובות
  לקוח, אבל אינה קשורה לתקלה הזאת: המייל נמסר בלעדיה.

**מה שכן פתוח, ובסדר עדיפות:** אם walla מסננת שיטתית — `DMARC` על הדומיין (SPF
ו-DKIM כבר עובדים, אחרת walla לא הייתה מקבלת). ושיקול שני: `mailer_otp_exp` הוא
600 שניות. מי שמוצא את המייל בספאם רבע שעה אחרי שנשלח מקבל קוד **מת**, ומדווח
"הקוד לא עובד" — תסמין שנראה כמו באג ואינו. הארכה דורשת עדכון מקביל של הטקסט
בשלוש התבניות ("עשר דקות") ואישור של גל.

> **הלקח שחוזר בסעיף הזה בשלישית:** גם ההסבר שנשמע הכי סביר הוא השערה עד שמודדים
> אותו. "walla חסמה" ו-"חסר טקסט רגיל" היו שניהם קוהרנטיים, שניהם התאימו לראיות
> שהיו ביד, ושניהם היו לא נכונים. ההבדל בין השערה למסקנה הוא קריאת API אחת.

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
