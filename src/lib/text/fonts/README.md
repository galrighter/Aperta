# מאגר הפונטים

הפונטים כאן משרתים את הכיתוב על התכשיט: הם נחתכים לנתיבים בשרת
(`src/lib/text/stencil.ts`), מצוירים כפתחים בפס, ונמסרים למודל התמונה
כתמונת ייחוס. הם **אינם** נטענים בדפדפן ואינם חלק מהעיצוב הגרפי של האתר.

הנימוקים המלאים — למה יותר מפונט אחד, ואיך נבחרת הטיפוגרפיה מהבריף:
`docs/research/HEBREW_TEXT_LETTERING_FIELD.md`.

## רישיון

כולם OFL 1.1. זכויות היוצרים ונוסח הרישיון: `OFL.md` שלצד הקובץ הזה.

## איך נוצרו הקבצים

כל `.ts` כאן הוא base64 של TTF **מסובסט** — עברית כולל סופיות, לטינית,
ספרות ופיסוק בלבד. הסבסוט מוריד קובץ טיפוסי מ-44–175KB ל-8–20KB, וזו הסיבה
שאפשר להחזיק שמונה מהם ב-Worker. Secular One (`secular.ts`) הוא היחיד שאינו
מסובסט — הוא היה כאן קודם (`../fontData.ts`) ולא נגענו בו.

לשחזור או להוספת פנים:

```bash
# 1) הורדה מ-Google Fonts (User-Agent ישן מחזיר TTF ולא woff2)
curl -H "User-Agent: Mozilla/4.0" "https://fonts.googleapis.com/css2?family=Heebo"
#    → כתובת ה-.ttf, ואותה מורידים

# 2) סבסוט
pip install fonttools
python3 - <<'PY'
from fontTools import subset
HEB = "".join(chr(c) for c in range(0x05D0, 0x05EB))
LAT = "".join(chr(c) for c in range(0x41, 0x5B)) + "".join(chr(c) for c in range(0x61, 0x7B))
DIG = "".join(chr(c) for c in range(0x30, 0x3A))
PUN = " .,'\"-()!?&/:׳״"
subset.main(["Heebo.ttf", f"--text={HEB+LAT+DIG+PUN}", "--output-file=sub/Heebo.ttf",
             "--layout-features=kern", "--no-hinting", "--desubroutinize",
             "--drop-tables+=GSUB,GPOS,DSIG,FFTM", "--name-IDs=*", "--recalc-bounds"])
PY

# 3) base64 → קובץ .ts עם `export const DATA`, ורישום ב-index.ts
```

## מה לבדוק בפנים חדשות

1. **כיסוי cmap** — עברית כולל ךםןףץ, לטינית, ספרות, פיסוק.
2. **שהאותיות שורדות את החיתוך.** האותיות הן פתחים, ופתח צר מ-minHole נמחק
   בקופסה. פנים דקות מדי לא נחתכות דקות — הן פשוט לא נחתכות. כך נפסל
   Amatic SC.
3. **שהגישור לא הופך אות לאות אחרת.** הטסט
   `src/lib/render/__tests__/letteringImage.test.ts` מריץ V2/V3 על
   `מםעסטד` בכל הפנים; לקריאוּת עצמה צריך עין.
