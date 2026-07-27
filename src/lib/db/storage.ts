import { supabaseAdmin, ensureBucket, STORAGE_BUCKET } from "./supabase";

// Storage: bucket יחיד "studio" עם תיקיות annotations/, exports/, uploads/.

export async function uploadFile(
  path: string,
  data: Uint8Array | string,
  contentType: string,
): Promise<string> {
  await ensureBucket();
  const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const { error } = await supabaseAdmin()
    .storage.from(STORAGE_BUCKET)
    .upload(path, body as unknown as ArrayBuffer, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed (${path}): ${error.message}`);
  return path;
}

export async function signedUrl(path: string, expiresInSec = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) throw new Error(`Failed to sign URL (${path}): ${error?.message}`);
  return data.signedUrl;
}

/**
 * כתובת חתומה להעלאה *אחת* לנתיב אחד. ככה שירות הרנדר כותב את ההדמיות ותמונות
 * השלבים ישירות ל-storage בלי להחזיק שום מפתח: הוא יכול לכתוב רק את הנתיב
 * שחתמנו, והמפתח לא עוזב את ה-Worker. זה מה שמוציא מגה־בייטים מהבקשה.
 */
export async function signedUploadUrl(path: string): Promise<string> {
  await ensureBucket();
  const { data, error } = await supabaseAdmin()
    .storage.from(STORAGE_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`Failed to sign upload (${path}): ${error?.message}`);
  return data.signedUrl;
}

export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mediaType: string } {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!m) throw new Error("Invalid data URL");
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return { bytes, mediaType: m[1] };
}
