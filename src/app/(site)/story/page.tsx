import type { Metadata } from "next";
import { story } from "@/i18n/story";
import { he } from "@/i18n/he";
import { StoryHome } from "@/components/story/StoryHome";

// story mode — דף הבית החלופי של הניסוי (STORY_FLOW_PLAN.md).
//
// route נפרד לגמרי: `/` נשאר בדיוק כפי שהוא, וזהו העמוד היחיד שמכיר את המסלול
// הזה. מוסתר בניווט (אינו ב-NAV) ופתוח לאינדוקס — ההחלטה מתועדת בתוכנית §3.

export const metadata: Metadata = {
  title: `${story.home.metaTitle} — ${he.site.brand}`,
  description: story.home.metaDescription,
  alternates: { canonical: "/story" },
  openGraph: {
    title: story.home.metaTitle,
    description: story.home.metaDescription,
    url: "/story",
  },
};

export default function StoryPage() {
  return <StoryHome />;
}
