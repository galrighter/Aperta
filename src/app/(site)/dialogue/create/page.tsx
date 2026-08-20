import type { Metadata } from "next";
import { dialogue } from "@/i18n/dialogue";
import { he } from "@/i18n/he";
import { DialogueCreate } from "@/components/dialogue/DialogueCreate";

// dialogue mode — מסך הראיון (שלב B ב-DIALOGUE_PLAN §3).
//
// `/design` הקיים אינו מושפע: המסך הזה מסתיים בכניסה אליו, עם תוצר הראיון
// ב-handoff — בדיוק כמו `/story/create`.

export const metadata: Metadata = {
  title: `${dialogue.create.metaTitle} — ${he.site.brand}`,
  description: dialogue.create.metaDescription,
  alternates: { canonical: "/dialogue/create" },
};

export default function DialogueCreatePage() {
  return <DialogueCreate />;
}
