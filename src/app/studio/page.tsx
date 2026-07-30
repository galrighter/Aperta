"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { he } from "@/i18n/he";
import { useStudio, currentVersion } from "@/lib/client/store";
import { Header } from "@/components/Header";
import { ParamsPanel } from "@/components/ParamsPanel";
import { FlatCanvas } from "@/components/FlatCanvas";
import { AnnotationToolbar } from "@/components/AnnotationToolbar";
import { ValidationPanel } from "@/components/ValidationPanel";
import { PromptBar } from "@/components/PromptBar";
import { VersionBar } from "@/components/VersionBar";
import { EmptyState } from "@/components/EmptyState";

// three נטען רק בקליינט ורק כשנכנסים לטאב ההדמיה
const Preview3D = dynamic(() => import("@/components/Preview3D").then((m) => m.Preview3D), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-mist">{he.loading}</div>,
});

export default function StudioPage() {
  const s = useStudio();
  const [initError, setInitError] = useState(false);

  useEffect(() => {
    s.init().catch(() => setInitError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const version = currentVersion(s);

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      {initError && (
        <div className="bg-red-50 px-4 py-2 text-sm text-red-700">
          {he.errNetwork}{" "}
          <button
            className="underline"
            onClick={() => {
              setInitError(false);
              s.init().catch(() => setInitError(true));
            }}
          >
            {he.retry}
          </button>
        </div>
      )}
      {s.design ? (
        <>
          <ParamsPanel />
          {/* טאבים */}
          <div className="flex justify-center gap-1 border-b border-graphite/10 bg-white py-1">
            <TabButton active={s.tab === "flat"} onClick={() => s.setTab("flat")}>
              {he.flatView}
            </TabButton>
            <TabButton active={s.tab === "3d"} onClick={() => s.setTab("3d")}>
              {he.view3d}
            </TabButton>
            {s.renderUrl && (
              <TabButton active={s.tab === "render"} onClick={() => s.setTab("render")}>
                {he.renderView}
              </TabButton>
            )}
          </div>
          {/* קנבס מרכזי */}
          <main className="relative min-h-0 flex-1">
            {version ? (
              s.tab === "flat" ? (
                <>
                  <FlatCanvas />
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                    <AnnotationToolbar />
                  </div>
                </>
              ) : s.tab === "3d" ? (
                <Preview3D />
              ) : (
                <div className="flex h-full items-center justify-center bg-porcelain p-4">
                  {s.renderUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.renderUrl} alt={he.renderView} className="max-h-full max-w-full rounded-[2px] object-contain shadow" />
                  ) : (
                    <div className="text-mist">{he.renderView}</div>
                  )}
                </div>
              )
            ) : (
              <EmptyState onExample={(p) => void s.generate(p, [])} />
            )}
            {/* חיווי יצירה מעל הקנבס כשיש כבר עיצוב */}
            {s.genStatus !== "idle" && s.genStatus !== "error" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/50">
                <div className="flex items-center gap-2 rounded-[2px] bg-white px-4 py-2 text-sm shadow-lg">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-graphite/20 border-t-cobalt" />
                  {s.genStatus === "generating" ? he.statusGenerating : s.genStatus === "validating" ? he.statusValidating : he.statusRepairing}
                </div>
              </div>
            )}
          </main>
          {version && <ValidationPanel />}
          {version && <VersionBar />}
          <PromptBar />
        </>
      ) : (
        <main className="min-h-0 flex-1">
          <NoDesign />
        </main>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`rounded-[2px] px-4 py-1 text-sm ${active ? "bg-graphite text-white" : "text-ink60 hover:bg-porcelain"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function NoDesign() {
  const s = useStudio();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold">{he.emptyTitle}</h2>
      <p className="max-w-md text-sm text-ink60">{he.emptyBody}</p>
      <div className="flex gap-2">
        <button
          className="rounded-[2px] bg-graphite px-4 py-2 text-sm text-white hover:bg-graphite/90"
          onClick={() => void s.newDesign("bracelet")}
        >
          {he.bracelet} — {he.newDesign}
        </button>
        <button
          className="rounded-[2px] border border-graphite/20 bg-white px-4 py-2 text-sm hover:bg-porcelain"
          onClick={() => void s.newDesign("ring")}
        >
          {he.ring} — {he.newDesign}
        </button>
      </div>
    </div>
  );
}
