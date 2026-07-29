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
// רוחב ברירת המחדל נלקח מ-`fabrication.config` ולא נכתב שוב: הוא כבר מוגדר שם
// לכל מוצר, ושני מספרים שאמורים להיות שווים הם שני מספרים שיתפצלו.

export type Density = "low" | "medium" | "high";

export interface Price {
  base: number;
  widthAdd: number;
  complexity: number;
  packaging: number;
  shipping: number;
  tax: number;
  total: number;
}

export const PACKAGING = 25;
export const SHIPPING = 35;

/**
 * מע"מ. **מסומן כפער פתוח** ב-docs/TODO.md C5: השיעור בישראל עלה ל-18% ב-2025,
 * והמספר כאן לא עודכן. הוא נשאר 0.17 בכוונה עד שגל יאמת מול רואה החשבון —
 * שינוי שקט של שיעור מס הוא לא תיקון קוד, הוא החלטה עסקית — אבל מרגע שהוא
 * במקום אחד, השינוי הוא שורה אחת ולא חיפוש.
 */
export const TAX_RATE = 0.17;

const COMPLEXITY: Record<Density, number> = { low: 0, medium: 45, high: 110 };
const BASE: Record<ProductType, number> = { bracelet: 320, ring: 240 };
/** תוספת לכל מ"מ מעבר לרוחב ברירת המחדל של המוצר. */
const PER_MM: Record<ProductType, number> = { bracelet: 5, ring: 14 };

export interface PriceInput {
  productType: ProductType;
  widthMm: number;
  density: Density;
}

export function priceFor({ productType, widthMm, density }: PriceInput): Price {
  const base = BASE[productType];
  const def = FAB.products[productType].defaultWidthMm;
  const widthAdd = Math.round(Math.max(0, widthMm - def) * PER_MM[productType]);
  const complexity = COMPLEXITY[density];
  const subtotal = base + widthAdd + complexity;
  const tax = Math.round((subtotal + PACKAGING + SHIPPING) * TAX_RATE);
  return {
    base,
    widthAdd,
    complexity,
    packaging: PACKAGING,
    shipping: SHIPPING,
    tax,
    total: subtotal + PACKAGING + SHIPPING + tax,
  };
}
