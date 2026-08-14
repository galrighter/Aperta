# אבחון מלא — האתר והעסק (14.8.2026)

> מסמך עבודה חי. נבנה תוך כדי ריצת שבעה סוכני אבחון מקבילים; כל פרק מתמלא
> כשהסוכן שלו מסיים. האבחון הקודם — `SITE_AUDIT_2026-08.md` — כיסה קוד/אתר
> ונסגר ברובו; המסמך הזה רחב ממנו: קוד, אבטחה, לוגיקה עסקית, UX/SEO, תפעול,
> שוק ותחרות, ומודל עסקי ותמחור.

## מסגרת האבחון

| # | תחום | מה נבדק | סטטוס |
|---|------|---------|-------|
| 1 | קוד וארכיטקטורה | שערי איכות, ארכיטקטורה, חוב טכני, טסטים, CI/CD | ⏳ רץ |
| 2 | אבטחה | אימות, הרשאות, RLS, קלט, secrets, rate limiting | ✅ הושלם |
| 3 | לוגיקה עסקית | תמחור, הזמנות, מידות, ולידציית ייצור, מכסות | ⏳ רץ |
| 4 | UX / SEO / נגישות | אתר חי, משפך המרה, SEO, ביצועים, מובייל | ⏳ רץ |
| 5 | שוק ותחרות | מתחרים בישראל ובעולם, תפיסת פליז, מיצוב | ⏳ רץ |
| 6 | מודל עסקי ותמחור | unit economics, תקרת מודל, GTM, KPIs | ⏳ רץ |
| 7 | תפעול ושרידות | ניטור, נקודות כשל, גיבויים, עומס, עלויות | ⏳ רץ |

## נתוני רקע (נמדדו מהריפו, 14.8)

- **היקף קוד:** ‎~51K שורות אפליקציה — ‎`src/lib` 27.7K, ‏`src/components` 14.9K,
  ‏`src/app` 8.2K; ‏vectorizer (Python) ‎6.3K; ‏20 מיגרציות DB (‏806 שורות SQL).
- **היסטוריה:** 439 קומיטים מ-21.7.2026 (פרויקט בן פחות מחודש); מפתחים:
  galrighter + Claude.
- **CI/CD:** ‏12 workflows — ‏CI, ‏deploy (אתר/גיאומטריה/vectorizer), ‏מיגרציות,
  ‏canary, ‏ops-status, ‏sweep-jobs, ‏comeback, ‏notify-telegram, ‏diagnose-worker,
  ‏undici-override-check.
- **מסחר:** צמיד ₪399 / טבעת ₪299 כולל מע"מ, משלוח ₪35. **אין סליקה** —
  הזמנות מטופלות ידנית.

<!-- הפרקים מתמלאים עם סיום כל סוכן -->

---

# פרק 2 — אבטחה

## תקציר

**המצב טוב מאוד.** כל תשעת הממצאים הקריטיים/גבוהים מהאבחון הקודם (C1–C9) נסגרו
בפועל — כל אחד אומת מול הקוד החי, לא מול טבלת המצב. שרשרת הבודקים האנונימית
סגורה, הבעלות נאכפת בכל מסלול שמקבל מזהה, המכסה אטומית, שירותי הקופסה
fail-closed, וה-SSRF ממותן. **לא נמצאה אף פרצה קריטית או גבוהה חדשה.**

| חומרה | ספירה | פירוט |
|---|---|---|
| 🔴 קריטי | 0 | — |
| 🟠 גבוה | 0 | — |
| 🟡 בינוני/נמוך | 5 | nanoid (לא-נגיש), עוגיית אדמין גולמית, jobId עם design null, קלט ווקטורייזר לא-חסום, חוסר CSP |

## ממצאים פתוחים / חדשים

### 🟡 חדש — `nanoid` HIGH ב-npm audit (לא נגיש בפועל)

`npm audit` מחזיר כעת **2** פגיעויות במקום 1 שתועדה ב-O4. החדשה:
`nanoid <3.3.18` (High, GHSA-2v37-7h3g-55p8) דרך
`@tailwindcss/postcss → postcss → nanoid@3.3.16`.

- **ניצול:** לולאה אינסופית כש-`size=0`. transitive דרך `postcss` (כלי build),
  לא בזמן ריצה, ואין קלט תוקף שקובע `size` — **לא נגיש**, אבל High חדשה בעץ.
- **תיקון:** `npm audit fix` (לא-שובר, בניגוד ל-fast-xml-parser). לעדכן את O4
  מ"פגיעות אחת" ל"שתיים, שתיהן לא-נגישות".

### 🟡 פתוח (מתועד) — עוגיית האדמין היא הסוד עצמו, לא חתומה

`src/lib/admin.ts:50-53` — `requireAdmin` משווה את ערך העוגייה ישירות מול
`ADMIN_TOKEN` (`safeEqual`). אין HMAC, אין token פר-session, ‏Max-Age שבוע
(`session/route.ts:10,40`), ומינימום אורך 8 תווים בלבד (`admin.ts:11`).

- **מיתון שנוסף מאז:** ההתחברות מוגבלת — 10 ניסיונות ל-10 דקות לכל IP
  (`session/route.ts:32`), ולכן brute-force מקוון עוצר. מוריד מ-🟠 ל-🟡.
- **ניצול שנותר:** token שדלף פעם אחת (log, היסטוריית shell) תקף שבוע לכל
  מכשיר; אין revocation פר-session.
- **תיקון:** token אקראי ‎32B+‎, ולשקול עוגייה חתומה (nonce+HMAC) במקום הסוד
  הגולמי בדפדפן.

### 🟡 פתוח (מתועד) — `GET /api/generate/[jobId]` מדלג על בעלות כש-`design_id` null

`src/app/api/generate/[jobId]/route.ts:32-33` — ל-job שנכשל לפני קשירה לעיצוב,
מי שמנחש UUID מקבל את payload השגיאה. השפעה נמוכה (UUID-gated, מחרוזות שגיאה
בלבד). **תיקון:** ‏404 גנרי גם על job בלי `design_id`, או קשירת בעלות ל-account.

### 🟡 פתוח (מתועד) — קלט לא-חסום בשירות הווקטורייזר

`vectorizer/app/api/main.py:153` — ‏`prompt: str` בלי max; ‏`main.py:140` —
`base64: str` בלי cap. ממותן ע"י `client_max_body_size 25m` ב-nginx. בנוסף
`create_job` (‏`main.py:61`) חוסם את ה-event loop (‏`/api/generate` תוקן
ל-`anyio.to_thread`, ‏`/api/jobs` לא) — עניין זמינות.

### 🟡 הקשחה — אין CSP / security headers

אין `Content-Security-Policy`, ‏`X-Frame-Options`/`frame-ancestors`, ולא HSTS
בקוד (`next.config.ts` מגדיר רק `cache-control`; ‏`middleware.ts` רק
`X-Robots-Tag`).

- **ניצול:** ללא CSP כל XSS עתידי רץ בלי מגבלה; ללא `frame-ancestors` האתר
  ניתן למסגור (clickjacking על טופס ההזמנה).
- **תיקון:** ‏`headers()` ב-`next.config.ts` עם CSP הדוק (`default-src 'self'`
  ‏+ מקורות Supabase), ‏`X-Frame-Options: DENY`, ‏`Referrer-Policy`,
  ‏`X-Content-Type-Options: nosniff`.

### 🟢 ידוע ותקין — `fast-xml-parser` moderate

הפגיעות על `XMLBuilder`; הקוד מייבא `XMLParser` בלבד
(`src/lib/geometry/normalize.ts:1`), אין resolution של external entities (אין
XXE) ואין `DOCTYPE` בקונפיג. **לא נגיש**, כפי שתועד.

## נבדק ותקין

- **אימות זהות:** `readAccountId` משתמש ב-`getUser()` (אימות מול שרת, לא
  `getSession`), רענון עוגיות נכון (`account.ts:44-62`). מסלול POST שהנפיק
  זהות מטופס — נמחק.
- **בעלות (IDOR) — נסגר לרוחב:** `requireDesignAccess` נאכף בכל מסלול שמקבל
  מזהה עיצוב/גרסה — `designs/[id]` (GET/PATCH/DELETE), ‏`preview`,
  ‏`duplicate`, ‏`export`, ‏`vectorize`, ‏`shares`, ‏`generate`, וגם `orders`
  (`orders/route.ts:131`) ו-`feedback`. גרסאות מאומתות שייכות לעיצוב לפני
  שמירה.
- **שער האדמין:** כל `api/admin/*` מאחורי `requireAdmin`/`requireBearerAdmin`;
  התחברות rate-limited; השוואה קבועת-זמן; עוגייה
  `HttpOnly; Secure; SameSite=Lax`. ‏`llm-health`, ‏`debug/*`, ‏`jobs/sweep` —
  מאחורי שער.
- **שרשרת הבודקים (C1):** סגורה בשלוש הנקודות (`profiles/route.ts:14`,
  ‏`designAccess.ts:49-52`, ‏`designs/route.ts:63`).
- **RLS:** כל 11 הטבלאות עם RLS ואפס policies (deny-all ל-anon). ‏service key
  בשרת בלבד; הלקוח רק anon key ל-Auth.
- **ולידציית קלט:** zod עם תקרות גודל בכל מסלולי POST; ‏`/api/validate` ‏500KB
  ‏+ 60/דקה/IP; ‏`text-to-path` ‏60 תווים; תמונות 8MB עם allowlist media-type.
- **SSRF:** ‏`vectorizer/app/net.py` חוסם non-https, loopback, private,
  link-local, metadata; שני השירותים fail-closed (503 בלי token).
- **טוקן שיתוף:** base58 באורך 12 ≈ ‎2^70 מ-`crypto.getRandomValues`; ‏`GET
  /d/token` חושף רשימת שדות סגורה בלבד — לא SVG/פרומפט/מזהה.
- **Open redirect:** ‏`safeNext` חוסם `//`, ‏`/\`, וכל מה שלא מתחיל ב-`/`.
- **מיילים:** Resend REST ב-JSON — אין header injection; ‏path traversal
  בתמונות debug חסום ב-allowlist.
- **Rate limiting:** מפתוח לפי `cf-connecting-ip` שאינו ניתן לזיוף מאחורי
  Cloudflare.
- **Secrets:** אין `.env` ב-git; היחיד `NEXT_PUBLIC_*` הוא Supabase URL + anon
  key (ציבוריים בכוונה); אין דליפה ל-bundle לקוח.

**המלצה מיידית אחת:** `npm audit fix` (סוגר את nanoid). ההקשחה המשתלמת ביותר
אחריה — CSP + ‏`X-Frame-Options` ב-`next.config.ts`.
