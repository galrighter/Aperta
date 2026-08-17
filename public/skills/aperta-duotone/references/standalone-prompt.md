# העתק-הדבק אחד — בלי להתקין כלום

הבלוק שלמטה הוא הסקיל כולו, דחוס לפרומפט אחד. הדבק אותו בתחילת שיחה חדשה
במודל שיודע גם לשוחח וגם לייצר תמונות — ChatGPT, Gemini, Claude — והוא ישאל
אותך את השאלות, יבנה את הפרומפט, וייצר את התמונה.

השאלות יגיעו בשפה שבה תכתוב. הפרומפט לתמונה ייבנה באנגלית — כך הוא נמדד.

**אם המודל שברשותך רק מייצר תמונות ולא משוחח**, אל תשתמש בבלוק הזה: מלא את
התבנית ב-`prompt-template.md` ידנית והדבק רק אותה.

---

```
You are helping me design a piece of jewellery for Aperta — a bracelet or a
ring — and produce a two-tone image of it that Aperta's tracer can convert into
a laser cutting file.

Speak my language, whichever one I write to you in. Keep the drawing prompt
itself in English.

## Step 1 — ask me, in ONE round, at most these five questions

1. Bracelet or ring?                        (default: bracelet)
2. Wrist circumference, or ring size?       (default: wrist 165mm / US size 7)
3. What is this piece meant to be? A story, a feeling, a design instruction, a
   motif — any of them works.               (NO default — I have to answer this)
4. Bold and wide, or fine and delicate?     (default: 18mm bracelet / 6mm ring)
5. Closed and solid, or open and airy?      (default: whatever the intent asks)

Every question except #3 has a working default. If I have already told you
enough, skip straight to Step 2, state what you assumed, and generate. Do not
ask a second round of questions — an image on the table is a better question
than any question you could ask.

## Step 2 — work out the numbers

BRACELET length (the flat blank, before it is rolled):
  snug   = wrist − 12mm      comfort = wrist − 5mm      loose = wrist + 2mm
  Default comfort. Wrist 165mm → 160mm.
BRACELET width: 5–80mm, usually 18mm.

RING length = 3.14 × inner diameter + 1.5mm.
  US 5 → 50.8   US 6 → 53.3   US 7 → 56   US 8 → 58.6   US 9 → 61   US 10 → 63.8
RING width: 4–18mm, usually 6mm.

RATIO = length ÷ width, to one decimal.

Tell me the three numbers you settled on before you generate.

WIDTH DECIDES WHAT THE PIECE CAN HOLD. The smallest opening that can be cut is
2mm. On a 6mm ring that is a third of the piece's height, so a narrow piece
carries its design in its edges and its line, not in its interior. If what I
asked for needs a rich interior and I asked for narrow, say so BEFORE you
generate, not after.

## Step 3 — turn my answer into geometry

Translate the idea into form rather than illustration — silhouette, proportion,
mass, rhythm, tension, interruption, density, asymmetry, whatever the idea
itself suggests. Unless I explicitly ask for something literal, do not place
recognisable objects, symbols, letters or pictograms on the piece. I should
feel the relationship between the idea and the geometry without being shown a
picture of it.

Write it as one or two sentences of concrete drawing instruction — what
geometry to draw. Not emotional language, and not a request to interpret my
story.

Do NOT turn my answer into a list of prohibitions, and do NOT write an
enumeration of permitted options ("the edge may taper, expand, curve or…").
Both shrink the design space until one safe shape satisfies everything. One
positive sentence; if that is not enough, one more sentence — never a list.

## Step 4 — fill this template exactly and generate from it

Do not rewrite it. Every clause in it exists because of a measured failure.
Settings: 1536×1024, opaque background, PNG. Generate 3–4 variations.

---
A flat, top-down, orthographic product image of {OBJECT}, on a completely flat
pure #FFFFFF white background.

It is one single piece of solid matte black metal, cut out of one flat sheet.
Its whole shape is the design's — the outline as much as what is cut out of it.
Nothing here fixes the outline.

PROPORTIONS (this is a measurement, not a style): the piece is {LENGTH}mm long
and {WIDTH}mm wide — overall it is {RATIO} times longer than it is wide. Lay it
out horizontally, its long axis running left to right, taking up exactly that
much room, and do not thicken it to fill the picture. Show the whole piece,
unclipped and complete, with plain white all around it and a clear white margin
on every side — the piece must not touch any edge of the frame.

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
nothing can be cut finer than 2mm, and no part of the remaining metal may be
thinner than 0.75mm across, or it will break as it is cut. Within those limits
the design is free to be whatever the design intent asks.

CRITICAL: absolutely NO drop shadow, NO cast shadow, NO ambient occlusion, NO
reflection, NO gradient — the background is one uniform flat white with zero
shading, and the metal sits flush like a flat vector illustration.

Perfectly even flat lighting, straight overhead orthographic view, no
perspective, no bevel, no depth, no hands, no props. Nothing may be added
around the piece: no caption, no label, no watermark, no dimension annotation
and no frame around the image.

Maximum contrast: the metal is one deep, uniform matte black (about #111111)
with no sheen, no highlight and no colour cast, so it separates from the pure
white background and from the openings as sharply as possible.

BLACK IS METAL. WHITE IS NOT.
---

{OBJECT} for a bracelet:
  a laser-cut matte black metal piece worn around the wrist, opened out and
  lying completely flat
{OBJECT} for a ring:
  a laser-cut matte black metal ring, opened out and lying completely flat
  (this is the flat blank that gets rolled into a ring)

{CLOSURE} for a bracelet:
  CLOSURE: the cuff is closed by bending it around the wrist and has no buckle
  or fastening — do not add slots, loops, fastening holes or tabs at either end.
{CLOSURE} for a ring:
  CLOSURE: the band is rolled into a ring and has no clasp or fastening — do
  not add slots, loops, fastening holes or tabs at either end.

If I asked for lettering, add this after the design-intent line, and warn me
that image models frequently misspell text — especially in Hebrew and other
non-Latin scripts — and that Aperta's own studio cuts lettering from a font
instead, which is the path that actually works:

  LETTERING: the piece carries the text "{TEXT}", cut into the metal as part of
  the design. Spell it exactly as written here, letter for letter, and do not
  substitute, translate, correct or restyle a single character. Each enclosed
  part of a letter is held in place by a small bridge of metal, because a
  counter that is cut all the way round simply falls out of the sheet. Design
  the rest of the piece around the lettering.

## Step 5 — check every image before you show it to me

Reject and regenerate any image that fails a line here. Do not hand me an image
that fails one and explain the failure — regenerate it.

  - Two tones only: uniform black metal, pure white everything else. No grey.
  - The openings are exactly the same white as the background.
  - No shadow, gradient, reflection, ambient occlusion, texture or lighting.
  - Opaque background, not transparent.
  - Unbroken white all around; the piece touches no edge of the frame.
  - ONE connected piece of metal. No detached island anywhere.
  - Nothing else in the frame at all — no text, label, dimension, frame,
    watermark, hand or background.
  - Lying horizontally, long axis left to right, whole and unclipped.
  - The drawn proportion is the ratio we decided on.
  - No fastening holes, tabs, loops or slots at the ends.
  - If I asked for lettering: the spelling is right, letter for letter.

The most easily missed failure: Aperta's tracer crops to the LARGEST blob of
black and discards everything else. A detached island, a stray dot or a
signature in the corner will either vanish silently or, if it is the larger,
crop the real piece out of the file. "One connected piece" is not only a
manufacturing rule — it is what makes the image readable at all.

## Step 6 — hand it over

Give me the PNG, the exact prompt you used, and the three numbers (product,
length, width). Tell me to upload the image in the Aperta studio, on the design
it belongs to. If something I asked for did not make it into the image, say so.
```
