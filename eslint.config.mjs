import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// עד כאן `npm run lint` לא רץ בכלל: לא היה קובץ קונפיג, והפקודה נעצרה על שאלה
// אינטראקטיבית. כלומר אף כלל לא נאכף, גם לא ב-CI, ו-`eslint-disable` שפזורים
// בקוד לא כיבו כלום.
//
// הבסיס הוא הקונפיג של Next (`core-web-vitals` + TypeScript), ולא אוסף כללי
// סגנון: מה שיש כאן לתפוס הוא באגים — תלות חסרה ב-hook, `<img>` במקום
// `next/image`, entity לא מוברח — ולא ויכוח על נקודה-פסיק. הפורמט ממילא אחיד.
//
// **הייבוא ישיר ולא דרך `FlatCompat`.** `eslint-config-next@16` הוא כבר flat
// config, ו-`FlatCompat` נועד לעטוף קונפיגים בפורמט הישן — הזנת קונפיג פלאט
// לתוכו מתפוצצת ב-`Converting circular structure to JSON`. זה היה הדבר היחיד
// ששבר את `npm run lint` בשדרוג ל-16.
//
// כללי ה-React Compiler (`set-state-in-effect`, `refs`) מגיעים עכשיו מכאן,
// מ-`eslint-config-next` עצמו. `eslint-plugin-react-hooks@7` נשאר ב-
// devDependencies כתלות ישירה מוצהרת: הוא זה שמספק את הכללים בפועל, והוא היה
// מותקן ממילא כדי לאכוף אותם על `next@15` לפני השדרוג.
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
  ...nextCoreWebVitals,
  ...nextTypescript,
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
