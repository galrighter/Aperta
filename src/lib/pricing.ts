import { FAB, type ProductType } from "./fabrication.config";

// תמחור (handoff §7) — מקום אחד, שני צדדים.
//
// עד עכשיו החישוב ישב ב-`src/components/create/model.ts`, כלומר בדפדפן בלבד,
// והשרת קיבל את `סה"כ` כמחרוזת בתוך גוף ההודעה. משמעות הדבר ששני דברים
// שנשמעים תיאורטיים היו נכונים בפועל: מה שנרשם כמחיר ההזמנה הוא מה שהדפדפן
// אמר (וכל מה שהדפדפן שולח אפשר לזייף), ושינוי מחירון היה משנה את המסך אבל לא
// את מה שנשמר בהזמנות קודמות. כאן החישוב טהור וחסר-מצב, המשפך והשרת קוראים
// לאותה פונקציה, וההזמנה נשמרת עם הפירוט שהשרת חישב.
//
// **כל מספר כאן כולל מע"מ** (החלטת גל, 29.7). זה לא ניסוח אלא מבנה: קודם
// המחירים היו נטו ו-17% נוספו מעליהם, ולכן "מחיר הצמיד" היה מספר שאיש לא רואה.
// עכשיו מה שכתוב הוא מה שמשלמים, והמע"מ נגזר **מתוך** הסכום (18/118) כשורת
// מידע — כפי שגם מחויב מול צרכן. הרווח הזה נבלע בכוונה: המחירים לא הועלו כדי
// לפצות על המעבר ל-18%.

export type Density = "low" | "medium" | "high";

export interface Price {
  /** צמיד/טבעת סטנדרטיים, כולל אריזה — לפני משלוח. כולל מע"מ. */
  base: number;
  /** תוספת על רוחב מעבר לסטנדרטי. */
  widthAdd: number;
  /** הפרש מהמורכבות הסטנדרטית (medium): שלילי בפשוטה, חיובי בצפופה. */
  complexity: number;
  shipping: number;
  /** מה שמשלמים. */
  total: number;
  /** המע"מ **הכלול** ב-total. שורת מידע, לא תוספת. */
  vat: number;
}

/** מחיר פריט סטנדרטי לפני משלוח, כולל מע"מ ואריזה. */
const BASE: Record<ProductType, number> = { bracelet: 399, ring: 299 };
export const SHIPPING = 35;

/** מע"מ בישראל מ-2025. הסכומים כוללים אותו — הוא נגזר מהם ולא מתווסף להם. */
export const TAX_RATE = 0.18;

/**
 * המורכבות הסטנדרטית היא `medium`, והיא כבר בתוך מחיר הבסיס. לכן מה שנשמר
 * כאן הוא **הפרש**: תבנית פשוטה זולה יותר, צפופה יקרה יותר. השמירה על היחסים
 * שהיו (0 / 45 / 110 בנטו) ולא על הסכומים — הסכומים נקבעו מחדש בבסיס.
 */
const COMPLEXITY_DELTA: Record<Density, number> = { low: -45, medium: 0, high: 65 };

/** תוספת לכל מ"מ מעבר לרוחב ברירת המחדל של המוצר. */
const PER_MM: Record<ProductType, number> = { bracelet: 5, ring: 14 };

/** המע"מ הכלול בסכום. */
export const vatIn = (grossTotal: number): number =>
  Math.round((grossTotal * TAX_RATE) / (1 + TAX_RATE));

export interface PriceInput {
  productType: ProductType;
  widthMm: number;
  density: Density;
}

export function priceFor({ productType, widthMm, density }: PriceInput): Price {
  const base = BASE[productType];
  const def = FAB.products[productType].defaultWidthMm;
  const widthAdd = Math.round(Math.max(0, widthMm - def) * PER_MM[productType]);
  const complexity = COMPLEXITY_DELTA[density];
  const total = base + widthAdd + complexity + SHIPPING;
  return { base, widthAdd, complexity, shipping: SHIPPING, total, vat: vatIn(total) };
}
