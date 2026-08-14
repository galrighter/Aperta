"use client";

// story mode — ההדמיה החיה בוויטרינה של דף הבית.
//
// **למה לא `create/RolledStage` כפי שהוא.** הוא עושה כמעט את אותו הדבר, אבל
// הוא רכיב של מסע היצירה: הגובה שלו הוא של מסך תוצאה, והוא נטען ברגע שהוא
// מורכב. בדף בית זה הבדל מהותי — three.js הוא הנכס הכבד באתר, ודף הבית אינו
// יכול לשלם עליו לפני שמישהי בכלל גללה עד הוויטרינה. לכן כאן יש שער נראוּת,
// והחלופה השטוחה היא מה שמוצג עד שהוא נפתח. זה גם שומר על §5 של התוכנית:
// הניסוי נמחק בלי לגעת במסלול הרגיל.
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { he } from "@/i18n/he";
import { FAB, type ProductType } from "@/lib/fabrication.config";
import { RolledPreview } from "@/components/create/Artwork";
import { useCoarsePointer } from "@/lib/client/useCoarsePointer";
import type { MultiPolygon } from "@/lib/geometry/types";

const Rolled3D = dynamic(() => import("@/components/Preview3D").then((m) => m.Rolled3D), {
  ssr: false,
});

/** מרחק ההקדמה: ההדמיה מתחילה להיטען מסך לפני שהיא נראית, כדי שהמעבר
 *  מהחלופה השטוחה יקרה מחוץ לשדה הראייה ולא מול העיניים. */
const PRELOAD_MARGIN = "300px";

export function ShowcaseStage({
  material, cutouts, lengthMm, widthMm, gapMm, product,
}: {
  material: MultiPolygon;
  cutouts: string;
  lengthMm: number;
  widthMm: number;
  gapMm: number;
  product: ProductType;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  /** האם להביא את three בכלל. נפתח פעם אחת ולא נסגר: הורדה של סצנה שכבר
   *  רצה בכל גלילה החוצה עולה יותר ממה שהיא חוסכת. */
  const [live, setLive] = useState(false);
  /** WebGL שלא נוצר, הקשר שאבד, או גאומטריה שנפלה — החלופה השטוחה, לא מסך ריק. */
  const [failed, setFailed] = useState(false);
  /** הפריים הראשון צויר. עד אליו החלופה השטוחה נשארת מעל הקנבס, כדי שהמעבר
   *  לא יעבור דרך ריבוע ריק. */
  const [drawn, setDrawn] = useState(false);
  const coarse = useCoarsePointer();

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // מי שביקשה פחות תנועה לא מקבלת סצנה שמסתובבת מעצמה — ולכן גם לא את
    // המשקל שלה. זו העדפת מערכת, והיא חלה על ההדמיה כולה ולא רק על הסיבוב.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // דפדפן בלי `IntersectionObserver` נשאר עם החלופה השטוחה. הוא ממילא לא
    // ייתן WebGL שווה ערך, והחלופה היא תצוגה מלאה של אותו עיצוב — לא חוסר.
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLive(true);
          io.disconnect();
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const showFlat = !live || failed || !drawn || material.length === 0;

  return (
    // הגובה קבוע כדי שהקנבס יהיה לו מה למדוד, ושהופעת ההדמיה לא תזיז את
    // העמוד. תחת תנועה מופחתת אין קנבס לעולם, ולכן אין מה לשמור: התיבה
    // מתכווצת לפריסה השטוחה במקום להשאיר סביבה חצי מסך ריק.
    <div ref={boxRef} className="relative h-[230px] w-full motion-reduce:h-auto sm:h-[260px]">
      {live && !failed && material.length > 0 && (
        <Rolled3D
          material={material}
          lengthMm={lengthMm}
          widthMm={widthMm}
          gapMm={gapMm}
          thicknessMm={FAB.defaultThicknessMm}
          productType={product}
          background={null}
          onUnavailable={() => setFailed(true)}
          onReady={() => setDrawn(true)}
        />
      )}
      {/* החלופה יושבת *מעל* הקנבס עד לפריים הראשון, ולא במקומו: החלפה של
          תת-עץ שלם ברגע שההדמיה מוכנה הייתה מפרקת ובונה מחדש את הקנבס. */}
      {showFlat && (
        <div className="absolute inset-0 flex items-center justify-center motion-reduce:static">
          <RolledPreview cutouts={cutouts} lengthMm={lengthMm} widthMm={widthMm} />
        </div>
      )}
      {!showFlat && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4">
          <span className="text-center text-[11px] text-mist">
            {coarse ? he.design.renderDragHintTouch : he.design.renderDragHint}
          </span>
        </div>
      )}
    </div>
  );
}
