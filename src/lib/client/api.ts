import { he } from "@/i18n/he";
import type { Design, Geometry, Profile, Version } from "./types";
import type { ValidationReport } from "@/lib/geometry/types";

// שכבת הקריאות לשרת. כל השגיאות מתורגמות ל-Error עם הודעה בעברית + code.

export class ClientApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ClientApiError("network", he.errNetwork, 0);
  }
  let body: unknown = null;
  let parseFailed = false;
  try {
    body = await res.json();
  } catch {
    // גוף לא־תקין. על תשובת שגיאה זה צפוי (יש קוד סטטוס); על 200 זו תשובה
    // שנקטעה — ובלי הבחנה כאן היא הוחזרה כ-null, והקורא נפל על TypeError
    // מאוחר יותר עם "משהו השתבש" שאי אפשר לאבחן ממנו כלום.
    parseFailed = true;
  }
  if (res.ok && parseFailed) {
    throw new ClientApiError("truncated", he.errNetwork, res.status);
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error;
    const code = err?.code ?? "unknown";
    let message: string = he.errGeneric;
    if (code === "rate_limited") message = he.errRateLimit;
    else if (code === "llm_error" || code === "network") message = code === "network" ? he.errNetwork : he.errLlmNotSvg;
    throw new ClientApiError(code, message, res.status);
  }
  return body as T;
}

export const api = {
  profiles: () => call<{ profiles: Profile[] }>("/api/profiles"),

  designs: (profileId: string) =>
    call<{ designs: Design[] }>(`/api/designs?profileId=${encodeURIComponent(profileId)}`),

  createDesign: (input: { profileId: string; productType: "bracelet" | "ring"; name?: string }) =>
    call<{ design: Design }>("/api/designs", { method: "POST", body: JSON.stringify(input) }),

  getDesign: (id: string) =>
    call<{ design: Design; currentVersion: Version | null; versions: Version[] }>(`/api/designs/${id}`),

  patchDesign: (id: string, patch: Record<string, unknown>) =>
    call<{ design: Design }>(`/api/designs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteDesign: (id: string) => call<{ ok: true }>(`/api/designs/${id}`, { method: "DELETE" }),

  duplicateDesign: (id: string) =>
    call<{ design: Design }>(`/api/designs/${id}/duplicate`, { method: "POST" }),

  generate: (input: {
    designId: string;
    userPrompt: string;
    currentSvg: string | null;
    images: Array<{ kind: "inspiration" | "annotation"; dataUrl: string }>;
  }) =>
    call<{
      version: Version;
      report: ValidationReport;
      geometry: Geometry | null;
      lengthMm?: number;
      render?: { model: string; url: string | null };
    }>("/api/generate", { method: "POST", body: JSON.stringify(input) }),

  vectorize: (input: {
    designId: string;
    image: { dataUrl: string };
    colorKey?: "warm" | "dark" | "saturation" | "auto";
  }) =>
    call<{
      version: Version;
      report: ValidationReport;
      geometry: Geometry | null;
      lengthMm: number;
      vectorizer: { iou?: number; holes?: number; meanDeviationMm?: number };
    }>("/api/vectorize", { method: "POST", body: JSON.stringify(input) }),

  validate: (input: {
    svg: string;
    productType: "bracelet" | "ring";
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
  }) =>
    call<{ report: ValidationReport; canonicalSvg: string | null; geometry: Geometry | null }>(
      "/api/validate",
      { method: "POST", body: JSON.stringify(input) },
    ),

  exportDesign: (versionId: string, forced: boolean) =>
    call<{ dxfUrl: string; svgUrl: string }>("/api/export", {
      method: "POST",
      body: JSON.stringify({ versionId, forced }),
    }),
};
