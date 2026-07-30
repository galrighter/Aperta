"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { useStudio, currentVersion } from "@/lib/client/store";
import type { Annotation, Pt } from "@/lib/client/types";

// הקנבס השטוח: רנדור ה-SVG הקנוני עם zoom/pan, הדגשות ולידציה,
// ושכבת הסימון מעל — באותה מערכת קואורדינטות (מ"מ).

interface ViewTx {
  scale: number; // פיקסלים למ"מ
  tx: number;
  ty: number;
}

let annotId = 0;
const nextId = () => `a${++annotId}`;

export function FlatCanvas() {
  const s = useStudio();
  const design = s.design!;
  const version = currentVersion(s);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewTx | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);

  const L = Number(design.length_mm);
  const W = Number(design.width_mm);

  // חילוץ תוכן שכבת ה-cutouts מה-SVG הקנוני
  const cutoutsInner = useMemo(() => {
    if (!version) return "";
    const m = /<g id="cutouts"[^>]*>(.*)<\/g>/s.exec(version.svg);
    return m?.[1] ?? "";
  }, [version]);

  // התאמת התצוגה לגודל המסך בפתיחה ובשינוי גודל
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const scale = Math.min(r.width / (L + 10), r.height / (W + 10));
      setView({ scale, tx: (r.width - L * scale) / 2, ty: (r.height - W * scale) / 2 });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L, W, design.id]);

  // מיקוד בנקודה מבקשת ValidationPanel
  useEffect(() => {
    if (!s.focus || !containerRef.current || !view) return;
    const r = containerRef.current.getBoundingClientRect();
    const targetScale = Math.max(view.scale, Math.min(r.width, r.height) / 30);
    setView({
      scale: targetScale,
      tx: r.width / 2 - s.focus.x * targetScale,
      ty: r.height / 2 - s.focus.y * targetScale,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.focus?.n]);

  const toMm = (clientX: number, clientY: number): Pt => {
    const r = containerRef.current!.getBoundingClientRect();
    const v = view!;
    return [(clientX - r.left - v.tx) / v.scale, (clientY - r.top - v.ty) / v.scale];
  };

  // ניהול מגע/עכבר: הזזה, צביטה, ציור
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ mode: "pan" | "pinch" | "draw" | "none"; last?: { x: number; y: number }; pinchDist?: number; pinchMid?: { x: number; y: number } }>({ mode: "none" });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        mode: "pinch",
        pinchDist: Math.hypot(a.x - b.x, a.y - b.y),
        pinchMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      setDraft(null);
      return;
    }
    if (s.tool === "none") {
      gesture.current = { mode: "pan", last: { x: e.clientX, y: e.clientY } };
      return;
    }
    const p = toMm(e.clientX, e.clientY);
    gesture.current = { mode: "draw" };
    if (s.tool === "pen") setDraft({ id: nextId(), type: "pen", points: [p] });
    else if (s.tool === "arrow") setDraft({ id: nextId(), type: "arrow", from: p, to: p });
    else if (s.tool === "ellipse") setDraft({ id: nextId(), type: "ellipse", x0: p[0], y0: p[1], x1: p[0], y1: p[1] });
    else if (s.tool === "eraser") eraseAt(p);
    else if (s.tool === "text") {
      const text = window.prompt(he.textLabelPrompt);
      if (text?.trim()) s.addAnnotation({ id: nextId(), type: "text", x: p[0], y: p[1], text: text.trim() });
      gesture.current = { mode: "none" };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.mode === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // חשוב: לוכדים את הערכים הקודמים לפני הדריסה. קריאה מתוך setView (שרץ
      // מאוחר יותר) הייתה קוראת את הערך שכבר נדרס → factor שגוי/הפוך.
      const prevDist = g.pinchDist;
      const prevMid = g.pinchMid;
      g.pinchDist = dist;
      g.pinchMid = mid;
      if (!prevDist || !prevMid) return;
      setView((v) => {
        if (!v) return v;
        const r = containerRef.current!.getBoundingClientRect();
        const factor = dist / prevDist;
        const scale = Math.min(200, Math.max(0.5, v.scale * factor));
        const f = scale / v.scale;
        const mx = prevMid.x - r.left, my = prevMid.y - r.top;
        return {
          scale,
          tx: mx - (mx - v.tx) * f + (mid.x - prevMid.x),
          ty: my - (my - v.ty) * f + (mid.y - prevMid.y),
        };
      });
      return;
    }
    if (g.mode === "pan" && g.last) {
      const dx = e.clientX - g.last.x, dy = e.clientY - g.last.y;
      g.last = { x: e.clientX, y: e.clientY };
      setView((v) => (v ? { ...v, tx: v.tx + dx, ty: v.ty + dy } : v));
      return;
    }
    if (g.mode === "draw" && draft) {
      const p = toMm(e.clientX, e.clientY);
      setDraft((d) => {
        if (!d) return d;
        if (d.type === "pen") return { ...d, points: [...d.points, p] };
        if (d.type === "arrow") return { ...d, to: p };
        if (d.type === "ellipse") return { ...d, x1: p[0], y1: p[1] };
        return d;
      });
    } else if (g.mode === "draw" && s.tool === "eraser") {
      eraseAt(toMm(e.clientX, e.clientY));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (gesture.current.mode === "draw" && draft) {
      const keep =
        draft.type === "pen"
          ? draft.points.length > 1
          : draft.type === "arrow"
            ? Math.hypot(draft.to[0] - draft.from[0], draft.to[1] - draft.from[1]) > 0.5
            : draft.type === "ellipse"
              ? Math.abs(draft.x1 - draft.x0) > 0.5 || Math.abs(draft.y1 - draft.y0) > 0.5
              : true;
      if (keep) s.addAnnotation(draft);
      setDraft(null);
    }
    if (pointers.current.size === 0) gesture.current = { mode: "none" };
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setView((v) => {
      if (!v) return v;
      const r = containerRef.current!.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      const scale = Math.min(200, Math.max(0.5, v.scale * factor));
      const f = scale / v.scale;
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      return { scale, tx: mx - (mx - v.tx) * f, ty: my - (my - v.ty) * f };
    });
  };

  const eraseAt = (p: Pt) => {
    const hit = s.annotations.find((a) => annotationHit(a, p, 2.5));
    if (hit) s.removeAnnotation(hit.id);
  };

  const report = version?.validation_report;
  const highlights = useMemo(() => {
    if (!report) return [];
    return report.checks
      .filter((c) => c.status !== "pass")
      .flatMap((c) => c.locations.map((l) => ({ ...l, status: c.status })));
  }, [report]);

  const strokeW = view ? Math.max(0.3, 1.8 / view.scale) : 0.5;

  return (
    <div
      ref={containerRef}
      className="touch-none-canvas relative h-full w-full overflow-hidden bg-porcelain"
      style={{ direction: "ltr" }}
    >
      {view && (
        <svg
          className="h-full w-full"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            {/* הרצועה */}
            <rect x={0} y={0} width={L} height={W} rx={2} fill="white" stroke="#a8a29e" strokeWidth={strokeW / 2} />
            {/* cutouts */}
            <g
              style={{ fill: "#292524" }}
              dangerouslySetInnerHTML={{ __html: cutoutsInner }}
            />
            {/* הדגשות ולידציה */}
            {highlights.map((h, i) => (
              <circle
                key={i}
                cx={h.x}
                cy={h.y}
                r={h.r ?? 2}
                fill="none"
                stroke={h.status === "fail" ? "#dc2626" : "#ea580c"}
                strokeWidth={strokeW}
                strokeDasharray={`${strokeW * 2} ${strokeW * 1.2}`}
              />
            ))}
            {/* שכבת סימונים */}
            <g>
              {[...s.annotations, ...(draft ? [draft] : [])].map((a) => (
                <AnnotationShape key={a.id} a={a} strokeW={strokeW} />
              ))}
            </g>
          </g>
        </svg>
      )}
    </div>
  );
}

function AnnotationShape({ a, strokeW }: { a: Annotation; strokeW: number }) {
  const red = "#e11d48";
  switch (a.type) {
    case "pen":
      return (
        <polyline
          points={a.points.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke={red}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "arrow": {
      const dx = a.to[0] - a.from[0], dy = a.to[1] - a.from[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const hs = strokeW * 4;
      const h1: Pt = [a.to[0] - ux * hs - uy * hs * 0.5, a.to[1] - uy * hs + ux * hs * 0.5];
      const h2: Pt = [a.to[0] - ux * hs + uy * hs * 0.5, a.to[1] - uy * hs - ux * hs * 0.5];
      return (
        <g stroke={red} strokeWidth={strokeW} fill="none" strokeLinecap="round">
          <line x1={a.from[0]} y1={a.from[1]} x2={a.to[0]} y2={a.to[1]} />
          <polyline points={`${h1.join(",")} ${a.to.join(",")} ${h2.join(",")}`} />
        </g>
      );
    }
    case "ellipse":
      return (
        <ellipse
          cx={(a.x0 + a.x1) / 2}
          cy={(a.y0 + a.y1) / 2}
          rx={Math.abs(a.x1 - a.x0) / 2}
          ry={Math.abs(a.y1 - a.y0) / 2}
          fill="none"
          stroke={red}
          strokeWidth={strokeW}
        />
      );
    case "text":
      return (
        <text x={a.x} y={a.y} fill={red} fontSize={strokeW * 8} style={{ userSelect: "none" }}>
          {a.text}
        </text>
      );
  }
}

export function annotationHit(a: Annotation, p: Pt, tol: number): boolean {
  const near = (q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol;
  switch (a.type) {
    case "pen":
      return a.points.some(near);
    case "arrow":
      return near(a.from) || near(a.to) || near([(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2]);
    case "ellipse": {
      const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2;
      const rx = Math.abs(a.x1 - a.x0) / 2 + tol, ry = Math.abs(a.y1 - a.y0) / 2 + tol;
      return ((p[0] - cx) / rx) ** 2 + ((p[1] - cy) / ry) ** 2 <= 1;
    }
    case "text":
      return near([a.x, a.y]);
  }
}
