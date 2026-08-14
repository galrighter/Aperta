import type { Product } from "@/components/create/model";

// story mode — מה חוסם את הכפתור במסך היצירה, כפונקציה טהורה.
//
// **למה זה יושב כאן ולא בתוך הרכיב.** לחיצה על "לתרגם את הסיפור שלי" שלא
// עושה כלום היא באג שקט: הטופס פשוט מפסיק, בלי הודעה ובלי שינוי על המסך.
// הדרך שלא לחזור אליו היא ששאלת "מה חסר" תהיה מקום אחד — כזה שגם המסך וגם
// המבחן שואלים אותו, ולא שני מקומות שאפשר להוסיף שדה לאחד מהם ולשכוח את השני.

export type StoryCreateBlocker = "product" | "story";

export interface StoryCreateInput {
  product: Product | null;
  story: string;
}

/**
 * מה שחסר כדי להריץ — **לפי סדר המסך**, כי הראשון ברשימה הוא מה שהמיקוד קופץ
 * אליו. רשימה ריקה = אפשר לשלוח.
 */
export function storyCreateBlockers({ product, story }: StoryCreateInput): StoryCreateBlocker[] {
  const blockers: StoryCreateBlocker[] = [];
  if (!product) blockers.push("product");
  if (!story.trim()) blockers.push("story");
  return blockers;
}
