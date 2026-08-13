import type { Metadata } from "next";
import { story } from "@/i18n/story";
import { he } from "@/i18n/he";
import { StoryCreate } from "@/components/story/StoryCreate";

// story mode — מסך היצירה של המסלול הפשוט (STORY_FLOW_PLAN.md §7).
//
// `/design` הקיים אינו מושפע: הוא ממשיך להיות המסע המלא על כל מסכיו, וזהו
// מסך נפרד שמסתיים בכניסה אליו.

export const metadata: Metadata = {
  title: `${story.create.metaTitle} — ${he.site.brand}`,
  description: story.create.metaDescription,
  alternates: { canonical: "/story/create" },
};

export default function StoryCreatePage() {
  return <StoryCreate />;
}
