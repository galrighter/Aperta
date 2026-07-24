"use client";

// handoff §8 (סיפא) — מסך אישור: מספר הזמנה, בדיקת ייצור אנושית, ואז אישור סופי.
import Link from "next/link";
import { he } from "@/i18n/he";

const d = he.design;

export function DoneScreen({ orderNo }: { orderNo: string }) {
  return (
    <section className="mx-auto flex max-w-[620px] flex-col items-center px-5 py-24 text-center sm:px-10">
      <div
        className="mb-7 flex h-14 w-14 items-center justify-center rounded-full text-xl text-white"
        style={{ background: "#4a8f5c" }}
        aria-hidden="true"
      >
        ✓
      </div>
      <h1 className="mb-4 text-[28px] font-semibold tracking-tight text-graphite sm:text-[34px]">
        {d.doneTitle}
      </h1>

      <div className="mb-7 border border-graphite/15 bg-white px-7 py-4">
        <div className="font-display text-xs tracking-[0.18em] text-mist">{d.doneOrderNo}</div>
        <div className="mt-1 font-display text-2xl font-bold tracking-wider text-graphite">
          {orderNo}
        </div>
      </div>

      <p className="mb-10 text-[16px] leading-relaxed text-ink60" style={{ textWrap: "pretty" }}>
        {d.doneBody}
      </p>

      <Link
        href="/"
        className="rounded-[2px] bg-graphite px-[34px] py-3.5 text-base font-semibold text-porcelain transition-colors hover:bg-graphite/90"
      >
        {d.doneHome}
      </Link>
    </section>
  );
}
