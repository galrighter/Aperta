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
//
// **למה `eslint-plugin-react-hooks@7` יושב ב-devDependencies בלי שאיש מייבא
// אותו כאן.** הוא לא מיותר, והוא לא ייבוא שנשכח: `FlatCompat` פותר שמות
// תוספים מתיקיית השורש, ולכן ה-`react-hooks` ש-`next/core-web-vitals` מבקש
// נפתר לגרסה שבשורש — ו-v7 מביאה איתה את כללי ה-React Compiler
// (`set-state-in-effect`, `refs`) בתוך `recommended`.
//
// זה החוב של `next@16` ששולם מראש. הכללים האלה מגיעים ממילא עם
// `eslint-config-next@16`, ובלעדיהם השדרוג נוחת בבת אחת עם major, עם עשרים
// שגיאות בקוד קיים, ועם `middleware`→`proxy` שנוגע בהפניית www ל-apex. כאן הם
// נאכפים על `next@15`, כך שלשדרוג עצמו נשארת רק החלפת הגרסה.
//
// והם שווים את זה גם אם `next@16` לעולם לא יקרה — אלה כללי **נכונות**, לא
// סגנון: שניהם מתארים כתיבה בשלב שבו React לא מבטיח שתיראה.
//
// הורדת הגרסה בשורש מכבה אותם בשקט, בלי ששורה כאן תשתנה.
//
// ---------------------------------------------------------------------------
// **מדיניות ה-`eslint-disable` על `set-state-in-effect`, ולמה יש כאלה בכלל.**
//
// מתוך עשרים ההפרות שהכללים חשפו, תשע תוקנו — ושלוש מהן היו באגים אמיתיים ולא
// רעש: רמז הגרירה לא נרשם לשינוי סוג המצביע, פס ההתקדמות נצבע פריים אחד עם
// ההתקדמות של ההרצה הקודמת, וטופס הזיהוי הבזיק את המייל של המשתמש הקודם.
//
// אחת-עשרה נותרו, וכולן מאותו סוג — ולא בגלל התרשלות: **הכלל מסמן את הקריאה
// לפונקציה שכותבת state, לא כתיבה סינכרונית.** `OrderDetail.load` ו-
// `AdminGate.check` פותחות ב-`await`, כלומר אין בהן שום כתיבה סינכרונית, והן
// מסומנות בדיוק כמו השאר. מכאן שאין שכתוב מקומי שמרצה אותו: מה שהוא מבקש הוא
// לא לטעון נתונים מתוך אפקט.
//
// זו החלטה ארכיטקטונית (שכבת נתונים — SWR/React Query, או טעינה בצד השרת),
// ולא ניקוי lint. עד שתתקבל, כל אתר נושא `eslint-disable-next-line` עם הסיבה
// שלו — כדי שהכלל יישאר דלוק על קוד חדש במקום להיכבות גורף על תיקייה.
// ---------------------------------------------------------------------------

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
