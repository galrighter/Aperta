import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  HEARTBEAT_STALE_MS, PENDING_MAX_AGE_MS, beatPendingJob, clearPendingJob,
  isUnwatched, readPendingJob, setPendingJob,
} from "../pendingJob";
import { listMyDesigns, markMyDesignDone, saveMyDesign } from "../myDesigns";

// מה שקובע אם החלון "העיצוב מוכן" נפתח: פעימת לב שמתיישנת כשאף מסך לא מחכה.
// דגל בוליאני היה נשאר דלוק כשהלשונית נסגרת — כלומר בדיוק כשצריך להתריע.

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const JOB = { jobId: "j1", designId: "d1", first: true };

describe("pendingJob", () => {
  it("נשמר ונקרא, כולל הדגל שמבדיל יצירה ראשונה מעריכה", () => {
    setPendingJob(JOB);
    expect(readPendingJob()).toMatchObject({ jobId: "j1", designId: "d1", first: true });
  });

  it("נחשב 'לא נצפה' רק אחרי שהפעימה התיישנה", () => {
    vi.useFakeTimers();
    setPendingJob(JOB);
    expect(isUnwatched(readPendingJob()!)).toBe(false);
    vi.advanceTimersByTime(HEARTBEAT_STALE_MS + 1000);
    expect(isUnwatched(readPendingJob()!)).toBe(true);
  });

  it("פעימה מהמסך שמחכה מחזירה אותו למצב 'נצפה'", () => {
    vi.useFakeTimers();
    setPendingJob(JOB);
    vi.advanceTimersByTime(HEARTBEAT_STALE_MS + 1000);
    beatPendingJob("j1");
    expect(isUnwatched(readPendingJob()!)).toBe(false);
  });

  it("פעימה של הרצה אחרת לא נוגעת ברשומה", () => {
    vi.useFakeTimers();
    setPendingJob(JOB);
    vi.advanceTimersByTime(HEARTBEAT_STALE_MS + 1000);
    beatPendingJob("someone-else");
    expect(isUnwatched(readPendingJob()!)).toBe(true);
  });

  it("רשומה עתיקה נזרקת בקריאה — אין חלון קופץ על יצירה של אתמול", () => {
    vi.useFakeTimers();
    setPendingJob(JOB);
    vi.advanceTimersByTime(PENDING_MAX_AGE_MS + 1000);
    expect(readPendingJob()).toBeNull();
  });

  it("clear מוחק", () => {
    setPendingJob(JOB);
    clearPendingJob();
    expect(readPendingJob()).toBeNull();
  });
});

describe("markMyDesignDone", () => {
  const entry = {
    id: "d1", name: "צמיד 165", product: "bracelet" as const, circMm: 165,
    widthMm: 18, cuts: 0, updatedAt: "2026-01-01T00:00:00.000Z", pending: true,
    brief: "עלים",
  };

  it("מסיר את הסימון 'טרם הושלם' בלי למחוק את מה שרק הדפדפן מכיר", () => {
    saveMyDesign(entry);
    markMyDesignDone("d1");
    const [row] = listMyDesigns();
    expect(row.pending).toBeUndefined();
    // זה מה שנשבר אם משתמשים ב-mergeMyDesign עם רשומה חלקית.
    expect(row.name).toBe("צמיד 165");
    expect(row.brief).toBe("עלים");
    expect(row.circMm).toBe(165);
  });

  it("לא ממציא רשומה לעיצוב שאינו באינדקס המקומי", () => {
    markMyDesignDone("unknown");
    expect(listMyDesigns()).toHaveLength(0);
  });
});
