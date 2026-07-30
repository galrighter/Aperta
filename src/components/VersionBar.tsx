"use client";

import { useState } from "react";
import { he } from "@/i18n/he";
import { useStudio, currentVersion } from "@/lib/client/store";
import { api, ClientApiError } from "@/lib/client/api";
import { ConfirmModal } from "./Modal";

export function VersionBar() {
  const s = useStudio();
  const version = currentVersion(s);
  const [confirmWarn, setConfirmWarn] = useState(false);
  const [links, setLinks] = useState<{ dxfUrl: string; svgUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  if (!version) return null;

  const doExport = async (forced: boolean) => {
    setExporting(true);
    setError(null);
    try {
      const res = await api.exportDesign(version.id, forced);
      setLinks(res);
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : he.errGeneric);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 border-t border-graphite/10 bg-white px-3 py-1.5 text-sm">
      <button
        className="rounded-[2px] border border-graphite/10 px-2 py-1 disabled:opacity-30"
        disabled={s.versionIdx <= 0}
        onClick={() => void s.gotoVersion(s.versionIdx - 1)}
        title={he.prevVersion}
      >
        {he.prevVersion}
      </button>
      <span className="text-xs text-ink60">
        {he.versionLabel} {version.version_no}/{s.versions.length}
      </span>
      <button
        className="rounded-[2px] border border-graphite/10 px-2 py-1 disabled:opacity-30"
        disabled={s.versionIdx >= s.versions.length - 1}
        onClick={() => void s.gotoVersion(s.versionIdx + 1)}
        title={he.nextVersion}
      >
        {he.nextVersion}
      </button>

      <div className="flex-1" />

      {links && (
        <span className="flex items-center gap-2 text-xs">
          <span className="text-green-700">{he.exportReady}:</span>
          <a className="rounded-[2px] bg-porcelain px-2 py-1 underline" href={links.dxfUrl}>
            {he.downloadDxf}
          </a>
          <a className="rounded-[2px] bg-porcelain px-2 py-1 underline" href={links.svgUrl}>
            {he.downloadSvg}
          </a>
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}

      <button
        className="rounded-[2px] bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-40"
        disabled={exporting || version.validation_status === "fail"}
        title={version.validation_status === "fail" ? he.exportBlockedFail : he.exportBtn}
        onClick={() => {
          if (version.validation_status === "warn") setConfirmWarn(true);
          else void doExport(false);
        }}
      >
        {he.exportBtn}
      </button>

      <ConfirmModal
        open={confirmWarn}
        title={he.exportWarnTitle}
        body={he.exportWarnBody}
        confirmLabel={he.exportForce}
        onConfirm={() => {
          setConfirmWarn(false);
          void doExport(true);
        }}
        onCancel={() => setConfirmWarn(false)}
      />
    </div>
  );
}
