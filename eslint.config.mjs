import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

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
      // dialogue mode — תוצר הביניים של npm run gallery:export (באנדל esbuild).
      "scripts/dist/**",
      "vectorizer/**",
      "next-env.d.ts",
      // נתוני פונט מיוצרים — מערך אחד ענק, ו-espree נופל עליו על עומק המחסנית.
      // אין בו מה לבדוק: הוא לא נכתב ביד.
      "src/lib/text/fontData.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // ---------------------------------------------------------------------------
  // נגישות בזמן כתיבה. `eslint-config-next` כולל שישה כללי jsx-a11y בלבד (בעיקר
  // `alt-text` ותקינות ARIA); ה-recommended המלא מוסיף את מה שתפס בפועל את
  // הליקויים בסקירת אוגוסט — אלמנט לא-אינטראקטיבי שנושא `onClick` בלי מקבילה
  // במקלדת, ותווית שאינה מקושרת לשדה (docs/ACCESSIBILITY_PLAN.md §B7, §B8).
  //
  // זו השכבה הזולה מבין השתיים: `npm run test:a11y` סורק את התוצאה ותופס גם
  // ניגודיות ו-landmarks, אבל הוא דורש בילד ודפדפן ורץ ב-CI בלבד. הכללים כאן
  // עולים אפס ורצים בעורך תוך כדי כתיבה, כלומר תופסים לפני הקומיט.
  //
  // **הכללים בלבד, בלי `plugins`.** `eslint-config-next` כבר רושם את
  // `jsx-a11y` בעצמו, ורישום שני של אותו שם נופל על
  // `Cannot redefine plugin "jsx-a11y"`. פריסת `flatConfigs.recommended`
  // המלא נושאת את מפתח ה-`plugins` ולכן אינה אפשרית כאן.
  { rules: jsxA11y.flatConfigs.recommended.rules },
  {
    rules: {
      // `role="region"` + `tabIndex={0}` על מכל שגולל אופקית — הכלל הזה
      // והכלל `scrollable-region-focusable` של axe סותרים זה את זה ישירות,
      // ו-axe צודק: אזור שגולל ואין בתוכו אלמנט ממוקד אינו נגיש במקלדת בלי
      // tabindex. זו הצורה שה-WAI מגדיר לתבנית הזו. `tabpanel` הוא ברירת
      // המחדל של הכלל, ו-`region` מצטרף אליו מאותו נימוק בדיוק.
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { tags: [], roles: ["tabpanel", "region"], allowExpressionValues: true },
      ],
      // `<label>` שעוטף `<input>` ואת הטקסט בתוך `<span><span>` — הקישור תקין
      // לחלוטין, פשוט עמוק בשתי רמות מברירת המחדל של הכלל.
      "jsx-a11y/label-has-associated-control": ["error", { depth: 3 }],
    },
  },
  {
    // ===== רקע של חלון קופץ שנסגר בלחיצה =====
    //
    // התבנית בכל הקבצים האלה זהה: `<div className="fixed inset-0" onClick=…>`
    // שסוגר את החלון, ומעליו מכל התוכן עם `stopPropagation`. הכללים מבקשים
    // מאזין מקלדת על אותו `<div>` — ומאזין כזה חסר משמעות: אין דבר כזה
    // "להקיש Enter על הרקע".
    //
    // **המקבילה במקלדת קיימת, והיא Escape.** `useDialog` רושם אותה ברמת
    // ה-window, מכניס את המיקוד לחלון, כולא אותו בפנים ומחזיר אותו לפותח.
    // כלומר אין כאן פונקציונליות שאבודה למי שאינו בעכבר — יש דפוס שהכלל אינו
    // יודע לזהות. הכיבוי מצומצם לקבצים שבהם התבנית הזו יושבת, כדי שהכללים
    // יישארו דלוקים על כל השאר.
    files: [
      "src/components/Modal.tsx",
      "src/components/DesignsDrawer.tsx",
      "src/components/create/ui.tsx",
      "src/components/site/DesignReadyWatch.tsx",
      "src/components/admin/StatusMoveDialog.tsx",
      "src/components/admin/RunsLog.tsx",
    ],
    rules: {
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
    },
  },
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
