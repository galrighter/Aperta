import { afterEach, describe, expect, it, vi } from "vitest";
import { wakeDutyAgent, dutyConfigured } from "../duty";

// ההערה לתורן היא צינור אחד קטן, ושני דברים אסור שיישברו בו בשקט: שהוא לא
// זורק לעולם (הכשל שכבר קרה חשוב מהידיעה עליו), ושהבקשה נושאת את הכותרות
// שה-API של הרוטינים דורש — בלעדיהן ה-fire נדחה והתורן פשוט לא מתעורר.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("הערת התורן", () => {
  it("בלי טוקן — מושבת, ולא יוצאת שום בקשה", async () => {
    vi.stubEnv("DUTI_API_TOKEN", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(dutyConfigured()).toBe(false);
    await wakeDutyAgent("תקלה");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("שולח את הטקסט עם הטוקן וכותרות ה-beta הנדרשות", async () => {
    vi.stubEnv("DUTI_API_TOKEN", "sk-ant-oat01-test");
    vi.stubEnv("DUTY_API_URL", "https://api.anthropic.com/v1/claude_code/routines/trig_test/fire");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    await wakeDutyAgent("רצף כשלים ביצירה");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/claude_code/routines/trig_test/fire");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer sk-ant-oat01-test");
    expect(init.headers["anthropic-beta"]).toContain("experimental-cc-routine");
    expect(JSON.parse(init.body)).toEqual({ text: "רצף כשלים ביצירה" });
  });

  it("כשל רשת לא זורק — ההתראה לעולם לא מחליפה את השגיאה המקורית", async () => {
    vi.stubEnv("DUTI_API_TOKEN", "sk-ant-oat01-test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(wakeDutyAgent("תקלה")).resolves.toBeUndefined();
  });
});
