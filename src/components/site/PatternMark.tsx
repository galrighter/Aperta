// איור דקורטיבי: רצועת פליז עם דוגמת ניקוב, בהשראת המוצר האמיתי.
// דטרמיניסטי לחלוטין (בלי אקראיות) כדי שה-SSR וה-hydration יתאימו.
// זהו איור להמחשה בלבד — לא פלט אמיתי של הסטודיו.

export type PatternVariant =
  | "hexagons"
  | "waves"
  | "circles"
  | "diamonds"
  | "drops"
  | "stripes";

const L = 200; // אורך הרצועה (יחידות = מ"מ בהשאלה)
const W = 44; // רוחב
const MARGIN = 7; // שוליים עליון/תחתון שנשארים מלאים

function hexagons(): string[] {
  const paths: string[] = [];
  const r = 5.2;
  const dx = r * 1.9;
  const dy = r * 1.65;
  let row = 0;
  for (let y = MARGIN + r; y <= W - MARGIN - r; y += dy, row++) {
    const offset = row % 2 ? dx / 2 : 0;
    for (let x = 12 + offset; x <= L - 12; x += dx) {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        return `${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`;
      });
      paths.push(`M${pts.join("L")}Z`);
    }
  }
  return paths;
}

function circles(): string[] {
  const paths: string[] = [];
  const cy = W / 2;
  let i = 0;
  for (let x = 16; x <= L - 16; x += 15, i++) {
    const r = 3 + 2.4 * Math.abs(Math.sin(i * 0.9));
    paths.push(circlePath(x, cy, r));
  }
  return paths;
}

function diamonds(): string[] {
  const paths: string[] = [];
  const rx = 4.4;
  const ry = 6.2;
  const dx = rx * 2.4;
  const dy = ry * 1.7;
  let row = 0;
  for (let y = MARGIN + ry; y <= W - MARGIN - ry; y += dy, row++) {
    const offset = row % 2 ? dx / 2 : 0;
    for (let x = 14 + offset; x <= L - 14; x += dx) {
      paths.push(
        `M${x},${(y - ry).toFixed(2)} L${(x + rx).toFixed(2)},${y} L${x},${(y + ry).toFixed(2)} L${(x - rx).toFixed(2)},${y} Z`,
      );
    }
  }
  return paths;
}

function stripes(): string[] {
  const paths: string[] = [];
  const top = MARGIN + 1;
  const bot = W - MARGIN - 1;
  const half = 1.4;
  for (let x = 16; x <= L - 16; x += 9) {
    paths.push(
      `M${(x - half).toFixed(2)},${top} L${(x + half).toFixed(2)},${top} L${(x + half).toFixed(2)},${bot} L${(x - half).toFixed(2)},${bot} Z`,
    );
  }
  return paths;
}

function drops(): string[] {
  const paths: string[] = [];
  const cy = W / 2;
  const rx = 2.3;
  const ry = 7;
  for (let x = 15; x <= L - 15; x += 12) {
    // אליפסה מוטה קלות, מקורבת ל-4 עקומות בזייה
    paths.push(
      `M${x},${(cy - ry).toFixed(2)} C${(x + rx * 1.4).toFixed(2)},${(cy - ry * 0.4).toFixed(2)} ${(x + rx * 1.4).toFixed(2)},${(cy + ry * 0.4).toFixed(2)} ${x},${(cy + ry).toFixed(2)} C${(x - rx * 1.4).toFixed(2)},${(cy + ry * 0.4).toFixed(2)} ${(x - rx * 1.4).toFixed(2)},${(cy - ry * 0.4).toFixed(2)} ${x},${(cy - ry).toFixed(2)} Z`,
    );
  }
  return paths;
}

function waves(): string[] {
  const paths: string[] = [];
  const amp = 6;
  const thick = 2;
  for (let band = 0; band < 2; band++) {
    const midY = W / 2 + (band === 0 ? -8 : 8);
    let top = `M14,${midY.toFixed(2)}`;
    let bot = "";
    for (let x = 14; x <= L - 14; x += 4) {
      const yTop = midY + Math.sin(x * 0.09 + band) * amp - thick;
      top += ` L${x},${yTop.toFixed(2)}`;
    }
    for (let x = L - 14; x >= 14; x -= 4) {
      const yBot = midY + Math.sin(x * 0.09 + band) * amp + thick;
      bot += ` L${x},${yBot.toFixed(2)}`;
    }
    paths.push(`${top}${bot} Z`);
  }
  return paths;
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M${(cx - r).toFixed(2)},${cy} a${r},${r} 0 1,0 ${(2 * r).toFixed(2)},0 a${r},${r} 0 1,0 ${(-2 * r).toFixed(2)},0 Z`;
}

const GENERATORS: Record<PatternVariant, () => string[]> = {
  hexagons,
  waves,
  circles,
  diamonds,
  drops,
  stripes,
};

export default function PatternMark({
  variant,
  className,
}: {
  variant: PatternVariant;
  className?: string;
}) {
  const paths = GENERATORS[variant]();
  // פלטת RM JEWEL: אבן שטוחה (בלי גרדיאנט מטלי) עם חיתוכים בגרפיט.
  return (
    <svg
      viewBox={`0 0 ${L} ${W}`}
      className={className}
      role="img"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="1" y="1" width={L - 2} height={W - 2} rx="2" fill="#d8d2c8" stroke="rgba(32,35,38,0.12)" strokeWidth="1" />
      <g fill="#202326">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
