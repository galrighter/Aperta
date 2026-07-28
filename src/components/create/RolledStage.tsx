"use client";

// ההדמיה במסע היצירה: הצמיד מעורגל בתלת-ממד וניתן לסובב אותו — אותה הדמיה
// שהסטודיו מציג, מוזנת מהגאומטריה של הגרסה הפעילה.
// אם אין גאומטריה (גרסה שחזרה בלי material) נופלים לתצוגה השטוחה עם גרדיאנט
// של הפליז, כדי שלעולם לא יוצג מסך ריק במקום המוצר.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { he } from "@/i18n/he";
import { FAB } from "@/lib/fabrication.config";
import { RolledPreview } from "./Artwork";
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
  // במסך מגע קנבס שתופס גרירה חוסם את גלילת העמוד. עד נגיעה ראשונה השליטה
  // כבויה ושכבה שקופה מעליה מעבירה את הגלילה הלאה; הסיבוב האוטומטי רץ בכל מקרה.
  const [coarse, setCoarse] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  if (!material || material.length === 0) {
    return <RolledPreview cutouts={cutouts} lengthMm={lengthMm} widthMm={widthMm} />;
  }

  const gated = coarse && !active;

  return (
    <div className="relative h-[320px] w-full sm:h-[440px]">
      <Rolled3D
        material={material}
        lengthMm={lengthMm}
        widthMm={widthMm}
        gapMm={gapMm}
        thicknessMm={FAB.defaultThicknessMm}
        background={null}
        enabled={!gated}
      />
      {gated ? (
        <button
          type="button"
          onClick={() => setActive(true)}
          className="absolute inset-0 flex items-end justify-center pb-4"
        >
          <span className="bg-porcelain/85 px-3 py-1.5 text-[12px] text-ink60">
            {d.renderTapToRotate}
          </span>
        </button>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <span className="bg-porcelain/70 px-3 py-1.5 text-[12px] text-ink60">
            {d.renderDragHint}
          </span>
        </div>
      )}
    </div>
  );
}
