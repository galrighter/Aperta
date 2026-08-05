"use client";

// ההדמיה במסע היצירה: התכשיט מעורגל בתלת-ממד וניתן לסובב אותו — אותה הדמיה
// שהסטודיו מציג, מוזנת מהגאומטריה של הגרסה הפעילה.
// אם אין גאומטריה (גרסה שחזרה בלי material) נופלים לתצוגה השטוחה עם גרדיאנט
// של הפליז, כדי שלעולם לא יוצג מסך ריק במקום המוצר.
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { he } from "@/i18n/he";
import { FAB } from "@/lib/fabrication.config";
import { RolledPreview } from "./Artwork";
import { useCoarsePointer } from "@/lib/client/useCoarsePointer";
import type { MultiPolygon } from "@/lib/geometry/types";

const d = he.design;

// three נטען רק בקליינט ורק כשמסך התוצאה מוצג במצב הדמיה.
const Rolled3D = dynamic(() => import("@/components/Preview3D").then((m) => m.Rolled3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-mist">{he.loading}</div>
  ),
});

export function RolledStage({
  material, cutouts, lengthMm, widthMm, gapMm,
}: {
  material: MultiPolygon | null;
  cutouts: string;
  lengthMm: number;
  widthMm: number;
  gapMm: number;
}) {
  /**
   * הסיבוב פעיל מהרגע הראשון.
   *
   * קודם היה כאן שער: במסך מגע השליטה הייתה כבויה עד לחיצה על "לגעת כדי
   * לסובב", כדי שגרירה על הקנבס לא תחסום את גלילת העמוד. המחיר היה שהדבר
   * הראשון שהלקוחה רוצה לעשות עם התוצאה — לסובב אותה — דרש קליק שלא הסביר
   * את עצמו. הפתרון נמצא במקום הנכון: `touch-action: pan-y` על הקנבס (ראה
   * Preview3D), שמשאיר את הגלילה האנכית לדפדפן ואת הגרירה הצידה לסיבוב.
   * הרמז מתחלף לפי סוג המצביע — במגע ובעכבר לא עושים את אותה תנועה.
   */
  const coarse = useCoarsePointer();
  /**
   * הדפדפן לא נתן WebGL. קורה בכרום באנדרואיד עם הרבה לשוניות פתוחות, ובלי
   * האצת חומרה — ועד שההדמיה למדה ליפול חיננית זה הפיל את העמוד כולו. אותה
   * חלופה כמו גרסה בלי material: הפריסה עם גוון הפליז, ולא מסך ריק.
   */
  const [no3d, setNo3d] = useState(false);
  const on3dUnavailable = useCallback(() => setNo3d(true), []);

  if (no3d || !material || material.length === 0) {
    return <RolledPreview cutouts={cutouts} lengthMm={lengthMm} widthMm={widthMm} />;
  }

  return (
    <div className="relative h-[320px] w-full sm:h-[440px]">
      <Rolled3D
        material={material}
        lengthMm={lengthMm}
        widthMm={widthMm}
        gapMm={gapMm}
        thicknessMm={FAB.defaultThicknessMm}
        background={null}
        onUnavailable={on3dUnavailable}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
        <span className="bg-porcelain/70 px-3 py-1.5 text-center text-[12px] text-ink60">
          {coarse ? d.renderDragHintTouch : d.renderDragHint}
        </span>
      </div>
    </div>
  );
}
