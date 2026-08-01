"use client";

// "שיתוף העיצוב" — מייצר לינק לדף `/d/<token>` ומוסר אותו.
//
// שלושה מסלולי מסירה, לפי מה שהדפדפן מרשה, ובסדר הזה:
//   1. `navigator.share` — גיליון השיתוף של המערכת. זה מה שרוצים בטלפון, ומשם
//      הלינק הולך לוואטסאפ בשתי נגיעות.
//   2. הלוח — בדסקטופ, שם אין גיליון שיתוף.
//   3. תיבה עם הלינק לבחירה ידנית.
//
// המסלול השלישי אינו תיאורטי: `navigator.share` ו-`clipboard.writeText` דורשים
// שניהם הרשאת משתמש פעילה, וזו פגה כשממתינים לתשובת רשת בין הלחיצה לקריאה.
// בלעדיו לחיצה על "שיתוף" באותם דפדפנים הייתה מייצרת לינק תקין בשרת ולא
// מראה אותו לאיש.
import { useState } from "react";
import { he } from "@/i18n/he";
import { api, ClientApiError } from "@/lib/client/api";
import { designCode } from "@/lib/designCode";

const t = he.share;

export function ShareButton({
  designId, versionId, serial,
}: {
  designId: string;
  versionId: string;
  serial: number | null;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onShare() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await api.createShare(designId, versionId);
      setUrl(res.url);

      const code = designCode(serial);
      if (navigator.share) {
        try {
          await navigator.share({
            title: code ? t.shareTitle(code) : he.site.brand,
            text: t.shareText,
            url: res.url,
          });
          return;
        } catch (e) {
          // ביטול של המשתמש אינו כשל — הלינק כבר מוצג בתיבה למטה.
          if ((e as Error)?.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(res.url);
        setCopied(true);
      } catch {
        /* נשארת התיבה עם הלינק */
      }
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : t.shareFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-graphite/10 bg-white p-6">
      <div className="mb-4 font-display text-xs tracking-[0.15em] text-mist">{t.shareBtn}</div>
      <p className="mb-3.5 text-[13px] leading-relaxed text-ink60">{t.shareHint}</p>
      <button
        type="button"
        onClick={() => void onShare()}
        disabled={busy}
        className="w-full rounded-[2px] border border-graphite px-4 py-2.5 text-[15px] font-medium text-graphite transition-colors hover:border-cobalt hover:text-cobalt disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t.shareBtnBusy : t.shareBtn}
      </button>

      {url && (
        <div className="mt-3">
          <input
            readOnly
            value={url}
            dir="ltr"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-[2px] border border-graphite/20 bg-porcelain px-3 py-2 text-[13px] text-graphite"
          />
          {copied && <p className="mt-1.5 text-[13px] text-ink60">{t.shareCopied}</p>}
        </div>
      )}
      {error && <p className="mt-2 text-[13px]" style={{ color: "#c0413b" }}>{error}</p>}
    </div>
  );
}
