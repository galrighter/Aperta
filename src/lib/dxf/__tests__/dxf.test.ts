import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDxf } from "../dxf";
import { normalizeSvg } from "@/lib/geometry/normalize";
import { difference, rectPolygon } from "@/lib/geometry/poly";

function sampleDxf(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 15"><g id="cutouts">` +
    `<circle cx="40" cy="7.5" r="2"/><rect x="70" y="6" width="10" height="3" rx="1.5"/>` +
    `</g></svg>`;
  const n = normalizeSvg(svg, 160, 15);
  const material = difference([rectPolygon(0, 0, 160, 15)], n.cutUnion);
  return buildDxf({ lengthMm: 160, widthMm: 15, material });
}

describe("buildDxf", () => {
  it("produces a structurally valid R12 DXF", () => {
    const dxf = sampleDxf();
    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("OUTLINE");
    expect(dxf).toContain("CUTOUTS");
    expect(dxf.trim().endsWith("EOF"));
    // כל POLYLINE נסגר ב-SEQEND
    const polylines = dxf.match(/^POLYLINE$/gm)?.length ?? 0;
    const seqends = dxf.match(/^SEQEND$/gm)?.length ?? 0;
    expect(polylines).toBeGreaterThanOrEqual(3); // מתאר + 2 cutouts
    expect(seqends).toBe(polylines);
    // זוגות group-code/ערך תקינים: מספר שורות זוגי
    expect(dxf.trim().split("\n").length % 2).toBe(0);
  });

  it("round-trips through ezdxf when available", () => {
    const dxf = sampleDxf();
    const dir = mkdtempSync(join(tmpdir(), "dxf-"));
    const file = join(dir, "test.dxf");
    writeFileSync(file, dxf);
    let available = true;
    try {
      execFileSync("python3", ["-c", "import ezdxf"], { stdio: "pipe" });
    } catch {
      available = false;
    }
    if (!available) {
      console.warn("ezdxf not installed — skipping round-trip check");
      return;
    }
    const script = `
import ezdxf, sys
doc = ezdxf.readfile(sys.argv[1])
msp = doc.modelspace()
polys = [e for e in msp if e.dxftype() == "POLYLINE"]
assert len(polys) >= 3, f"expected >=3 polylines, got {len(polys)}"
layers = {e.dxf.layer for e in polys}
assert "OUTLINE" in layers and "CUTOUTS" in layers, layers
for p in polys:
    assert p.is_closed, "polyline not closed"
pts = [v.dxf.location for p in polys for v in p.vertices]
xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
assert 155 <= max(xs) <= 161, max(xs)
assert 13 <= max(ys) <= 16, max(ys)
print("ezdxf round-trip OK")
`;
    const out = execFileSync("python3", ["-c", script, file], { encoding: "utf8" });
    expect(out).toContain("ezdxf round-trip OK");
    // CI: שתי קריאות python3 סינכרוניות (cold start + import ezdxf) עלולות
    // לחרוג מ-5s ברירת המחדל של vitest — נותנים מרווח נדיב.
  }, 30_000);
});
