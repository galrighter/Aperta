# דוח ביקורת מקיף — Forme Studio (אוגוסט 2026)

מסמך זה מרכז ביקורת מקצה-לקצה של האתר ומנגנון היצירה, לקראת החלפת הדומיין.
הבדיקה כיסתה שש חזיתות: **אבטחה**, **מנגנון היצירה בצד ה-Worker**, **שירות
הווקטורייזר (Python/Hetzner)**, **מנוע הגאומטריה והוולידציה הייצורית**,
**חוויית המשתמש והממשק**, ו**ארכיטקטורה + מוכנות להחלפת הדומיין**.

כל ממצא אומת מול הקוד עצמו (לא ניחוש), עם הפניה ל-`קובץ:שורה` ותרחיש כשל קונקרטי.
בדיקות הבסיס עברו נקי: `tsc --noEmit` תקין, כל 428 הטסטים עוברים.

**נקודת ההקשר החשובה ביותר על ה-DB:** לכל הטבלאות מוגדר `ENABLE ROW LEVEL SECURITY`
עם **אפס policies** — כלומר אין רשת ביטחון במסד. כל החלטת הרשאה חיה בקוד האפליקציה
בלבד. זו החלטה לגיטימית (מפתח ה-anon לא יכול לקרוא/לכתוב כלום), אבל המשמעות היא
שכל פרצה בשכבת האפליקציה למטה היא פרצה אמיתית ולא ממותנת.

---

## תקציר מנהלים — מה חייב להיסגר לפני החלפת הדומיין

| # | חומרה | נושא | ליבה |
|---|-------|------|------|
| C1 | 🔴 קריטי | שרשרת ניצול אנונימית מלאה דרך פרופילי "בודק" | כל אחד באינטרנט יכול לשרוף כסף OpenAI ולמחוק עיצובים — בלי התחברות |
| C2 | 🔴 קריטי | ה-Worker נהרג באמצע יצירה / ניתוק לקוח = ריצה בתשלום שאבדה | אין החזקה עמידה של ה-job; הצינור רץ בתוך בקשת ה-HTTP |
| C3 | 🟠 גבוה | דילוג/עקיפה של המכסה היומית | ריצות שנכשלות לא נספרות → הוצאה בלתי מוגבלת; TOCTOU בבדיקה |
| C4 | 🟠 גבוה | דריסת job של משתמש אחר דרך `jobId` שהלקוח שולח | הזרקת תוצאה/שגיאה לתוצאה של לקוח אחר |
| C5 | 🟠 גבוה | הווקטורייזר והשירות הגאומטרי פתוחים כשה-token ריק | endpoint לא-מאומת ששורף OpenAI + SSRF של PUT עיוור |
| C6 | 🟠 גבוה | תאריכים עבריים יוצאים הפוך בחיתוך | `12.3.24` נחתך כ-`24.3.12` — פגם ייצור על שם/תאריך |
| C7 | 🟠 גבוה | חלקים לא-ייצוריים עוברים ולידציה | אין בדיקת רוחב-גשר מינימלי; צוואר 0.2 מ"מ נחתך ונשבר |
| C8 | 🟠 גבוה | הפריסה לא חסומה על CI | commit אדום יכול להגיע לפרודקשן; מיגרציות וקוד רצים בלי סדר |
| C9 | 🟠 גבוה | טופס "צור קשר" הוא `mailto:` שלא מגיע לשום מקום | פנייה נעלמת בשקט; לא מגיעה ל-backend הקיים של הפניות |

פירוט מלא של כל אחד למטה, לפי חזית.

---

## 1. אבטחה

### 🔴 C1 — שרשרת ניצול אנונימית מלאה דרך פרופילי "בודק"
שלוש החלטות סבירות בנפרד מצטרפות לפרצה שלמה ללא כל התחברות:

1. **דליפה:** `GET /api/profiles` ציבורי ומחזיר את ה-`id` של כל פרופיל
   `kind='tester'` (`src/app/api/profiles/route.ts:10-27`). ברירת המחדל של `kind`
   היא `'tester'` (`supabase/migrations/0008_accounts.sql:17`), אז ששת הבודקים
   ו-`prompt-debug` כולם נחשפים — בדיוק ה-UUID-ים שהשלבים הבאים צריכים.
2. **עקיפה:** `assertDesignAccess` חוזר **לפני כל בדיקת הרשאה** אם בעל העיצוב
   הוא בודק (`src/lib/designAccess.ts:29`: `if (owner?.kind === "tester") return;`).
3. **יצירה:** `POST /api/designs` מקבל `profileId` מהלקוח בלי אימות כל עוד הוא
   של בודק (`src/app/api/designs/route.ts:55-60`).

**תרחיש ניצול (בלי עוגיות, בלי התחברות):**
`GET /api/profiles` → לוקחים id של בודק → `POST /api/designs {profileId}` →
מקבלים `design.id` → `POST /api/generate {designId}` → הצינור המלא רץ (OpenAI +
Hetzner + render), כסף אמיתי לכל קריאה. המכסה לא מצילה: 50 ליום **לפרופיל**, כפול
~7 בודקים = ~350 יצירות חינם ביום, כל אחת מפעילה `plan.calls` קריאות מודל +
job של עד 300 שנ' — גם וקטור של DoS על התקציב ועל הקופסה.

אותה עקיפה נותנת **IDOR מלא** על כל עיצובי הבודקים: `GET /api/designs/[id]`
מחזיר SVG-ים מלאים וכל הגרסאות; `PATCH`/`DELETE` משנים/מוחקים. 46 העיצובים
הישנים על "בודק 1" (ההיסטוריה של גל עצמו, מתועד ב-`designAccess.ts:22`) —
**קריאים ומחיקים לצמיתות בידי כל אנונימי באינטרנט.**

**כיוון תיקון:** `/api/profiles` לא צריך לחשוף UUID-ים של בודקים לציבור (או
שהסטודיו יעבור אימות); ה-short-circuit של הבודק ב-`assertDesignAccess` לא צריך
להעניק כתיבה/מחיקה/יצירה לפונה לא-מאומת; `POST /api/designs` לא צריך ליצור
שורות בבעלות בודק לפונה אנונימי. שקול header/token של הסטודיו הפנימי.

### 🟠 גבוה — אין הגבלת קצב על התחברות אדמין; סוד האדמין הוא bearer סטטי בעוגייה
`POST /api/admin/session` (`src/app/api/admin/session/route.ts:22-37`) מקבל ניחושים
בלתי מוגבלים — אין נעילה, אין השהיה, אין throttle לפי IP. המינימום הוא 8 תווים
בלבד (`src/lib/admin.ts:9-12`), וה-`requireAdmin` משווה את ערך העוגייה ישירות
מול `ADMIN_TOKEN` — כלומר **העוגייה היא הסוד עצמו** (ללא HMAC/חתימה, ללא token
פר-session, Max-Age של שבוע). ההשוואה עצמה קבועת-זמן (`safeEqual`), אבל שום דבר
לא מגביל ניחוש מקוון. אדמין שולט בהכול: הזמנות (שמות/מיילים/טלפונים/כתובות),
פניות, יומן הריצות, קובצי הייצוא, ו-`llm-health` (ששורף את מפתח OpenAI).
**תיקון:** token ארוך ואקראי + throttling על ההתחברות.

### 🟠 בינוני — `POST /api/validate` לא-מאומת עם קלט בלתי מוגבל → DoS על ה-CPU
`src/app/api/validate/route.ts:10`: `svg: z.string().min(1)` בלי max, וה-handler
מריץ נרמול פוליגונים מלא + boolean `difference` על ה-SVG הזה בלי אימות ובלי
rate-limit. SVG ענק בודד מכריח CPU כבד על ה-Worker; קריאות חוזרות = הגברה זולה.
(לשם השוואה: `/api/text-to-path` חסום ל-60 תווים, `/api/generate` חוסם ל-500KB.)
**תיקון:** cap על הגודל, ושקול gate.

### 🟠 בינוני — ניצול הזמנות/פניות: rate-limit לפי מייל שהתוקף שולט בו
`POST /api/orders` ו-`POST /api/inquiries` ציבוריים במכוון (נכון), המחיר מחושב
בשרת (טוב), יש honeypot. אבל ה-throttle היחיד הוא `MAX_PER_EMAIL_PER_DAY = 10`
לפי המייל שנשלח (`orders/route.ts:31`). שינוי מחרוזת המייל עוקף לגמרי — אין
הגבלה לפי IP. תוקף יכול להציף הזמנות/פניות, כל אחת שולחת שני מיילים דרך Resend
(אחד לתיבה של גל, אחד "אישור" למייל שהתוקף סיפק — וקטור spam/reflection). בנוסף
`getDesign(body.designId)` על UUID שרירותי מאפשר להזמנה לא-מאומתת להתייחס לעיצוב
של מישהו אחר. **תיקון:** throttling לפי IP.

### 🟡 נמוך — `GET /api/generate/[jobId]` מדלג על הרשאה כש-`design_id` הוא null
`src/app/api/generate/[jobId]/route.ts:21`: הבעלות נאכפת רק אם ל-job יש
`design_id`. ל-jobs שנכשלו לפני קשירה לעיצוב, כל מי שמנחש UUID מקבל את ה-payload
של השגיאה. השפעה נמוכה (UUID-gated, מחרוזות שגיאה בלבד) אבל זה נתיב קריאה לא-מאומת.

**נבדק ונמצא תקין (לתיעוד):** נתיבי ה-debug כולם מאחורי `requireAdmin`; ה-open
redirect ב-auth callback חסום (`safeNext`); share token הוא base58 באורך 12 מ-
`crypto.getRandomValues` (~2^70, לא ניתן לזייף); זהות מבוססת `getUser()` מאומת-שרת;
שום סוד לא דולף ל-bundle של הלקוח; אין SSRF בנתיבי ה-fetch של האפליקציה (אבל ראו
הווקטורייזר למטה); `workers/frame` ללא סודות ונגיש רק דרך service binding.

---

## 2. מנגנון היצירה — צד ה-Worker

### 🟠 C2 (גבוה, ידוע ופתוח) — הצינור רץ בתוך בקשת ה-HTTP; ניתוק = ריצה בתשלום שאבדה
`src/app/api/generate/route.ts:40-50` — ההערה בקובץ עצמו מתעדת שגישת ה-`waitUntil`
בוטלה ושהריצה "לא שורדת ניתוק שחותך את הבקשה". התיקון המובטח (הקופסה מחזיקה את
ה-job, ה-Worker מסתקר — TODO #12) **לא ממומש**: `runRenderJob` הוא `fetch`
סינכרוני יחיד (`service.ts:133-159`). תרחיש: משתמשת נועלת את הטלפון בשנייה 30 →
Cloudflare מבטל את ה-invocation אחרי שקריאת התמונה כבר חויבה → אין שורת `runs`,
אין גרסה, המכסה לא נספרה, כסף הוצא, הלקוחה תקועה עד `job_stalled` בדקה 6.
**מועמד הרפקטור מספר 1.**

### 🟠 C3 (גבוה) — המכסה היומית נבדקת read-then-act על הטבלה הלא-נכונה
`src/app/api/generate/route.ts:111-114` + `src/lib/db/designs.ts:281-299`:
- **TOCTOU:** `countTodayGenerations` נקרא לפני הצינור; N בקשות מקבילות רואות
  `used < LIMIT` וכולן רצות — הוצאה מקבילה בלתי מוגבלת.
- **ריצה שנכשלת לא נספרת:** המונה סופר `design_versions` שנוצרו היום, אבל ריצה
  שנכשלה (שגיאת LLM, `vectorize_failed` 422, כשל framing) לא יוצרת גרסה → מי
  שהפרומפטים שלו נדחים שוב ושוב יכול לשרוף קריאות `gpt-image` כל היום בלי ש-`used`
  יעלה.
- **הפוך:** בחירת המועמד הראשון מכניסה גרסת `pick` → עיון בחלופות צורך יחידות
  מכסה שמעולם לא נגעו במנוע.

**תיקון:** לשריין מכסה אטומית מול `generation_jobs`/`generation_runs`, לא להסיק
מגרסאות.

### 🟠 C4 (גבוה) — `jobId` מהלקוח מאפשר לדרוס job של משתמש אחר
`src/app/api/generate/route.ts:123-144` + `src/lib/db/jobs.ts:48-60`: ה-`jobId`
מגיע מגוף הבקשה. אם ה-insert נכשל על PK כפול — הכשל נבלע ("running without it"),
ו-`finishJob`/`failJob` מריצים `UPDATE ... eq("id", jobId)` **בלי בדיקת בעלות או
`run_id`**. תרחיש: תוקף שולח `POST /api/generate` על העיצוב שלו עם ה-`jobId`
של קורבן שבאמצע ריצה → `finishJob` דורס את שורת הקורבן עם ה-`result` של התוקף,
או `failJob` מזריק שגיאה; ה-poll של הקורבן עובר `requireDesignAccess` על העיצוב
שלו ומציג את ה-payload של התוקף. ההגנה היחידה היא אי-ניחוש UUID. **תיקון:** לאמת
התאמת `run_id`/design ב-patch, או לדחות POST שה-insert שלו התנגש.

### 🟠 בינוני — כשלים בנתיב ה-framing מפילים יצירה שלמה או תולים אותה
- `src/lib/render/frameClient.ts:50-67` — ל-`frameOne` (קריאת service-binding)
  אין timeout, בניגוד ל-`frameOnBox` (`AbortSignal.timeout(30_000)`). קופסה
  מתה → fallback ל-`forme-frame` שנתלה → היצירה נתלית לכל מועמד.
- `src/lib/render/frameClient.ts:126` — ה-fallback המקומי לא עטוף פר-מועמד: SVG
  אחד פגום מפיל את כל היצירה, גם כש-5 מ-6 מועמדים תקינים (והווקטורייזר כבר אישר).
  ה-fallback גם מחזיר בשקט את סיכון ה-128MB-isolate שכל הארכיטקטורה קיימת כדי למנוע.

### 🟠 בינוני — "תקוע" הוא הכרעה של הלקוח שיכולה להיות שקרית → הפתעת גרסה + חיוב כפול
`src/lib/db/jobs.ts:34` + `[jobId]/route.ts:33-38` + `src/lib/client/api.ts:169-179`:
`updated_at` מתעדכן רק ב-`createJob` וב-`setJobStage("saving")`. שלב "saving" גרוע
(6 מועמדים × 30 שנ' timeout + fallback + ingest) עובר בקלות 6 דקות. ה-GET עונה
`job_stalled` **בלי לסמן את השורה**, וה-`pollJob` מפסיק. תרחיש: קופסה איטית →
המשתמשת מקבלת "היצירה נכשלה" בדקה 6, מנסה שוב (ריצה שנייה בתשלום), המקורית מסתיימת
בדקה 7 → שתי גרסאות, שני חיובים.

### 🟡 בינוני — עומס זיכרון: קלט תמונות מנופח ותמונות מתות
`src/app/api/generate/route.ts:54-57, 256-266`: הסכימה מתירה 3 × 8MB data-URL.
כל אחד מפוענח ל-media-type (נזרק), מפוענח **שוב** ב-`runGeneration`, וה-base64
מועתק שוב — שיא הקצאה חולף ~60-80MB ב-isolate שנמדד ~100MB P999. בפועל רק תמונת
ה-inspiration הראשונה נמצאת בשימוש; תמונות `annotation` מאומתות, נספרות, ומנוטרלות
בשקט. **תיקון:** לחסום לתמונה אחת, לאמת בלי פענוח מלא, להסיר `annotation`.

### 🟡 בינוני — הפניית סטנסיל בונה את כל 9 הגופנים במקביל ומצמידה כל גליף
`src/lib/render/letteringImage.ts:226-233`: `Promise.all(...map(letteringPolygons))`
מריץ `textToStencil` + `offset` לכל הסגנונות גם כשצריך רק `rows×cols ≤ 6` תאים,
ומחזיק את כולם. זה בדיוק החשוד הלא-נמדד ל-`forme-studio` ליד 100MB (H11 במסמך
האבחון). **תיקון:** לחשב עצל/סדרתי, לעצור מוקדם, לשחרר `glyphs` לפני ההמתנה.

### 🟡 נמוך — הצינור LLM טקסט→SVG הוא קוד מת בפרודקשן
`src/lib/llm/*` — הקורא היחיד מחוץ ל-`lib/llm` הוא `/api/llm-health`. לולאת התיקון,
fallback ספקים, `LLM_TIMEOUT_MS` — כולם לא נגישים מהמוצר. **מועמד מחיקה מובהק**
לפני הרפקטור; הוא גם מחזיק שני נתיבי env של מפתחות API שכבר לא צריכים להיות ב-Worker.

**נבדק ותקין:** framing מחוץ ל-isolate בסדר box→FRAME→local; `normalized` לא חוצה
את הגבול; זרימת signed-upload-URL שומרת בתים מחוץ ל-Worker; התראת quota-exhausted
מבצעת dedup בחלון שעה. **פתוח:** ההרג `exceededResources` בזיכרון/CPU נמוך נשאר
בלתי מוסבר וחזר אחרי המיגרציה — שום דבר בקוד הנוכחי לא פותר אותו.

---

## 3. שירות הווקטורייזר (Python / Hetzner)

### 🟠 C5 (גבוה) — אימות opt-in וכבוי כברירת מחדל
`vectorizer/app/api/main.py:26-32` + `config.py:75`: כש-`VECTORIZER_TOKEN` לא מוגדר,
`require_auth` חוזר מיד וכל endpoint (כולל `/api/generate` ששורף את מפתח OpenAI)
פתוח לאינטרנט. כל הרצה שבה ה-env חסר (docker run מקומי, restart ידני שמשמיט את
המשתנה, host חדש אחרי המעבר) חושפת endpoint לא-מאומת עד 8 קריאות תמונה לבקשה.
ה-workflow חוסם deploy אם POST לא-מאומת לא מחזיר 401 — אבל זה מגן רק על deploy דרך
ה-workflow. **אותה בעיה בשירות הגאומטרי:** `geometry-service/server.ts:62,80` —
`server.listen(PORT, "0.0.0.0")` (למרות שההערה אומרת "localhost בלבד"),
ו-`if (TOKEN && ...)` מנטרל את בדיקת ה-bearer כשה-token ריק.

### 🟠 גבוה — SSRF: PUT עיוור לכל URL שנמסר
`vectorizer/app/uploads.py:21-29` (מוזן מ-`main.py:189`): השירות עושה PUT לבתים אל
**כל** URL ב-`artifacts.renders`/`stages` בלי allowlist של host. מי שמחזיק (או עוקף)
את ה-token יכול לגרום לקופסה לעשות PUT לכתובות פנימיות (`127.0.0.1:8100` — השירות
הגאומטרי על אותה קופסה, `169.254.169.254`, hosts ב-LAN) או לשאוב artifacts לשרת
של תוקף. **תיקון:** allowlist נעול ל-host של אחסון Supabase.

### 🟠 גבוה — event loop חסום: upload אחד מקפיא את כל השירות
`vectorizer/app/api/main.py:41-64`: `create_job` הוא `async def` אבל קורא
`run_pipeline` סינכרונית וחוסם את ה-worker היחיד של uvicorn לכל משך ה-trace
(עשרות שניות). בזמן שהוא רץ, `/api/health` וכל `/api/generate` בתעופה נתקעים →
ה-health poll או nginx מתחילים 502, ובקשת ה-vectorize של ה-Worker נכשלת בtimeout.
(`/api/generate` נכון משתמש ב-`anyio.to_thread`, אבל `split_panels`, ה-resvg render
ו-`_stage_images` עדיין על ה-loop.)

### 🟠 גבוה — fan-out בלתי מוגבל של פאנלים + זיכרון בלתי מוגבל
- `generate.py:125-127` + `core/panels.py:120-133`: `split_panels` מייצר פאנל לכל
  band **שזוהה** (× עד 4 עמודות), לא לכל `rows` שנתבקש. render רועש מייצר עשרות
  פאנלים × עד 8 renders, כל אחד מריץ צינור 15-מועמדים → הזמן חורג מ-240s של ה-Worker
  ומ-300s של nginx; הלקוחה מקבלת 502 בזמן שהקופסה ממשיכה לחשב שעה בלי ביטול.
- `core/conditioning.py:183-186`: כל פאנל מוגדל ל-3600px לפני ולידציית מימדים
  (פאנל portrait הופך ל-3600×10800 float32 ≈ 155MB), וכל מועמד מצמיד mask מלא.
  4 פאנלי portrait במקביל ≈ כמה GB → ה-OOM killer לוקח את הקונטיינר, וההוצאה אבדה.
  **באג בונוס:** הגובה המוגדל יכול לחרוג מ-`MAX_IMAGE_DIMENSION` (8192), כך שהשירות
  דוחה את התמונה שהוא עצמו יצר — ובנתיב ה-generate הדחייה נבלעת בשקט.

### 🟡 בינוני — אפס לוגים בכל השירות + בליעת חריגות פר-פאנל
`generate.py:140-141`: `except Exception: return None`, ואין שום `logging` בכל
`app/` (רק `print` יחיד ב-`cli.py`). באג שיטתי מפיל כל פאנל של כל ריצה; הלקוחה
רואה `status: "rejected"` ואין כלום בקופסה לאבחון. בנוסף `/api/generate` תופס רק
`ImageGenError`; כל השאר (PNG חתוך מ-OpenAI, באג ב-uploads) בורח כ-500 — בדיוק
ה-status שגופו מוחלף בידי Cloudflare, הבעיה שכבר תוקנה פעם ועדיין קיימת בשני נתיבים.

### 🟡 בינוני — נקיון וזליגת משאבים
- `storage/job_storage.py:69-72`: סריקת TTL רק ב-`get()`, וה-Worker רק עושה POST —
  אף פעם לא GET/DELETE. כל `/api/jobs` משאיר תיקייה של PNG-ים במגה-בייטים + רשומה
  בזיכרון שלא מנוקה עד restart → דיסק ו-RAM גדלים מונוטונית.
- `main.py:127` (`GenerateIn`): `prompt` ללא max, `inspiration.base64` ללא cap —
  רק nginx (`client_max_body_size 25m`) מרסן. host שלא מאחורי אותו nginx חשוף.
- `pipeline.py:29`: `SVG_DETAIL_COUNT = None` → `build_debug` מטמיע את ה-SVG של
  **כל** מועמד (עד 15 לפאנל), וה-Worker שומר גולמי ל-jsonb → תשובות ושורות DB
  מנופחות שגדלות עם מורכבות העיצוב.

### 🟡 נמוך — היגיינה
`main.py:31` משתמש ב-`!=` במקום `secrets.compare_digest` (timing); `main.py:75-82`
מתייג כל `ValueError` כ-`NO_FOREGROUND_FOUND`; קוד מת (`STAGE_NAMES`, `output_mode`,
`GenerateIn.rows`); `imagegen.py:165-169` בלי retry על 429/5xx חולף של OpenAI;
`README.md:145-163` מתעד ערכי gate סותרים (0.985 מול 0.88 מול 0.75 האמיתי).

---

## 4. מנוע הגאומטריה והוולידציה הייצורית

### 🟠 C6 (גבוה) — תאריכים/מספרים עם מפרידים יוצאים הפוך
`src/lib/text/stencil.ts:45-58` (`visualOrder`) + `stencil.ts:29`
(`LTR_RUN_RE = /[A-Za-z0-9]/`): שחזור רצף ה-LTR מכיר רק ב-`[A-Za-z0-9]`, אז מפריד
(`.`,`/`,`-`,`:`) מפצל מספר לרצפים נפרדים שסדרם נשאר הפוך. צמיד `רוני 12.3.24`
נחתך `24.3.12`. תאריכים הם use-case מפורש בהערת הקובץ עצמה, החלק הפיזי נחתך שגוי,
וזה לא-מכוסה בטסטים (`bidi.test.ts` בודק רק רצפים ללא מפרידים). **מאומת.**

### 🟠 C7 (גבוה) — אין בדיקת רוחב-גשר/צוואר מינימלי; תיקוני צוואר דק נכשלים בשקט
`src/lib/geometry/validate.ts:87-151` (רק V2/V5) + `thickenBridges.ts:173-179`:
V2 בודק רק קישוריות טופולוגית, אז חומר המחובר בצוואר דק שרירותית (אפילו קרוב-לאפס)
עובר ולידציה; המיתון היחיד, `thickenBridges`, הוא תיקון best-effort שחוזר בשקט ללא
שינוי כשעובר `MAX_VERTICES` (10,000), >24 איים, או `addedArea > 2%` — בלי warn/fail
ביומן. עיצוב עמוס עם צוואר 0.2 מ"מ עובר הכול, מיוצא ל-DXF, ונשבר בחיתוך/גלגול.
(הערות הקובץ מאשרות שצווארי 0.37 מ"מ קורים בפרודקשן — RM-0068.)

### 🟠 גבוה — נתיב text-request חותך גשרי אות בלי רצפת רוחב מינימלית
`src/lib/text/stencil.ts:145` מול `letteringImage.ts:158`: נתיב ה-text-request קורא
`textToPolygons(..., fab.minBridgeCut)` ומשאיר `minWidthMm` על 0, בעוד נתיב תמונת
הלטרינג מעביר נכון `FAB.minLetterBridgeMm` (0.75). `<text-request>` עם אותיות
6 מ"מ מייצר גשר ~0.34 מ"מ, חצי מהרצפה — ובשילוב עם C7 (אין ולידציית רוחב) הצוואר
המתכתי הזה נשלח לייצור ונשבר.

### 🟡 בינוני — אי-התאמות שמפילות/מעבירות בטעות
- `normalize.ts:298` מול `validate.ts:134-135`: `dropThinCutouts` שומר cutout אם
  שטח eroded `> 1e-9`, אבל V5 נכשל על `< 1e-4` — אותו predicate, שתי מימושים.
  ה-cleaner ו-V5 גם עובדים בגרנולריות שונה (MultiPolygon שלם מול פר-פוליגון).
- `normalize.ts:210-225`: subpath שכיוון הליפוף שלו הפוך מהטבעת הדומיננטית מסווג
  כ-"חור" ונעלם בשקט — צורה נפרדת לגיטימית (שני כוכבים מנוגדי-כיוון בנתיב אחד)
  אובדת מהגאומטריה שנחתכת.
- `normalize.ts:274` מול `frame.ts:54`: שני פורמטים "קנוניים" סותרים — normalize
  שומר פקודות עקומה (C/S/Q/T/A), אבל `rescaleCutoutsSvg` זורק על כל מה שאינו M/L/Z.
  עיצוב שנשמר דרך צינור ה-LLM ואז נכנס שוב ל-framing (עריכה/share-adopt) מפיל את
  כל הקריאה.
- `letteringImage.ts:170-188` מול `frameCutouts.ts:113-118`: קואורדינטות גשרי-אות
  ב-frame של ה-strip המסודר, אבל framing עשוי לספק רוחב שונה ב-±5% → מרכז ה-counter
  זז עד ~0.45 מ"מ, קרוב לסובלנות ה-`matchLetter` → gשר בכיוון שגוי (למשל אנכי על ם,
  שההערה אומרת שהופך אותה לאות אחרת).
- `paths.ts:24,239-247`: ה-tokenizer דוחה תחביר SVG-חוקי (arc flags דחוסים) ומטפל
  שגוי בתתי-נתיב אחרי Z → repair round מבוזבז, או גאומטריית חיתוך שקטה-שגויה.

### 🟡 בינוני — DXF R12 חסר קבוצות חובה וטבלת LTYPE
`src/lib/dxf/dxf.ts:18-29,66-71`: ה-POLYLINE נכתב בלי נקודת הדמה (10/20/30) שנדרשת
לפני flag 70 ב-R12, ושני ה-layers מפנים ל-linetype `CONTINUOUS` בלי טבלת LTYPE.
importers קפדניים (AutoCAD AUDIT, חלק מ-CAM של מפעלי לייזר) דוחים או מפילים ישויות
— בדיוק השלב הידני שהצינור אמור לבטל.

### 🟡 בינוני (ביצועים) — `restoreBridges` בלי windowing
`src/lib/geometry/restoreBridges.ts:274`: לכל אי סורק כל קודקוד מול כל edge של
**כל** החומר — O(V·E). `thickenBridges` כבר קיבל חלון 2 מ"מ אחרי שמדד קפיצה
מ-186ms ל-1281ms ב-10,000 קודקודים; `restoreBridges` לא קיבל את התיקון, ורץ פר-
מועמד גם ב-Worker.

**הערות רפקטור:** `frameCutoutsDims` מריץ 4 ולידטורים לכל קריאה, כל אחד עושה
boolean ops מלאים; גרף החומר נגזר מחדש ≥6 פעמים למועמד. עוזרי bbox משוכפלים
5 פעמים. `dropDetachedMaterial` נעקף בידי `restoreBridges` אך עדיין מיוצא ונבדק.

---

## 5. חוויית משתמש וממשק

### 🟠 גבוה — החלפת מוצר באמצע הזרימה שומרת את העיצוב הקודם → פריט שגוי מוזמן
`src/app/(site)/design/page.tsx:938-947`: בחירת מוצר עושה רק `set({ product: p })`;
`designId`, `edits`, `activeEdit` שורדים. משתמש מייצר צמיד, חוזר לשלב 1, בוחר
"טבעת", ומגיע לשלב 4 ורואה את סקיצת ה**צמיד** מוצגת כטבעת; `priceOf` מתמחר כטבעת,
ו-`submitOrder` שולח `productType: "ring"` עם ה-`versionId` של הצמיד. שום דבר לא
חוסם או מזהיר.

### 🟠 גבוה — שינוי מידות אחרי יצירה לא מקנה-מידה ולא מזהיר → מידה מוזמנת שונה מהגאומטריה
`src/app/(site)/design/page.tsx` + `model.ts:449-453`: בניגוד לסטודיו (שמייצר מחדש
ב-`updateDims`), המשפך לא עושה כלום כשחוזרים למסך המידות ומשנים היקף אחרי שקיים
עיצוב. הסקיצה שומרת את האורך הישן (מה-SVG), אבל ה-order שולח `circumferenceMm(s)`
טרי לצד ה-`versionId` הישן. הלקוחה חושבת שהזמינה מידה חדשה; הסדנה מקבלת גאומטריה
שנחתכה לישנה.

### 🟠 גבוה — Back בדפדפן יוצא מכל המשפך
`src/app/(site)/design/page.tsx:152-157`: `go()` הוא `setState` בלבד, בלי `pushState`.
כל 8 המסכים ב-`/design` עם state בזיכרון. בנייד, Back מ-`result`/`summary`/`checkout`
מנווט מחוץ ל-`/design` לגמרי; כתובת המשלוח, אישור התנאים וטקסט העריכה אובדים.

### 🟠 גבוה (C9) — טופס "צור קשר" הוא `mailto:` שלא מגיע ל-backend הקיים
`src/components/site/ContactForm.tsx:29-33`: הטופס מאמת ואז `window.location.href =
"mailto:…"`. בדסקטופ בלי mail-handler מוגדר (משתמשי webmail — נפוץ מאוד), הלחיצה
לא מייצרת שום תוצאה: אין שגיאה, אין אישור, ההודעה אובדת. במקביל `/api/inquiries`
ולשונית ה"פניות" באדמין קיימים — הטופס פשוט לא פונה אליהם.

### 🟡 בינוני — פגמי זרימה וסטטוס
- **עיצוב שנכשל בוולידציה עדיין ניתן להזמנה:** `ResultScreen.tsx:385-387` — כפתור
  ההזמנה לא disabled כשהכרטיס אומר "לא ניתן לייצור" (הסטודיו חוסם ייצוא במקרה כזה).
- **Refresh באמצע יצירה מפיל לשלב 1 בלי אינדיקציה** ומזמין ריצה כפולה בתשלום
  (`DesignReadyWatch` נדלק רק כשה-job מסתיים; "להשלים את היצירה" מתחיל ריצה שנייה).
- **כפתור ההזמנה פעיל בזמן שעריכה מתבצעת:** עריכה שמסתיימת ברקע מחליפה את הגרסה
  שהוזמנה מתחת לידי הלקוחה (`ResultScreen.tsx:385`, `page.tsx:671,805`).

### 🟡 בינוני — נגישות
- מודלים בלי focus management/trap; דיאלוג "העיצוב מוכן" בלי Escape/סגירה בלחיצה על
  הרקע (`ui.tsx:251-281`, `DesignReadyWatch.tsx:80-118`).
- שדות הטקסט המרכזיים במשפך מתויגים ל-screen-reader רק דרך placeholder
  (`BriefScreen.tsx:160-167`, `SizesScreen.tsx:72-79`, `ResultScreen.tsx:274-280`).

### 🟡 בינוני — מיתוג ותוכן משפטי
- **שם מותג שגוי + הערה פנימית של עורך-דין מוצגים ללקוחות:** התנאים אומרים
  "השימוש באתר forme… שייכים ל-forme" (`he.ts:390,393`) כשהמותג הציבורי הוא
  RM JEWEL, וה-`legalNote` "מומלץ לעבור עם עורך/ת דין" (`he.ts:386`) מוצג בדף
  /terms ו-/privacy החי (`LegalPage.tsx:31-33`).
- **checkbox תנאים בלי קישור לתנאים** (`SummaryScreen.tsx:110-129`).
- **הסטודיו הפנימי מפורסם ל-SEO** (`sitemap.ts:7,11` בעדיפות 0.9, `llms.txt:22`) —
  כלי בודקים לא-מאובטח, לקוח שנוחת מגוגל פוגש UI פנימי לא-ממותג.

### 🟡 נמוך — קופי והתנהגות
- copy של "אל תנסה שוב עכשיו" בזמן שהכפתור הראשי הוא "נסה שוב" (`he.ts:124`).
- timeout של 8 דק' מסתיים ב"משהו השתבש" עם progress bar תקוע ב-96%.
- checkout לא ממלא מראש מייל/שם של משתמש מחובר.
- אי-עקביות מגדר/רושם בעברית ("קחי" מול "קחו", "מאשרת" מול "שלח") + טעות הקלדה
  "ממשי" → "ממשיים" (`he.ts:250`).
- טקסט שגיאת JS גולמי ("TypeError…") והוראות devops ("יש להריץ מיגרציות") דולפים
  ל-UI של הלקוחה (`page.tsx:340-343`, `he.ts:125`).

**עשוי היטב (לכיול):** heartbeat של pendingJob + התאוששות DesignReadyWatch,
שחזור OAuth state, poll התאוששות אחרי 5xx, מניעת שורת עיצוב כפולה, טיפול בפקיעת
הרשאת share, `lang="he" dir="rtl"` עם `bdi`/`dir="ltr"` נכון ברוב המקומות.

---

## 6. ארכיטקטורה, CI/CD ותשתית

### 🟠 C8 (גבוה) — הפריסה לא חסומה על CI, ומיגרציות/קוד רצים בלי סדר
- `.github/workflows/deploy.yml:3-6`: push ל-main מריץ `npm ci → build → deploy`
  **בלי טסטים, בלי typecheck, בלי lint**; `ci.yml` רץ במקביל אבל שום דבר לא מחייב
  את ה-deploy לחכות לו. commit אדום ו-deploy מוצלח יכולים לבוא מאותו commit.
  (`deploy-geometry.yml` כן מריץ `tsc` + `npm test` קודם — התבנית קיימת, פשוט לא
  על ה-deploy הראשי.)
- `migrate.yml` ו-`deploy.yml` הם workflows עצמאיים שמתחרים על אותו commit — קוד
  שדורש עמודה חדשה יכול לעלות לפני המיגרציה. אם `SUPABASE_DB_URL` לא מוגדר,
  ה-workflow **מזהיר ויוצא 0** — check ירוק בלי מיגרציה.
- `migrate.yml:37-40`: משחזר כל קובץ בכל ריצה בלי ledger; הבטיחות נשענת כולה על
  idempotency ידני. statement לא-idempotent עתידי אחד מפיל את הרצף.

### 🟠 גבוה — נקודת כשל יחידה בלי ניטור (קופסת Hetzner)
יצירת התמונות והווקטוריזציה בלי fallback (רק framing מתדרדר בחן box→FRAME→local).
`diagnose-worker.yml` מתריע על הרג Worker יומית, אבל שום דבר לא בודק
`vec.<domain>/api/health` — קופסה מתה = כל יצירה 502 עד שלקוחה מתלוננת.
**תיקון:** workflow תזמון שבודק את endpoints הווקטורייזר והגאומטרי (שכפול של
תבנית ה-diagnose).

### 🟡 בינוני — פערי pipeline נוספים
- הארטיפקט שנפרס לא נבנה ב-CI (`ci.yml` בונה `next build`, deploy בונה
  `opennextjs-cloudflare build`) — כשל OpenNext-only מתגלה קודם בפרודקשן.
- `NEXT_PUBLIC_SUPABASE_*` חסר נכשל בשקט בזמן ריצה (default `""`) → אתר עם login
  שבור וללא שגיאות.
- אין lint בשום workflow.
- `deploy.yml:35-53`: סודות מורכבים ל-JSON ב-heredoc — סוד עם `"` או `\` יוצר JSON
  לא-תקין; `concurrency: cancel-in-progress: true` יכול לבטל בין deploy של frame
  ל-studio → אי-התאמת גרסאות שההערה אומרת שאסור שתקרה.
- `compatibility_date: 2025-05-01` מיושן ~15 חודשים בשני קונפיגי wrangler.

### 🟡 נמוך
- ניטור: `diagnose-worker.yml` טוב, אבל ערוצי התראה = מיילים של GitHub בלבד.
- `tsconfig.tsbuildinfo` מחויב ל-repo (ארטיפקט build; להוסיף ל-.gitignore).
- **`npm run lint` לא עובד בכלל** — אין קובץ קונפיג ESLint, אז הפקודה נתקעת על
  שאלה אינטראקטיבית. שום lint לא רץ, גם לא ב-CI.
- **7 פגיעויות npm audit** (6 high, 1 moderate) — כולן בכלי פיתוח
  (wrangler/miniflare/sharp), לא בקוד פרודקשן, אבל שוות עדכון.

---

## 7. רשימת תיוג להחלפת הדומיין

הדומיין הנוכחי: `rmjewel.com` (ווקטורייזר ב-`vec.rmjewel.com`).

### א. קוד/קונפיג שחייב להשתנות (hardcoded, מגיע לפרודקשן)
| מקום | שולט על |
|------|---------|
| `src/lib/site.config.ts:6` (`SITE.url`) | **מקור יחיד** ל-metadataBase, og:url, sitemap, robots, קישורי share, קישורי מייל. עריכה אחת מתקנת את כולם |
| `src/lib/site.config.ts:8` (`contactEmail`) | מוצג באתר + fallback ל-`notifyAddress()` |
| `wrangler.jsonc:14-16` | routes של custom-domain ב-Cloudflare — נדרש re-scope של `CLOUDFLARE_API_TOKEN` ל-zone החדש |
| `src/lib/mail.ts:39` | sender fallback `noreply@rmjewel.com` — חייב אימות דומיין ב-Resend |
| `src/lib/vectorizer.ts:53` + `src/lib/render/service.ts:31` | fallback `https://vec.rmjewel.com` (משוכפל בשני קבצים) |
| `public/llms.txt:16-23` | 8 כתובות `rmjewel.com` מוחלטות — קובץ סטטי שיתיישן בשקט |
| `.github/workflows/deploy.yml:43-49` | defaults ל-`MAIL_FROM`/`MAIL_TO`/`ALERT_TO`/`VECTORIZER_URL` |
| `.github/workflows/deploy-vectorizer.yml:78,134` | `VDOMAIN` (vhost + cert של nginx) + מייל certbot `admin@rmjewel.com` |

### ב. קוסמטי / להחליט (לא URL)
- מפתחות localStorage נושאים את המותג הישן: `rmjewel.create.pending`,
  `rmjewel.myDesigns`, `rmjewel.pendingJob`, `rmjewel_uid`. **אין לשנות** — שינוי
  מאבד למשתמשים את רשימת העיצובים/ה-jobs המקומיים.
- טסטים ותיעוד עם ה-host הישן (עובד עם כל host; קוסמטי).

### ג. מערכות חיצוניות לעדכון
1. **Cloudflare:** להוסיף את ה-zone החדש; re-scope ל-`CLOUDFLARE_API_TOKEN`
   (Workers-Routes + DNS edit); הסרת routes ישנים אחרי cutover.
2. **Supabase Auth:** `site_url` ו-`uri_allow_list` (כרגע `https://rmjewel.com/**` +
   באג `https://localhost` שכדאי לתקן ל-`http://` תוך כדי).
3. **Resend:** אימות הדומיין החדש (רשומות DNS), עדכון `MAIL_FROM`. גם מיילי קוד-
   ההתחברות של Supabase עוברים דרך Resend — תלויים בזה.
4. **Google OAuth consent screen:** authorized domain מפנה ל-`rmjewel.com`.
5. **GitHub vars/secrets:** `MAIL_FROM`, `MAIL_TO`, `ALERT_TO`, `VECTORIZER_URL`,
   `VECTORIZER_DOMAIN` + scope של `CLOUDFLARE_API_TOKEN`. ואז deploy + deploy-vectorizer.
6. **DNS ל-`vec.<דומיין-חדש>`** → IP של Hetzner (ידני; ה-workflow מניח שקיים לפני certbot).
7. **לשמור את `rmjewel.com` בחיים עם 301** — מיילים שכבר נשלחו, קישורי WhatsApp
   `rmjewel.com/d/<token>`, ועמודים מאונדקסים כולם מפנים לישן. דומיין חדש גם מאפס
   מוניטין Safe Browsing (ראו `docs/SITE.md:34-45`) — נדרש אימות מחדש ב-Search Console.

**ההמלצה המרכזית להחלפה:** לגרום ל-`deploy.yml` לחסום על typecheck+טסטים+build של
OpenNext, ולהסיר את כל ה-`|| 'rmjewel...'` defaults מה-workflows (להיכשל בקול אם
משתנה חסר) — המעבר הוא בדיוק הרגע שבו ה-fallbacks השקטים היו מחזירים את הדומיין
הישן לפרודקשן.

---

## 8. סדר עדיפויות מומלץ לפעולה

**גל אחת — לפני שנוגעים בדומיין (אבטחה + כסף):**
1. C1 — לסגור את שרשרת הבודקים (הכי דחוף: אנונימי, סקריפטבילי, עולה כסף בכל בקשה,
   ומאפשר מחיקת עיצובים).
2. C5 — לוודא `VECTORIZER_TOKEN` נאכף (לא opt-in), ו-allowlist ל-SSRF; לתקן את
   ה-bind ל-`0.0.0.0` בשירות הגאומטרי.
3. C3 + C4 — שריון מכסה אטומי + בדיקת בעלות על patch של job.
4. throttling לפי IP על admin-login, orders, inquiries, validate.

**גל שתיים — עמידות מנגנון היצירה:**
5. C2 — להעביר את ההחזקה של ה-job לקופסה ולתת ל-Worker לסקר (TODO #12), כדי
   שניתוק לא יאבד ריצה בתשלום.
6. timeouts ו-fallback פר-מועמד ב-framing; להוריד עומס זיכרון (תמונה אחת, גופנים
   עצלים); למחוק את צינור ה-LLM המת.

**גל שלוש — נכונות ייצור:**
7. C6 — לתקן bidi למפרידים (תאריכים).
8. C7 — ולידציית רוחב-גשר מינימלי + רצפה בנתיב text-request; לרשום ביומן כש-
   `thickenBridges` מוותר.
9. לתקן DXF R12 (נקודת דמה + LTYPE).

**גל ארבע — יחד עם החלפת הדומיין:**
10. C8 — לחסום deploy על CI, לסדר מיגרציה↔קוד, health-check לקופסה.
11. רשימת התיוג של סעיף 7.
12. תיקוני UX: מיתוג בתנאים, הסרת הערת עורך-הדין, טופס צור-קשר ל-`/api/inquiries`,
    חסימת החלפת-מוצר/שינוי-מידה אחרי יצירה, אינדיקציית "יצירה רצה" אחרי refresh.
