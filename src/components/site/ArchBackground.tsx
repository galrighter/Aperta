// שכבת רקע דקורטיבית גיאומטרית נועזת — לפי ה-handoff.
// fixed, מתחת לכל התוכן (z-0), pointer-events:none. הכרטיסים אטומים ולכן נשארים נקיים.
//
// הגריד והזוהר הקובלטי יושבים כאן ולא על .rm-scope: כך כל הדקורציה נעולה לאותה
// שכבה קבועה וזזה יחד. קודם הצורות היו fixed בעוד הגריד גלל עם התוכן, והשתיים
// החליקו זו מול זו. שכבה fixed אחת גם זולה יותר מ-background-attachment: fixed.
//
// הגובה מגיע מ-.rm-bg-layer (100lvh) ולא מ-inset:0: בנייד גובה ה-viewport
// משתנה תוך כדי גלילה כשסרגל הכתובת נאסף וחוזר, ושכבה שנגררת אחריו מזיזה כל
// צורה שממוקמת באחוזים או מלמטה — בדיוק בשינוי כיוון הגלילה.
const GRID_AND_GLOW =
  "linear-gradient(rgba(32, 35, 38, 0.028) 1px, transparent 1px) 0 0 / 72px 72px," +
  "linear-gradient(90deg, rgba(32, 35, 38, 0.028) 1px, transparent 1px) 0 0 / 72px 72px," +
  "radial-gradient(circle at 78% 12%, rgba(49, 91, 255, 0.05), transparent 42%)";

export default function ArchBackground() {
  return (
    <div
      aria-hidden="true"
      // הגובה מגיע מ-.rm-bg-layer (100lvh) ולא מ-inset:0 — ראה globals.css.
      className="rm-bg-layer"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        background: GRID_AND_GLOW,
      }}
    >
      {/* לוח אבן אלכסוני */}
      <div style={{ position: "absolute", bottom: "-25vh", left: "-12vw", width: "62vw", height: "135vh", background: "var(--color-porcelain-slab)", transform: "rotate(-19deg)" }} />
      {/* קו קצה על הלוח */}
      <div style={{ position: "absolute", bottom: "-25vh", left: "calc(-12vw + 62vw)", width: "2px", height: "135vh", background: "rgba(32,35,38,0.14)", transform: "rotate(-19deg)", transformOrigin: "top" }} />
      {/* מסגרת מסובבת ענקית מימין למעלה — שני ריבועים מקוננים */}
      <div style={{ position: "absolute", top: "-170px", right: "-130px", width: "540px", height: "540px", border: "2px solid rgba(32,35,38,0.12)", transform: "rotate(12deg)" }} />
      <div style={{ position: "absolute", top: "-120px", right: "-80px", width: "540px", height: "540px", border: "1px solid rgba(32,35,38,0.08)", transform: "rotate(12deg)" }} />
      {/* קו שיער קובלט אנכי + מעוין קובלט */}
      <div style={{ position: "absolute", top: 0, left: "13%", width: "1.5px", height: "100vh", background: "linear-gradient(rgba(49,91,255,0.55),rgba(49,91,255,0.08))" }} />
      <div style={{ position: "absolute", top: "38%", left: "calc(13% - 8px)", width: "16px", height: "16px", background: "var(--color-cobalt)", transform: "rotate(45deg)" }} />
      {/* קו אלכסוני עדין למעלה */}
      <div style={{ position: "absolute", top: "22%", right: "20%", width: "220px", height: "1px", background: "rgba(32,35,38,0.12)", transform: "rotate(-19deg)" }} />
      {/* עיגול מיתאר מימין למטה */}
      <div style={{ position: "absolute", bottom: "14%", right: "8%", width: "300px", height: "300px", border: "1px solid rgba(32,35,38,0.09)", borderRadius: "50%" }} />
    </div>
  );
}
