# STORY_FLOW_PLAN — ניסוי UX מקביל: «הלקוח מספר. Aperta מתרגמת.»

מסמך התכנון של הניסוי, לפני הקוד. הוא מתאר **מה נוצר, מה משתנה, למה, ואיך מוחקים
את הכול**. הכלל העליון: זהו מסלול מקביל. דף הבית הקיים, `/design`, העורך, ההזמנה,
ה-checkout וצינור היצירה ממשיכים לעבוד בדיוק כפי שהם, וברירת המחדל של המערכת אינה
משתנה בשום נקודה.

---

## 0. מה כבר קיים בריפו (הסקירה שקדמה לתכנון)

| מה | איפה | מה נלמד |
| --- | --- | --- |
| דף הבית | `src/app/(site)/page.tsx` | Hero + רצועת מניפסט, CTA יחיד ל-`/design`. נשאר כפי שהוא. |
| המסע הקיים | `src/app/(site)/design/page.tsx` (1,497 שורות) | מתזמר את כל המסכים: `product → sizes → brief → processing → result → summary → checkout → done`, כולל שער חשבון, שחזור מ-OAuth, `jobId` שורד-ניתוק, Back, שמירה מקומית ושיתוף. |
| מסכי המסע | `src/components/create/*` | `ProductScreen`, `SizesScreen`, `BriefScreen`, `ProcessingScreen`, `ResultScreen`, `SummaryScreen`, `CheckoutScreen`, `DoneScreen`, ו-`ui.tsx` (פרימיטיבים: `PrimaryBtn`, `OptionBtn`, `FieldLabel`, `Modal`…). |
| מודל המסע | `src/components/create/model.ts` | `CreateState`, `WIDTH`, `circumferenceMm`, `stripLengthMm`, `sizeIssue`, `CIRC_LIMIT_MM`, `buildPrompt`, `frameWidthMm`. |
| מידות | `src/lib/sizing.ts`, `src/lib/fabrication.config.ts` | `defaultWidthMm` 18 (צמיד) / 6 (טבעת); `widthRangeMm` `[5,80]` / `[4,18]`; ההמרה היקף → אורך פריסה עוברת ב-`computeSizing`. |
| פרומפט היצירה | `src/lib/llm/imagegen.ts#buildRenderPrompt` | פסקת `PROPORTIONS` מכתיבה אורך, רוחב ויחס. |
| מסגור / vectorizer | `src/lib/vectorizer.ts` → `src/lib/geometry/frameCutouts.ts` | קנה מידה אחיד מתקבל **רק** אם הרוחב האחיד נופל בתוך `WIDTH_TOLERANCE` (5%) מהמוזמן; אחרת הרוחב נצמד למוזמן והפער נמתח אופקית (`stretch`). אותו קובץ רץ גם ב-`geometry-service` (Hetzner) וגם ב-`workers/frame`. |
| שפת המותג | `src/app/globals.css`, `src/app/layout.tsx` | טוקנים: porcelain / porcelain-slab / graphite / lapis / mist / ink60 / ink80. פונטים: Archivo (display) + Assistant (body). לוגו: `components/site/Wordmark`, `BrandMark`. נכסים: `bracelet-hero.webp`, `ring-hero.webp`, `hand-wrist.webp`, `hand-ring.webp`, ואיורי `PatternMark`. |

**מסקנה שקבעה את הארכיטקטורה:** התזמור של המסע אינו מסך — הוא 1,497 שורות של
טיפול במצבי קצה אמיתיים (ניתוק באמצע יצירה, חזרה מגוגל, Back, שכפול הזמנה).
שכפול שלו למסלול Story היה מייצר צינור שני שנשאר תואם רק בזכות משמעת. לכן Story
**נכנס לאותו תזמור** מאחורי דגל, ולא לצידו.

---

## 1. הארכיטקטורה שנבחרה

```
/story              ← דף בית חלופי (סטטי, שפת מותג קיימת)
   ↓ CTA
/story/create       ← מסך יצירה פשוט: מוצר · היקף · סיפור
   ↓ CTA "לתרגם את הסיפור שלי"
   ↓ (handoff ב-sessionStorage)
/design?story=1     ← המסע הקיים, במצב story: קופץ ישר ל-processing
   ↓
המשך זהה לחלוטין: תוצאה → סיכום → checkout → done
```

- **אין generator שני.** `/api/generate` הקיים, אותו פרומפט, אותו צינור.
- **אין עורך שני.** הקישור המשני ב-`/story/create` פותח את `/design` הקיים, על כל
  הפקדים שלו, עם prefill של מה שכבר מולא.
- **אין schema change ואין migration.** מצב Story נוסע בבקשה (`mode: "story"`),
  לא בעמודה.

---

## 2. קבצים חדשים

| קובץ | תפקיד |
| --- | --- |
| `STORY_FLOW_PLAN.md` | המסמך הזה. |
| `src/i18n/story.ts` | **כל** הקופי של הניסוי, בנפרד מ-`he.ts` — מחיקת הניסוי היא מחיקת הקובץ. |
| `src/app/(site)/story/page.tsx` | דף הבית החלופי (Server Component + metadata). |
| `src/app/(site)/story/create/page.tsx` | עטיפת metadata למסך היצירה. |
| `src/components/story/StoryHome.tsx` | ה-Hero, רצועת ארבעת השלבים וה-CTA. |
| `src/components/story/StoryExamples.tsx` | הדוגמה החיה: סיפור ↓ תרגום, מתחלפת בין 4 דוגמאות (Client). |
| `src/components/story/StoryCreate.tsx` | מסך היצירה: מוצר · היקף · סיפור · CTA · לינק לעורך (Client). |
| `src/lib/client/storyHandoff.ts` | העברת `{product, size, story}` מ-`/story/create` ל-`/design` (sessionStorage). |
| `src/lib/story/mode.ts` | שרת: `STORY_MODE`, `storyFrameDims()` — גזירת הרוחב מהיחס שהמודל צייר, בתוך טווח הייצור. |
| `src/lib/story/__tests__/storyFrame.test.ts` | טסטים: קנה מידה אחיד, צביטה לטווח, אי-פגיעה במסלול הקיים. |

---

## 3. קבצים קיימים שישונו — ולמה כל שינוי הכרחי

| קובץ | השינוי | למה |
| --- | --- | --- |
| `src/components/create/model.ts` | שדה `story: boolean` ב-`CreateState` + `false` ב-`INITIAL`. | הדגל חייב לנסוע עם המצב: `stashCreateState` שומר את כל ה-state בדרך לגוגל וחזרה, ובלעדיו מי שנדרשת להזדהות באמצע חוזרת למסלול הישן. |
| `src/app/(site)/design/page.tsx` | קריאת `?story=1` בכניסה (אותו אפקט שכבר מטפל ב-`?resume`/`?from`/`?designs`), ושליחת `mode` ליצירה ולבחירת הצעה. | זו נקודת החיבור היחידה בין המסלולים. בלי `story=1` בכתובת — התנהגות זהה לחלוטין לקודם. |
| `src/lib/client/api.ts` | `generate()` ו-`chooseCandidate()` מקבלים `mode?: "story"` אופציונלי. | להעביר את הדגל לשרת בלי לשנות אף חתימה קיימת. |
| `src/app/api/generate/route.ts` | `mode: z.enum(["story"]).optional()`; ב-story: מסגור כל מועמד למידות שנגזרו ממנו, עדכון רוחב העיצוב לזוכה, וטווח רוחב בפרומפט. | זהו הבידוד עצמו — כל הענף מאחורי `if (story)`. |
| `src/app/api/designs/[id]/choose/route.ts` | אותו `mode` אופציונלי; ב-story הדוגמה נמסגרת למידות של עצמה. | בלי זה מעבר להצעה אחרת היה מותח אותה לרוחב של ההצעה הזוכה — כלומר בדיוק העיוות שהמסלול בא למנוע. |
| `src/lib/llm/imagegen.ts` | פרמטר אחרון אופציונלי `widthRange?: [number, number]`; כשהוא קיים, פסקת `PROPORTIONS` אומרת אורך מדויק + טווח רוחב. | החלטת המוצר: אין רוחב קבוע — הרוחב הוא של העיצוב, בתוך טווח הייצור. בלי הפרמטר הפסקה נבנית בדיוק כמו היום. |
| `src/lib/db/designs.ts` | `updateDesignWidth()` חדש (UPDATE על עמודה קיימת). | כדי שהרוחב שנגזר יהיה מקור אמת אחד: הזמנה, תמחור, הדמיה ועריכה עתידית. אין עמודה חדשה ואין מיגרציה. |
| `src/lib/db/runs.ts` | שדה `mode?: "story"` אופציונלי ב-`RunInputs` (jsonb, בלי מיגרציה). | הניסוי נועד להימדד. בלי השדה הזה הרצת Story נראית ביומן זהה לכל הרצה אחרת, ואי אפשר להשוות בין המסלולים — לא בהצלחה, לא במתיחה ולא ברוחב שיצא. |
| `src/components/create/ResultScreen.tsx` | כשה-state ב-story — כותרת ומשפט מסגור אחרים. | §17: אותו מסך, מסגור טקסטואלי אחר. שתי שורות בתנאי. |
| `src/app/sitemap.ts` | הוספת `/story`. | לפי ההחלטה: מוסתר בניווט, פתוח לאינדוקס. |

**לא משתנים:** `src/app/(site)/page.tsx`, `SiteHeader`, `SiteFooter`, `robots.ts`,
`frameCutoutsDims`, `frameClient`, `workers/frame`, `geometry-service`,
`vectorizer.ts`, מסלול ההזמנה, `checkout`, ה-DB.

---

## 4. ההחלטות שנקבעו מראש (ולמה)

### 4.1 המידה
המשתמשת מזינה **היקף גוף** בלבד: היקף פרק היד או היקף האצבע. ההמרה לאורך פריסה
עוברת ב-`stripLengthMm()` הקיים, עם `fit: "regular"` (ברירת המחדל של המערכת) —
אין מודל מידות חדש, אין טווחים חדשים, ו-`sizeIssue()` הקיים הוא מי שחוסם מספר
שאינו מדידה. הסבר המדידה הוא `guideStepsBracelet`/`guideStepsRing` הקיימים.

### 4.2 הרוחב — אין בחירת רוחב, ואין גם רוחב קבוע
לפי ההחלטה: הרוחב אינו נבחר על ידי המשתמשת **ואינו קבוע מראש** — הוא של העיצוב,
בתוך **טווח הייצור המלא שכבר מוגדר במערכת** (`FAB.products[t].widthRangeMm`:
צמיד 5–80, טבעת 4–18). מה שקורה בפועל:

1. הרשומה נוצרת עם רוחב ברירת המחדל הקיים (18 / 6). הוא משמש **לתכנון בלבד** —
   בחירת הקנבס ומספר הפאנלים ב-`planRender`.
2. הפרומפט אומר אורך מדויק + טווח רוחב, ומשאיר את ההכרעה למודל.
3. אחרי הווקטוריזציה, הרוחב **נגזר** מהיחס שהמודל צייר בפועל, ונצבט לטווח.

### 4.3 יחס הצדדים — למה זה לא נוגע בקוד הגיאומטרי
`frameCutoutsDims` כבר לוקח קנה מידה **אחיד** כשהרוחב האחיד נמצא בתוך 5% מהמוזמן.
לכן ב-story אנחנו לא משנים אותו — אנחנו מוסרים לו רוחב מוזמן ש**שווה** לרוחב
האחיד:

```
uniform = drawnWidth × (orderedLength / drawnLength)
ordered = clamp(uniform, widthRange)      ← מה שנמסר למסגור
```

כשהערך בטווח: `uniform === ordered` → `stretch = 1.000`, אפס מתיחה, אפס עיוות.
כשהמודל צייר משהו קיצוני מחוץ לטווח: הצביטה מייצרת מתיחה מדודה ומדווחת, במקום
לחתוך פריט שאי אפשר לייצר.

**זה כל השינוי בהתנהגות הוקטור.** אין דגל שנוסע ל-geometry-service, אין שינוי
בקובץ הגיאומטריה, ולכן אין תלות ב-redeploy של הקופסה — ובעיקר: אין שום נתיב שבו
המסלול הקיים מקבל התנהגות אחרת.

### 4.4 מה נשאר של המסלול הישן
`/design` בלי `?story=1` אינו עובר באף אחד מהענפים האלה: `mode` לא נשלח,
`storyFrameDims` לא נקרא, `widthRange` לא מועבר לפרומפט, `ResultScreen` מציג את
הכותרת הקיימת. בורר הרוחב, ה-presets, המאפיינים והעורך — כולם במקומם.

---

## 5. איך מוחקים את הניסוי וחוזרים למצב הנוכחי

**מחיקה מלאה (אין מיגרציה להריץ, אין נתונים לנקות):**

```bash
rm -rf src/app/\(site\)/story src/components/story src/lib/story \
       src/lib/client/storyHandoff.ts src/i18n/story.ts STORY_FLOW_PLAN.md
```

ואז החזרת תשעת השינויים המסומנים בסעיף 3. כל אחד מהם מסומן בקוד בהערה
`story mode` כדי שאפשר יהיה לאתר אותם:

```bash
grep -rn "story mode" src/
```

**או, בקצרה:** כל הניסוי יושב על ענף אחד ואפשר להסיר אותו ב-`git revert` של
ה-merge commit. אין מצב ביניים שדורש טיפול: עיצובים שנוצרו במסלול Story הם
עיצובים רגילים לכל דבר — שורת `designs` עם אורך, רוחב, פער ועובי, וגרסאות
תקינות — והם ימשיכו להיפתח, להיערך ולהיות מוזמנים במסלול הרגיל גם אחרי שהניסוי
יימחק.

---

## 6. Definition of Done — לבדיקה בסיום

- [ ] `/story` — viewport אחד, מובייל ודסקטופ, בשפת המותג הקיימת.
- [ ] המסר Story → Translation → Choice → Jewelry מובן תוך שניות, בלי הסבר על AI.
- [ ] לפחות דוגמה ויזואלית אחת של סיפור → תכשיט (מתחלפת).
- [ ] `/story/create` — טבעת/צמיד, שדה היקף, textarea, CTA אחד ראשי, לינק משני לעורך, **בלי בורר רוחב**.
- [ ] היצירה רצה בצינור הקיים; הרוחב נגזר; היחס נשמר.
- [ ] `/`, `/design`, העורך ו-checkout — ללא שינוי התנהגות.
- [ ] lint · typecheck · tests · build עוברים.
