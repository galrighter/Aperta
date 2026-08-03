import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// עד כאן `npm run lint` לא רץ בכלל: לא היה קובץ קונפיג, והפקודה נעצרה על שאלה
// אינטראקטיבית. כלומר אף כלל לא נאכף, גם לא ב-CI, ו-`eslint-disable` שפזורים
// בקוד לא כיבו כלום.
//
// הבסיס הוא הקונפיג של Next (`core-web-vitals` + TypeScript), ולא אוסף כללי
// סגנון: מה שיש כאן לתפוס הוא באגים — תלות חסרה ב-hook, `<img>` במקום
// `next/image`, entity לא מוברח — ולא ויכוח על נקודה-פסיק. הפורמט ממילא אחיד.

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "geometry-service/dist/**",
      "vectorizer/**",
      "next-env.d.ts",
      // נתוני פונט מיוצרים — מערך אחד ענק, ו-espree נופל עליו על עומק המחסנית.
      // אין בו מה לבדוק: הוא לא נכתב ביד.
      "src/lib/text/fontData.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // משתנה שנזרק בכוונה מ-destructuring מסומן בקידומת קו תחתון. הכלל בלעדיו
      // מדווח על `const { images: _drop, ...rest }`, שהוא בדיוק הניסוח הנכון.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    // נקודת כניסה של Worker וקובץ קונפיג הם ליטרל מיוצא בהגדרה — זה מה
    // שהרצים שלהם מחפשים. לתת לו שם רק כדי לרצות כלל סגנון לא קונה כלום.
    files: ["workers/**/*.ts", "*.config.mjs", "*.config.ts"],
    rules: { "import/no-anonymous-default-export": "off" },
  },
];
