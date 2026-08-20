import type { Metadata } from "next";
import { dialogue } from "@/i18n/dialogue";
import { he } from "@/i18n/he";
import { DialogueHome } from "@/components/dialogue/DialogueHome";

// dialogue mode — דף הבית החלופי של המסלול (A2 ב-DIALOGUE_PLAN §7).
//
// `/design` הקיים אינו מושפע: זהו דף מקביל, כמו `/story`, והכניסה למסע היא
// דרך `/dialogue/create` בלבד.

export const metadata: Metadata = {
  title: `${dialogue.home.metaTitle} — ${he.site.brand}`,
  description: dialogue.home.metaDescription,
  alternates: { canonical: "/dialogue" },
};

export default function DialogueHomePage() {
  return <DialogueHome />;
}
