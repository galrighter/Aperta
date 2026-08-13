"use client";

// התכשיט בדף השיתוף: הדמיה מעורגלת שאפשר לסובב, או הפריסה השטוחה.
//
// שני הבדלים מ-`RolledStage` של מסע היצירה, ושניהם נובעים מכך שמי שמגיע לכאן
// לא ביקש כלום:
//
// 1. **הפריסה קודמת בטעינה, לא ההדמיה.** three.js הוא כ-600KB, והדף נפתח
//    ברובו מלינק בוואטסאפ ברשת סלולרית. הפריסה היא SVG שכבר נמצא ב-HTML —
//    היא מצוירת מיד, והקנבס נטען רק כשמבקשים אותו. LCP הוא הצורה עצמה, לא
//    ספינר.
// 2. **אין כלי עריכה.** `FlatDrawing` נושא סימון אזורים וסימוני ולידציה; כאן
//    מוצג `RolledPreview`, אותה פריסה בגוון הפליז ובלי מה שאין בו צורך.
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { he } from "@/i18n/he";
import { RolledPreview } from "@/components/create/Artwork";
import { useCoarsePointer } from "@/lib/client/useCoarsePointer";
import type { MultiPolygon } from "@/lib/geometry/types";

const t = he.share;

// בלי `loading`: החלופה כאן היא הפריסה עצמה, שמוצגת מתחת לקנבס עד שהוא מצייר.
// טקסט "טוען…" במקומה היה מחליף תכשיט בספינר בדיוק בשנייה הראשונה.
const Rolled3D = dynamic(() => import("@/components/Preview3D").then((m) => m.Rolled3D), {
  ssr: false,
});

export interface SharedPieceProps {
  material: MultiPolygon | null;
  cutouts: string;
  lengthMm: number;
  widthMm: number;
  gapMm: number;
  thicknessMm: number;
}

export default function SharedPiece(p: SharedPieceProps) {
  const has3d = Boolean(p.material && p.material.length > 0);
  /**
   * ההדמיה פתוחה מיד (גל, 2.8). הפריסה הייתה ברירת המחדל כדי שהצביעה
   * הראשונה תהיה ה-SVG שכבר ב-HTML ולא ספינר בזמן ש-three נטען — אבל מי
   * שנכנס מלינק בא לראות את התכשיט, והפריסה השטוחה אינה התכשיט. המחיר
   * משולם למטה: `RolledPreview` הוא מה שמוצג עד שהקנבס חי, כך שהצביעה
   * הראשונה נשארת מיידית וההחלפה קורית מתחת ליד.
   */
  const [rolled, setRolled] = useState(true);
  const coarse = useCoarsePointer();
  /** הדפדפן לא נתן WebGL (קורה בכרום באנדרואיד בלי האצת חומרה). נופלים
   *  לפריסה במקום להשאיר מלבן ריק במקום התכשיט. */
  const [no3d, setNo3d] = useState(false);
  const on3dUnavailable = useCallback(() => setNo3d(true), []);
  /** הקנבס צייר פריים. עד אז הפריסה מכסה אותו — ראו ההערה על `rolled`. */
  const [live3d, setLive3d] = useState(false);
  const on3dReady = useCallback(() => setLive3d(true), []);

  const showRolled = rolled && has3d && !no3d;

  return (
    <div>
      {has3d && !no3d && (
        <div className="mb-4 flex gap-2">
          {([[true, t.modeRolled], [false, t.modeFlat]] as const).map(([mode, label]) => {
            const on = showRolled === mode;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setRolled(mode)}
                aria-pressed={on}
                className="rounded-[2px] border border-graphite px-[18px] py-2.5 text-sm transition-colors"
                style={{ background: on ? "#202326" : "transparent", color: on ? "#f4f1eb" : "#202326" }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="border border-graphite/10 bg-chalk">
        {showRolled ? (
          <div style={{ background: "linear-gradient(180deg,#efeae1,#e0d9cd)" }}>
            <div className="relative h-[320px] w-full sm:h-[440px]">
              <Rolled3D
                material={p.material as MultiPolygon}
                lengthMm={p.lengthMm}
                widthMm={p.widthMm}
                gapMm={p.gapMm}
                thicknessMm={p.thicknessMm}
                background={null}
                onUnavailable={on3dUnavailable}
                onReady={on3dReady}
              />
              {/* הפריסה מכסה את הקנבס עד לפריים הראשון. אותו רקע, אותו גובה —
                  מה שמתחלף הוא התוכן, בלי קפיצה בפריסת העמוד ובלי ספינר. */}
              {!live3d && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: "linear-gradient(180deg,#efeae1,#e0d9cd)" }}
                >
                  <RolledPreview cutouts={p.cutouts} lengthMm={p.lengthMm} widthMm={p.widthMm} />
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
                <span className="bg-porcelain/70 px-3 py-1.5 text-center text-[12px] text-ink60">
                  {coarse ? t.dragHintTouch : t.dragHint}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <RolledPreview cutouts={p.cutouts} lengthMm={p.lengthMm} widthMm={p.widthMm} />
        )}
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
        {showRolled ? t.renderNote : t.flatNote}
      </p>
    </div>
  );
}
