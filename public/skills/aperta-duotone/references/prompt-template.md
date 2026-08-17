# התבנית — הפרומפט למודל התמונה

הנוסח כאן הוא זה שהצינור של Aperta משתמש בו בעצמו, מותאם לפריט אחד בתמונה.
כל סעיף בו קיים בגלל כשל שנמדד. **מלא את החורים, אל תשכתב.**

הפרומפט באנגלית בכוונה — כך הוא נמדד, וכך מודלי תמונה מדויקים יותר.

---

## החורים

| חור | מה נכנס | מאיפה |
| --- | --- | --- |
| `{OBJECT}` | הניסוח למוצר | הטבלה שמתחת לתבנית |
| `{LENGTH_MM}` | אורך הפריסה | `tracer-contract.md` §3 |
| `{WIDTH_MM}` | רוחב הפריט | `tracer-contract.md` §3 |
| `{RATIO}` | `LENGTH ÷ WIDTH`, ספרה אחת | חשב |
| `{INTENT}` | הכוונה, במשפט או שניים | מהשיחה |
| `{CLOSURE}` | הניסוח לסגירה | הטבלה שמתחת לתבנית |
| `{MIN_HOLE}` | 2 בפליז 1.5 מ״מ | `tracer-contract.md` §4 |
| `{MIN_METAL}` | 0.75 בפליז 1.5 מ״מ | `tracer-contract.md` §4 |

---

## התבנית

```
A flat, top-down, orthographic product image of {OBJECT}, on a completely flat
pure #FFFFFF white background.

It is one single piece of solid matte black metal, cut out of one flat sheet.
Its whole shape is the design's — the outline as much as what is cut out of it.
Nothing here fixes the outline.

PROPORTIONS (this is a measurement, not a style): the piece is {LENGTH_MM}mm
long and {WIDTH_MM}mm wide — overall it is {RATIO} times longer than it is
wide. Lay it out horizontally, its long axis running left to right, taking up
exactly that much room, and do not thicken it to fill the picture. Show the
whole piece, unclipped and complete, with plain white all around it and a clear
white margin on every side — the piece must not touch any edge of the frame.

THE OUTER EDGE IS PART OF THE DESIGN, not a given frame: it rises and falls,
narrows and swells, tapers or scallops along the length exactly as the design
intent asks.

Design intent for the piece: {INTENT}.

{CLOSURE} The ends themselves may be rounded, pointed or shaped as the design
asks — what they may not carry is fastening hardware.

Wherever the metal is cut away — inside the piece and along its edges alike —
the same pure white background shows through.

MANUFACTURING (physical constraint): the piece is cut from one sheet of 1.5mm
metal with a laser, so all the metal must remain a single connected piece —
every part of the metal is joined to the rest, with no detached island that
would simply fall out of the sheet once the cutting is done. At this scale
nothing can be cut finer than {MIN_HOLE}mm, and no part of the remaining metal
may be thinner than {MIN_METAL}mm across, or it will break as it is cut. Within
those limits the design is free to be whatever the design intent asks.

CRITICAL: absolutely NO drop shadow, NO cast shadow, NO ambient occlusion, NO
reflection, NO gradient — the background is one uniform flat white with zero
shading, and the metal sits flush like a flat vector illustration.

Perfectly even flat lighting, straight overhead orthographic view, no
perspective, no bevel, no depth, no hands, no props. Nothing may be added around
the piece: no caption, no label, no watermark, no dimension annotation and no
frame around the image.

Maximum contrast: the metal is one deep, uniform matte black (about #111111)
with no sheen, no highlight and no colour cast, so it separates from the pure
white background and from the openings as sharply as possible.

BLACK IS METAL. WHITE IS NOT.
```

### `{OBJECT}` ו-`{CLOSURE}`

| מוצר | `{OBJECT}` | `{CLOSURE}` |
| --- | --- | --- |
| צמיד | `a laser-cut matte black metal piece worn around the wrist, opened out and lying completely flat` | `CLOSURE: the cuff is closed by bending it around the wrist and has no buckle or fastening — do not add slots, loops, fastening holes or tabs at either end.` |
| טבעת | `a laser-cut matte black metal ring, opened out and lying completely flat (this is the flat blank that gets rolled into a ring)` | `CLOSURE: the band is rolled into a ring and has no clasp or fastening — do not add slots, loops, fastening holes or tabs at either end.` |

### הגדרות הקריאה

**‏1536×1024 · רקע אטום · PNG.** בקש 3–4 וריאציות של אותו פרומפט; הבחירה
ביניהן היא חצי מהעבודה.

---

## בלוקים נוספים — רק כשהם רלוונטיים

### כיתוב

הוסף אחרי שורת ה-`Design intent`:

```
LETTERING: the piece carries the text "{TEXT}", cut into the metal as part of
the design. Spell it exactly as written here, letter for letter, and do not
substitute, translate, correct or restyle a single character. Each enclosed
part of a letter is held in place by a small bridge of metal, because a
counter that is cut all the way round simply falls out of the sheet. Design
the rest of the piece around the lettering.
```

⚠ **האיות הוא מה שנחתך.** אין שלב שמתקן אותו אחר כך. מודלי תמונה "מתקנים"
קלט שנראה להם שגוי, וכותבים טקסט משלהם — בדוק אות אות בתמונה שחזרה, ואם היא
לא נכונה, אל תנסה לתקן בפרומפט אלא הרץ שוב. בעברית, ובכל שפה שאינה אנגלית,
זה נכשל לעיתים קרובות; זה מקרה שכדאי להשאיר לסטודיו של Aperta, שחותך את
האותיות מהפונט ולא מהמודל.

### תמונת ייחוס

כשמצרפים תמונה — השראה או עיצוב קיים לשינוי — הוסף אחרי שורת ה-`Design
intent`:

```
The attached image is {inspiration for the feeling and the visual language,
not a thing to copy | the CURRENT piece being edited}.
```

ולעריכה, החלף את שורת ה-`Design intent` כולה ב:

```
CHANGE REQUEST (apply only this): {CHANGE}.

The attached image is the CURRENT piece — the one being edited. Keep it: its
outline, its proportions and its whole cut pattern stay exactly as they are in
the attached image, and only what the change request above asks for changes.
Anything the request does not mention stays identical to the attached image.
This is an edit of an existing design, not a new design.
```

**הסדר הוא ההוראה** — קודם מה לשנות, ואז מה לשמר. הפוך, המודל קורא "אל תיגע
בצללית" לפני שהוא קורא שביקשו קצה גלי, ומציית לראשון.

בעריכה **השמט** את שורת `THE OUTER EDGE IS PART OF THE DESIGN` — היא סותרת את
השימור.

---

## דוגמאות מלאות

### א׳ · סיפור

> "סבתא שלי הייתה תופרת. אני רוצה משהו שמזכיר את זה בלי שיהיה מספריים."

**מידות:** צמיד, פרק יד 160 מ״מ, comfort ⟶ אורך 155 · רוחב 14 · יחס 11.1

```
Design intent for the piece: a continuous fine line that runs the length of
the piece in the rhythm of a running stitch — long solid passages interrupted
by short, evenly spaced breaks, the breaks tightening where the line changes
direction. The line is the structure, not decoration on top of one, and the
open space its path leaves behind is part of the design.
```

הכוונה תורגמה לצורה, לא לאיור. "תפירה" הפכה לקצב של קו שנקטע — לא למספריים,
לא למחט, לא לחוט מצויר.

### ב׳ · הוראת עיצוב

> "משהו גיאומטרי וחד, לא מעוגל. רחב."

**מידות:** צמיד, פרק יד 170 מ״מ, comfort ⟶ אורך 165 · רוחב 32 · יחס 5.2

```
Design intent for the piece: angular throughout — every edge is a straight
segment meeting another at a definite corner, with nothing rounded anywhere in
the piece. The outer contour steps and folds along the length rather than
running parallel, and the metal is cut away in faceted planes that leave the
remaining structure reading as a folded plate.
```

### ג׳ · מוטיב

> "גלים."

**מידות:** טבעת, מידה 7 ⟶ אורך 56 · רוחב 6 · יחס 9.3

```
Design intent for the piece: the metal narrows and swells along the band in a
slow, uneven swell, thickest at one point and drawn thin at two others, with
the upper and lower edges moving out of step with each other so the band never
reads as symmetrical. At this width the movement lives entirely in the edges
and in the varying thickness of the band, not in anything cut out of its
interior.
```

טבעת ברוחב 6 מ״מ אינה יכולה לשאת פתחים — פתח מינימלי הוא שליש מגובה הפריט.
לכן הכוונה נכתבה מראש כעיצוב שגר בקצוות. זה בדיוק המקום שבו הרוחב מכתיב את
העיצוב, וכדאי לומר את זה לאדם לפני שמייצרים.
