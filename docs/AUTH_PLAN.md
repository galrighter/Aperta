# כניסה מסודרת — מייל או חשבון גוגל

המסמך הזה הוא התוכנית להשלמת הזיהוי מ"בטא לחברים" ל**כניסה אמיתית**: קוד למייל
או חשבון גוגל. הוא מיועד להיקרא בתחילת הסשן שיבצע אותו.

## איפה זה עומד עכשיו

מה שכבר קיים בקוד (PR #68):

| רכיב | מצב |
|---|---|
| טבלת חשבונות (`profiles` עם `kind`/`email`/`phone`) | ✅ קוד מוכן, ממתין למיגרציה |
| מספר סידורי לעיצוב (`designs.serial`) | ✅ קוד מוכן, ממתין למיגרציה |
| שער זיהוי במשפך היצירה | ✅ עובד |
| בעלות על עיצוב לפי עוגייה חתומה | ✅ עובד |
| לשונית "עיצובים" בבק־אופיס | ✅ קוד מוכן, חסום על `ADMIN_TOKEN` |
| **אימות זהות** | ❌ **אין.** מי שמזין מייל קיים נכנס לחשבון הקיים |

הפער היחיד הוא האחרון, והוא מה שהמסמך הזה סוגר.

## למה Supabase Auth ולא מימוש עצמי

הפרויקט כבר על Supabase. `Supabase Auth` נותן בקופסה גם קוד־חד־פעמי במייל וגם
ספק Google, מנהל את `auth.users`, ומטפל ברענון סשן — במקום לכתוב לבד טבלת קודים,
השוואת קודים בזמן קבוע, חלון תפוגה, הגבלת קצב, ואת זרימת ה-OAuth של גוגל
(authorization code + state + החלפת טוקן). כל אחד מאלה הוא מקום להיכשל בו בשקט.

המחיר: תלות חדשה (`@supabase/ssr`) ומפתח פומבי בבילד. שניהם סטנדרטיים.

**החלטה נגדית אפשרית:** אם בכל זאת בונים לבד — קודים במייל דרך Resend + OAuth של
גוגל ידנית. זה בערך פי שלושה קוד, וכל השאר במסמך נשאר נכון.

## מה נשאר בלי שינוי

הרעיון שהחשבונות יושבים ב-`profiles` נשאר. `auth.users` מנהל את **האימות**;
`profiles` ממשיך להיות מי שהעיצוב שייך לו. הקישור הוא עמודה אחת.

חשוב במיוחד: **`requireAccountId(req)` נשארת החתימה היחידה שהמסלולים מכירים.**
כל מה שמשתנה הוא מאיפה היא שולפת את הזהות — מהסשן של Supabase במקום מהעוגייה
החתומה. `/api/designs`, `/api/generate` והשאר לא צריכים לדעת שמשהו השתנה.

---

## חלק א' — מה גל צריך לעשות (לא ניתן לאוטומציה)

הסשן שמבצע את התוכנית **חייב להדריך את גל בכל שלב כאן ולחכות לאישור**, ולא
להסתפק ברשימה. בלי אלה שום קוד לא יעבוד.

### 1. להריץ את המיגרציות שלא רצו

`0002`, `0003`, `0004` (ובהמשך `0005`). שתי דרכים:

- **המומלצת:** להוסיף secret בשם `SUPABASE_DB_URL` — מחרוזת של ה-**session
  pooler** (`*.pooler.supabase.com`, פורט 5432, IPv4). החיבור הישיר
  `db.<ref>.supabase.co` הוא IPv6-only ו-runners של GitHub Actions נכשלים עליו.
  סיסמה עם תווים מיוחדים — percent-encoding. ואז workflow_dispatch על "Apply
  Supabase migrations". מכאן והלאה כל מיגרציה תרוץ מעצמה.
- **המהירה:** להדביק כל קובץ ב-SQL Editor, **לפי הסדר**.

### 2. `ADMIN_TOKEN`

GitHub → Settings → Secrets and variables → Actions. מחרוזת אקראית, לפחות 8
תווים. בלעדיו `/admin` כולו מחזיר 503 — כולל לשונית "עיצובים".

### 3. גוגל — יצירת OAuth client

Google Cloud Console → APIs & Services:

1. **OAuth consent screen:** External. שם האפליקציה `RM JEWEL`, מייל תמיכה,
   דומיין `rmjewel.com`, לוגו. ה-scopes הם `email`/`profile`/`openid` בלבד —
   הם **אינם רגישים**, ולכן אין צורך בתהליך אימות של גוגל ואין מסך אזהרה.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. **Authorized redirect URI** — זה של Supabase, לא של האתר:
   `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
   את `<PROJECT_REF>` לוקחים מה-secret `SUPABASE_URL`.
4. לשמור את ה-**Client ID** וה-**Client Secret**.

### 4. Supabase — הפעלת הספקים

Dashboard של הפרויקט:

- **Authentication → Sign In / Providers → Google:** Enable, להדביק Client ID
  ו-Client Secret מסעיף 3.
- **Authentication → Sign In / Providers → Email:** Enable. **לכבות
  "Confirm password"/סיסמאות** ולהשאיר קוד חד־פעמי — אין סיסמאות במוצר הזה.
- **Authentication → URL Configuration:**
  - Site URL: `https://rmjewel.com`
  - Redirect URLs: `https://rmjewel.com/**` ו-`http://localhost:3000/**`

### 5. Supabase — שליחת מיילים אמיתית

ה-SMTP המובנה של Supabase מוגבל לכמה מיילים בשעה ואינו מיועד לייצור. בלי SMTP
משלנו, חבר שלישי שינסה להיכנס פשוט לא יקבל קוד — **וזה ייראה כמו באג**.

1. Resend → Domains → להוסיף `rmjewel.com` ולהזין את רשומות ה-DNS.
2. Resend → API Keys → מפתח חדש.
3. Supabase → Authentication → Emails → SMTP Settings:
   - Host `smtp.resend.com`, Port `465`, User `resend`, Password = מפתח ה-API
   - Sender: `noreply@rmjewel.com`, שם השולח `RM JEWEL`
4. Authentication → Emails → Templates: לתרגם לעברית (`dir="rtl"`) את תבנית
   ה-Magic Link / OTP.

> אותו ספק דואר משרת גם את **TODO §A3** — התראה על פנייה חדשה. שווה להקים פעם
> אחת ולסמן את שניהם.

### 6. מפתחות לבילד

`NEXT_PUBLIC_SUPABASE_URL` ו-`NEXT_PUBLIC_SUPABASE_ANON_KEY` (ה-**Publishable
key** מ-Project Settings → API).

שים לב: `NEXT_PUBLIC_*` נצרבים בזמן **בילד**, לא בזמן ריצה. לכן הם צריכים
להיכנס כ-`env` על שלב ה-build ב-`deploy.yml` — **לא** לתוך `secrets.json` של
ה-Worker, שם הם לא ישפיעו על כלום.

---

## חלק ב' — מה הקוד צריך

### 0005_auth.sql

```sql
alter table profiles add column if not exists auth_user_id uuid
  references auth.users(id) on delete set null;

create unique index if not exists idx_profiles_auth_user
  on profiles (auth_user_id) where auth_user_id is not null;
```

### קישור בין `auth.users` ל-`profiles`

בבקשה מאומתת ראשונה:

1. `profiles` לפי `auth_user_id` → נמצא, סיימנו.
2. אחרת לפי `lower(email)` → **קיים חשבון מהבטא**: מצמידים `auth_user_id`. זה מה
   שמונע מחבר שכבר עיצב לאבד את העיצובים שלו ברגע שהכניסה נעשית אמיתית.
3. אחרת יוצרים `profiles` חדש עם `kind='friend'`.

הצעד השני הוא הקריטי, והוא צריך טסט.

### שכבת הסשן

- להוסיף `@supabase/ssr`.
- `src/lib/supabase/server.ts` — `createServerClient` שקורא/כותב עוגיות.
- `src/lib/account.ts` — `readAccountId` נשלפת מ-`auth.getUser()` (שמאמת מול
  שרת האימות; `getSession()` לבדה סומכת על תוכן העוגייה) ואז ממופה ל-`profiles`
  לפי הקישור למעלה. **החתימה נשארת.**
- `src/app/api/auth/callback/route.ts` — `exchangeCodeForSession(code)` וניתוב
  חזרה ל-`/design`.
- העוגייה הישנה `rmjewel_uid`: להשאיר כמסלול קריאה בלבד לתקופת מעבר, כדי שמי
  שבאמצע עיצוב לא ייזרק החוצה בפריסה, ואז למחוק. להחליט מפורשות ולכתוב מתי.

### ממשק

`AccountGate` הופך משדות שם/מייל/טלפון ל:

- **"המשך עם Google"** — כפתור ראשי, `signInWithOAuth`.
- **מייל** — שדה אחד → נשלח קוד → שדה קוד → `verifyOtp`.
- שם וטלפון נאספים **אחרי** הכניסה הראשונה, ורק אם חסרים (מגוגל השם מגיע לבד).

לזכור: המשפך שומר state בזיכרון. יציאה ל-OAuth וחזרה **מרעננת את העמוד** ומאבדת
את מה שהוזן במסכי המידות והתיאור. צריך לשמר את `CreateState` (sessionStorage)
לפני הניתוב ולשחזר בחזרה — אחרת חבר שבחר "המשך עם Google" יחזור למסך ריק.

### מה נשאר לנקות

- `he.acctNote` ("אין סיסמה. המייל הוא מה שמחזיר אתכם…") — לא נכון יותר.
- `docs/TODO.md` §G3 — נסגר.
- טסטי `src/lib/__tests__/account.test.ts` — נכתבו לעוגייה החתומה. אם היא נמחקת,
  הם נמחקים איתה, ובמקומם טסט על מיפוי `auth.users` → `profiles`.

---

## הגדרת "סיימנו"

לא "הקוד נכתב". **הכניסה עובדת בייצור, ובדוקה בפועל:**

- [ ] חבר חדש נכנס עם Google → נוצר `profiles` → מעצב → העיצוב מקבל `RM-XXXX`
- [ ] חבר חדש נכנס עם קוד במייל → הקוד **מגיע** → נכנס → מעצב
- [ ] מי שכבר עיצב בבטא נכנס עם אותו מייל → **רואה את העיצובים הישנים שלו**
- [ ] `/admin` → "עיצובים" מציג את שניהם עם השם והמייל הנכונים
- [ ] כניסה חוזרת ממכשיר אחר מחזירה את אותם עיצובים
