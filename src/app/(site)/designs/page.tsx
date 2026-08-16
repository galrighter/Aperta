import type { Metadata } from "next";
import { he } from "@/i18n/he";
import { MyDesignsPage } from "@/components/designs/MyDesignsPage";

const s = he.site;

// "העיצובים שלי" — דף בפני עצמו. הרשימה שבתוך המשפך (`SavedDesigns`) נשארת
// להמשך-מסע; זה העמוד שמנהלים בו: כל העיצובים, מיון, וכניסה חזרה לעריכה.
export const metadata: Metadata = {
  title: `${s.designsTitle} — ${s.brand}`,
  description: s.designsMetaDescription,
  // עמוד אישי — התוכן שלו הוא של מי שמחוברת, ואין מה לאנדקס בו.
  robots: { index: false },
};

export default function DesignsPage() {
  return <MyDesignsPage />;
}
