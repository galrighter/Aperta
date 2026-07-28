# כניסה מסודרת — מייל או חשבון גוגל

המסמך הזה הוא התוכנית להשלמת הזיהוי מ"בטא לחברים" ל**כניסה אמיתית**: קוד למייל
או חשבון גוגל. הוא מיועד להיקרא בתחילת הסשן שיבצע אותו.

## איפה זה עומד עכשיו

PR #68 מוזג (`6d38870`), `0008_accounts.sql` הוחלה, וה-Worker נפרס עם
`ADMIN_TOKEN`. **הכל למטה חי בייצור** — נמדד ב-28.7:

```
GET  /api/inquiries  → 401 unauthorized      (האדמין פעיל, דורש כניסה)
GET  /api/account    → {"account":null}
POST /api/designs    → 401 account_required  (השער אוכף)
```

| רכיב | מצב |
|---|---|
| טבלת חשבונות (`profiles` עם `kind`/`email`/`phone`) | ✅ חי |
| מספר סידורי לעיצוב (`designs.serial`) | ✅ חי — 46 הקיימים מוספרו `RM-0001`–`RM-0046` |
| שער זיהוי במשפך היצירה | ✅ חי |
| בעלות על עיצוב לפי עוגייה חתומה | ✅ חי |
| לשונית "עיצובים" בבק־אופיס | ✅ חי |
| **אימות זהות** | ❌ **אין.** מי שמזין מייל קיים נכנס לחשבון הקיים |

הפער היחיד הוא האחרון, והוא מה שהמסמך הזה סוגר.

> 46 העיצובים הישנים כולם תחת "בודק 1" — הם נוצרו לפני שהיה רישום, והמשפך ייחס
> כל עיצוב לפרופיל הראשון. זה היסטוריה, לא באג.

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

סעיפים 1–2 כבר סגורים. מה שנשאר פתוח הוא **3 (גוגל)**, **4 (הפעלת הספקים)**,
**5 (SMTP)** ו-**6 (מפתחות לבילד)**.

### 1. מיגרציות — כבר סגור, רק לוודא

`SUPABASE_DB_URL` הוגדר ועובד מאז 27.7: ה-workflow "Apply Supabase migrations"
מריץ את כל `supabase/migrations/` בסדר שמות על כל push ל-main. **אין כאן מה
לעשות** — רק לוודא, אחרי כל merge שמוסיף מיגרציה, שההרצה עברה. `0008` רצה כך
מעצמה ב-merge של #68, ו-`0009` תרוץ באותו אופן.

### 2. `ADMIN_TOKEN` — כבר סגור

הוגדר ונפרס ב-28.7. `/api/inquiries` מחזיר `401` ולא `503 admin_disabled`, כלומר
השער פעיל. אין כאן מה לעשות.

לידיעה למי שמדביק secret חדש: `deploy.yml` דוחף סודות ל-Worker רק בזמן פריסה.
הוספה ב-GitHub לבדה לא משנה כלום עד שרצה פריסה — וזה נראה בדיוק כמו סוד שלא נקלט.

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

### 0009_auth.sql

```sql
alter table profiles add column if not exists auth_user_id uuid
  references auth.users(id) on delete set null;

create unique index if not exists idx_profiles_auth_user
  on profiles (auth_user_id) where auth_user_id is not null;

-- PostgREST עונה מתוך schema cache; בלי זה העמודה קיימת וה-API לא רואה אותה.
notify pgrst, 'reload schema';
```

> מספור: `0001`–`0008` תפוסים. לבדוק `ls supabase/migrations/` לפני שבוחרים
> מספר — הענף הזה כבר התנגש פעם אחת על `0004`.

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
