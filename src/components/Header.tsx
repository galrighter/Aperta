"use client";

import { useState } from "react";
import { he } from "@/i18n/he";
import { currentVersion, useStudio } from "@/lib/client/store";
import { svgFrame } from "@/lib/geometry/frame";
import { cutoutsInner } from "./create/model";
import { DesignsDrawer } from "./DesignsDrawer";
import { ShareButton } from "./create/ShareButton";

export function Header() {
  const s = useStudio();
  const { profiles, profile, selectProfile, design, renameDesign, newDesign, setDrawerOpen } = s;
  const version = currentVersion(s);
  /** הפריסה לתמונת השיתוף. המסגרת מה-viewBox של הגרסה ולא משורת העיצוב — זו
   *  שנחתכת בפועל, מאותה סיבה שמופיעה ב-`shareSnapshot`. */
  const frame = version ? svgFrame(version.svg) : null;
  const flat = version
    ? {
        cutouts: cutoutsInner(version.svg),
        lengthMm: frame?.lengthMm ?? Number(design?.length_mm ?? 0),
        widthMm: frame?.widthMm ?? Number(design?.width_mm ?? 0),
      }
    : null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  return (
    <header className="flex items-center gap-2 border-b border-graphite/10 bg-white px-3 py-2">
      {/* בורר פרופיל */}
      <div className="relative">
        <button
          className="flex items-center gap-2 rounded-[2px] border border-graphite/10 py-1 pe-3 ps-1 text-sm hover:bg-porcelain"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label={he.selectProfile}
        >
          <span
            className="inline-block h-6 w-6 rounded-[2px]"
            style={{ backgroundColor: profile?.color ?? "#ccc" }}
          />
          <span className="hidden sm:inline">{profile?.name ?? he.loading}</span>
        </button>
        {pickerOpen && (
          <div className="absolute start-0 top-10 z-40 w-44 rounded-[2px] border border-graphite/10 bg-white py-1 shadow-lg">
            {profiles.map((p) => (
              <button
                key={p.id}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-porcelain"
                onClick={() => {
                  setPickerOpen(false);
                  void selectProfile(p);
                }}
              >
                <span className="inline-block h-5 w-5 rounded-[2px]" style={{ backgroundColor: p.color }} />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* שם העיצוב — עריכה inline */}
      <div className="min-w-0 flex-1">
        {design ? (
          <input
            className="w-full truncate rounded-[2px] border border-transparent bg-transparent px-2 py-1 text-center text-base font-medium focus:border-lapis focus:bg-white focus:outline-none"
            value={nameDraft ?? design.name}
            placeholder={he.designNamePlaceholder}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft !== null) void renameDesign(nameDraft);
              setNameDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <div className="text-center text-base font-medium text-mist">{he.appTitle}</div>
        )}
      </div>

      {/* שיתוף הגרסה המוצגת. הסטודיו הוא הכלי הפנימי, ומכאן יוצא הלינק
          שנשלח לחברים לפני שיש עליו הזמנה. מוצג רק כשיש גרסה — לעיצוב ריק
          אין מה לשתף. */}
      {design && version && (
        <ShareButton
          designId={design.id}
          versionId={version.id}
          serial={design.serial ?? null}
          flat={flat}
          compact
          className="inline-flex items-center gap-1.5 rounded-[2px] border border-graphite/10 px-3 py-1.5 text-sm hover:bg-porcelain disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}
      <button
        className="rounded-[2px] border border-graphite/10 px-3 py-1.5 text-sm hover:bg-porcelain"
        onClick={() => setDrawerOpen(true)}
      >
        {he.myDesigns}
      </button>
      <button
        className="rounded-[2px] bg-graphite px-3 py-1.5 text-sm text-white hover:bg-graphite/90"
        onClick={() => void newDesign(design?.product_type ?? "bracelet")}
      >
        {he.newDesign}
      </button>

      <DesignsDrawer />
    </header>
  );
}
