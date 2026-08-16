import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ‏7.8.26: מפתח Resend פג. ברגע אחד נשתקו גם אישורי ההזמנה ללקוחות, גם קודי
// הכניסה, וגם ההתראות שהיו אמורות לספר שמשהו לא בסדר — כי כולן עברו באותו
// ספק. התקלה נמשכה ימים (docs/FULL_AUDIT_2026-08.md, פרק 7, ממצא 2).
//
// הבדיקות כאן שומרות על הכלל שנגזר מזה: **כל התראה קריטית יוצאת גם בערוץ
// שאינו מייל.** אי אפשר לבדוק את זה בהרצה בלי ספק דואר וטלגרם אמיתיים, ולכן
// הן קוראות את הקוד — כמו `quotaGate.test.ts`.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const QUOTA = read("src/lib/alerts/quota.ts");
const FAILURES = read("src/lib/alerts/failures.ts");
const ORDERS = read("src/app/api/orders/route.ts");
const BACKUP = read(".github/workflows/backup-db.yml");

describe("התראת תקציב", () => {
  it("יוצאת לטלגרם ולא רק במייל", () => {
    expect(QUOTA).toContain("sendTelegram(");
  });

  it("לא נסגרת כשאין ספק דואר — טלגרם לבדו מספיק", () => {
    expect(QUOTA).toContain("if (!mailConfigured() && !telegramConfigured()) return;");
  });
});

describe("רצף כשלים והרצה תקועה", () => {
  it("שניהם מגיעים לטלגרם", () => {
    expect(FAILURES).toContain('sendTelegram(["🔴 Aperta — היצירה נכשלת ברצף"');
    expect(FAILURES).toContain('sendTelegram(["⚠️ Aperta — הרצת יצירה תקועה"');
  });

  it("שער ההתראה מכיר בטלגרם כיעד לגיטימי", () => {
    // אחרת ההתראה נסגרת ב"אין למי להתריע" בדיוק כשהמייל הוא מה שנפל.
    expect(FAILURES).toContain("!mailConfigured() && !dutyConfigured() && !telegramConfigured()");
  });
});

describe("הזמנה חדשה", () => {
  it("מודיעה בטלגרם לפני שהיא מנסה לשלוח מיילים", () => {
    const tg = ORDERS.indexOf("await sendTelegram(");
    const mailGate = ORDERS.indexOf("if (!mailConfigured()) {");
    expect(tg).toBeGreaterThan(-1);
    // הסדר הוא ההגנה: אם ספק הדואר נפל, ההודעה שכבר יצאה היא זו שנשארת.
    expect(mailGate).toBeGreaterThan(tg);
  });
});

describe("גיבוי המסד", () => {
  it("נכשל בקול כשאין חיבור, ולא מסיים ירוק", () => {
    expect(BACKUP).toContain("::error::SUPABASE_DB_URL secret is not set");
    expect(BACKUP).toContain("exit 1");
  });

  it("מוודא שה-dump אינו ריק — הכישלון השקט הקלאסי", () => {
    for (const t of ["designs", "design_versions", "orders"]) {
      expect(BACKUP).toContain(t);
    }
    expect(BACKUP).toContain("CREATE TABLE public.$t");
  });

  it("מתריע בטלגרם כשהגיבוי נכשל", () => {
    expect(BACKUP).toContain("if: failure()");
    expect(BACKUP).toContain("api.telegram.org");
  });

  it("רץ יומית ולא רק ידנית", () => {
    expect(BACKUP).toContain("schedule:");
    expect(BACKUP).toMatch(/cron: "\d+ \d+ \* \* \*"/);
  });

  it("קורא ל-pg_dump בנתיב מלא ולא דרך העטיפה", () => {
    // ‏`/usr/bin/pg_dump` הוא pg_wrapper, והוא בוחר את גרסת ברירת המחדל של
    // ההפצה (16) ולא את הגבוהה שמותקנת (17) — מה שהפיל את הגיבוי הראשון
    // ב-"server version mismatch" מול Supabase 17.6.
    expect(BACKUP).toContain('"$PGBIN/pg_dump"');
    expect(BACKUP).not.toMatch(/^\s*pg_dump "\$SUPABASE_DB_URL"/m);
  });

  it("גרסת הלקוח נגזרת ולא קשיחה — שדרוג של Supabase לא ישבור שוב", () => {
    expect(BACKUP).toContain("postgresql-client-$newest");
  });

  it("היעד הראשי הוא Hetzner, והעברה נבדקת ב-checksum", () => {
    // הריפו ציבורי; ‏artifact אינו מקום לגיבוי עם פרטי לקוחות.
    expect(BACKUP).toContain("/var/backups/aperta");
    expect(BACKUP).toContain("sha256sum");
    expect(BACKUP).toContain("checksum mismatch after transfer");
  });

  it("‏artifact נשמר רק כשהקובץ מוצפן", () => {
    expect(BACKUP).toContain("if: steps.dump.outputs.encrypted == 'yes'");
  });
});
