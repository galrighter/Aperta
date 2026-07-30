"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import earcut from "earcut";
import { he } from "@/i18n/he";
import { useStudio } from "@/lib/client/store";
import { resolveFab, type ProductType } from "@/lib/fabrication.config";
import { neutralRadiusFromBlank } from "@/lib/sizing";
import type { MultiPolygon } from "@/lib/geometry/types";

// הדמיה תלת-ממדית — סעיף 9: טריאנגולציה של ה-material (earcut עם חורים),
// אקסטרוזיה לעובי, כיפוף לקשת סביב הציר הניטרלי, חומר בגוון פליז.
//
// Rolled3D מקבל הכל ב-props כדי שגם מסע היצירה של הלקוחה יוכל להשתמש בו;
// Preview3D הוא העטיפה של הסטודיו שמזינה אותו מה-store.
//
// הרדיוס מגיע מ-neutralRadiusFromBlank (אורך הפריסה הוא אורך הציר הניטרלי,
// והפער הוא מיתר) ולא מ-(L+gap)/2π. הנוסחה הישנה זיהתה את אורך הפריסה עם
// ההיקף הפנימי והציגה ID גדול ב-2·K·t — 1.5 מידות טבעת. ראו sizing-fit-review §3.

export interface Rolled3DProps {
  material: MultiPolygon;
  lengthMm: number;
  widthMm: number;
  gapMm: number;
  thicknessMm: number;
  /** קובע את מקדם K לכיפוף — בטבעת r/t נמוך ולכן K קטן יותר. */
  productType?: ProductType;
  /** צבע רקע לסצנה. null = שקוף, כדי שהרקע של המיכל יעבור מבעד. */
  background?: number | null;
  /** כיבוי אינטראקציה (הסיבוב האוטומטי ממשיך) — לשער המגע במובייל. */
  enabled?: boolean;
  /** הדפדפן לא נותן WebGL (או שההקשר אבד). מי שמעל מציג חלופה משלו. */
  onUnavailable?: () => void;
}

export function Rolled3D({
  material, lengthMm, widthMm, gapMm, thicknessMm, productType = "bracelet",
  background = 0xf4f1eb, enabled = true, onUnavailable,
}: Rolled3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  /**
   * WebGL אינו זמין תמיד: בכרום באנדרואיד עם הרבה לשוניות פתוחות ההקשר פשוט
   * לא נוצר, וגם כשהאצת החומרה כבויה או שהמכשיר ברשימת החסימה. `new
   * THREE.WebGLRenderer` זורק במקרה הזה, וזריקה מתוך אפקט של רכיב לקוח מפילה
   * את **כל** העמוד ל-"Application error: a client-side exception has
   * occurred". זה נמדד בייצור על טלפון אמיתי. ההדמיה היא תוספת על הפריסה,
   * ולכן כישלון שלה חייב להיות נפילה חיננית לתצוגה השטוחה ולא מסך לבן.
   */
  const [unavailable, setUnavailable] = useState(false);
  /** ברפ כדי שהאפקט יישאר חד-פעמי גם כשהקורא מעביר פונקציה חדשה בכל רנדר. */
  const unavailableCb = useRef(onUnavailable);
  unavailableCb.current = onUnavailable;

  const giveUp = useCallback(() => {
    setUnavailable(true);
    unavailableCb.current?.();
  }, []);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    mesh: THREE.Mesh | null;
    /** ממסגר את המצלמה סביב התיבה של המודל. נקרא גם בכל שינוי גודל. */
    fit: (() => void) | null;
  } | null>(null);

  // הקמת הסצנה פעם אחת
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      giveUp();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // הקנבס נמדד ע"י ה-CSS, לא ע"י התכולה שלו. בלי זה הוא נולד עם ברירת המחדל
    // של HTML — 300x150 כפול pixelRatio, כלומר 600px רוחב — ומכיוון שאלה
    // *מאפיינים* ולא CSS, הוא מותח את ההורה ואיתו את כל העמוד: במסך של 393px
    // המסמך יצא 622px, נוצרה גלילה אופקית, והכותרת נראתה זזה הצידה. שלושת
    // הקווים האלה הם הרצפה — גם אם מדידה כלשהי תיכשל, הוא לא יכול לחרוג.
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    mount.appendChild(canvas);

    // אובדן ההקשר — GPU שנפל או שהדפדפן לקח אותו בחזרה תחת לחץ זיכרון.
    // preventDefault שומר על האפשרות לשחזר; אנחנו לא מנסים, אלא עוברים לחלופה.
    const onContextLost = (e: Event) => {
      e.preventDefault();
      giveUp();
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    const scene = new THREE.Scene();
    scene.background = background === null ? null : new THREE.Color(background);
    // סביבת התאורה היא איכות תמונה בלבד. אם היא נכשלה (הקשר חלש/מוגבל) עדיף
    // חומר בלי השתקפויות מאשר לאבד את ההדמיה כולה.
    let pmrem: THREE.PMREMGenerator | null = null;
    try {
      pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    } catch {
      pmrem?.dispose();
      pmrem = null;
    }

    // עדשה ארוכה (28°) ולא רחבה: ב-40° הצד הקרוב של הטבעת יושב בערך פי 1.6
    // קרוב מהצד הרחוק, והדופן הקדמית נראית עבה בהרבה ממה שהיא. צילום תכשיטים
    // נעשה בעדשה ארוכה בדיוק מהסיבה הזה. המרחק גדל בהתאם, אז המסגור נשמר.
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 2000);
    camera.position.set(0, 40, 110);

    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(50, 80, 60);
    scene.add(dir);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
    });
    // OrbitControls כותב `touch-action: none` על הקנבס, ולכן במסך מגע כל
    // גרירה עליו — גם אנכית — נבלעת בסיבוב והעמוד מפסיק להיגלל. זו הסיבה
    // שהייתה קודם נגיעה מקדימה שמפעילה את הסיבוב. `pan-y` מחזיר את הגלילה
    // האנכית לדפדפן ומשאיר את הגרירה האופקית לשליטה: הסיבוב זמין מיד, בלי
    // ללכוד את העמוד. חייב לרוץ *אחרי* בניית ה-controls — הוא זה שכותב את זה.
    canvas.style.touchAction = "pan-y";

    const resize = () => {
      const r = mount.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // updateStyle=false: הגודל הפיזי של הבאפר נגזר מהמדידה, אבל הגודל בפריסה
      // נשאר 100% מהמיכל — כך הקנבס לעולם לא מכתיב רוחב למי שמעליו.
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      // המסגור תלוי ביחס הצדדים: בקנבס צר שדה הראייה האופקי קטן מהאנכי,
      // ולכן מסגור שנקבע פעם אחת בלבד גולש מהמסגרת ברגע שהמידות משתנות.
      sceneRef.current?.fit?.();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // זריקה מתוך requestAnimationFrame היא חריגה גלובלית לא מטופלת, ולכן גם
      // כאן עוצרים ועוברים לחלופה במקום להפיל את העמוד — שישים פעם בשנייה.
      try {
        controls.update();
        renderer.render(scene, camera);
      } catch {
        cancelAnimationFrame(raf);
        giveUp();
      }
    };
    loop();

    sceneRef.current = { renderer, scene, camera, controls, mesh: null, fit: null };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      controls.dispose();
      pmrem?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
    // הסצנה נבנית פעם אחת; ה-background מסונכרן באפקט נפרד.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // שער האינטראקציה — הסיבוב האוטומטי ממשיך גם כשהשליטה כבויה.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (ctx) ctx.controls.enabled = enabled;
  }, [enabled]);

  useEffect(() => {
    const ctx = sceneRef.current;
    if (ctx) ctx.scene.background = background === null ? null : new THREE.Color(background);
  }, [background]);

  // עדכון המודל בכל שינוי גרסה/גיאומטריה
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !material.length) return;
    if (ctx.mesh) {
      ctx.scene.remove(ctx.mesh);
      ctx.mesh.geometry.dispose();
      (ctx.mesh.material as THREE.Material).dispose();
      ctx.mesh = null;
    }
    const L = lengthMm;
    const gap = gapMm;
    const t = thicknessMm;
    const W = widthMm;
    const k = resolveFab(t, productType).kFactor;
    // גיאומטריה חריגה (מצולע פגום, מידות אפס) לא אמורה להפיל את המסע כולו.
    let geo: THREE.BufferGeometry;
    try {
      geo = buildBentGeometry(material, L, W, gap, t, k);
    } catch {
      giveUp();
      return;
    }
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd9b14c,
      metalness: 1.0,
      roughness: 0.22,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    ctx.scene.add(mesh);
    ctx.mesh = mesh;

    // מסגור לפי התיבה של המודל עצמו ולא לפי נוסחה על הרדיוס: רוחב הרצועה
    // (עד 80 מ"מ בצמיד) לא נכנס ל-R בכלל, ולכן מסגור שנגזר מ-R בלבד חתך את
    // המודל ברגע שהרצועה רחבה או שהקנבס צר. כאן המרכז והמרחק נמדדים.
    geo.computeBoundingSphere();
    const sphere = geo.boundingSphere;
    if (sphere) {
      const fit = () => {
        const cam = ctx.camera;
        const vFov = (cam.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
        // הציר הצר קובע: בקנבס אנכי זה האופקי, בקנבס רחב זה האנכי.
        const dist = (sphere.radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.12;
        const c = sphere.center;
        ctx.controls.target.copy(c);
        // שמירה על כיוון הצפייה הקיים (הגרירה של המשתמש) — רק המרחק מתעדכן.
        const dirTo = cam.position.clone().sub(c);
        if (dirTo.lengthSq() < 1e-6) dirTo.set(0, 0.34, 1);
        cam.position.copy(c).add(dirTo.normalize().multiplyScalar(dist));
        cam.near = Math.max(0.1, dist - sphere.radius * 2);
        cam.far = dist + sphere.radius * 4;
        cam.updateProjectionMatrix();
        ctx.controls.update();
      };
      // מסגור ראשון מזווית קבועה — מעט מלמעלה, כדי שהפתח יפנה למצלמה.
      ctx.camera.position.set(sphere.center.x, sphere.center.y + sphere.radius * 0.34, sphere.center.z + sphere.radius);
      ctx.fit = fit;
      fit();
    }
  }, [material, lengthMm, widthMm, gapMm, thicknessMm, productType, giveUp]);

  // מי שמעל קיבל `onUnavailable` ומציג חלופה משלו; לשאר נשארת אמירה מפורשת,
  // כי מסך ריק במקום ההדמיה נראה כמו תקלה בלי שם.
  if (unavailable) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-mist">
        {he.err3dUnavailable}
      </div>
    );
  }

  return <div ref={mountRef} className="h-full w-full" style={{ direction: "ltr" }} />;
}

/** עטיפת הסטודיו — מזינה את ההדמיה מה-store. */
export function Preview3D() {
  const s = useStudio();
  const design = s.design;
  const geometry = s.geometry;

  if (!design || !geometry) {
    return <div className="flex h-full items-center justify-center text-sm text-mist">…</div>;
  }
  return (
    <Rolled3D
      material={geometry.material}
      lengthMm={Number(design.length_mm)}
      widthMm={Number(design.width_mm)}
      gapMm={Number(design.gap_mm)}
      thicknessMm={Number(design.thickness_mm)}
      productType={design.product_type}
    />
  );
}

/**
 * בניית BufferGeometry: משטח עליון+תחתון מטריאנגולציית earcut, דפנות לאורך
 * כל הטבעות (חיצוניות ופנימיות), ואז כיפוף כל vertex לקשת.
 *
 * הכיפוף מזיז רק קודקודים — משולש שמשתרע לאורך ציר X נשאר מיתר ישר ולכן
 * הקשת נראית מרובעת. לפני הכיפוף מפצלים כל משולש/דופן עד שטווח ה-X שלו
 * קטן מצעד הקשת (רק X משפיע על הכיפוף, אז משולשים צרים-גבוהים תקינים).
 */
function buildBentGeometry(
  material: MultiPolygon,
  L: number,
  W: number,
  gap: number,
  thickness: number,
  kFactor: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  // צעד הקשת: ~1.5° לפאה — חלק לעין גם בזום
  const step = Math.max(0.6, (L + gap) / 240);

  type V3 = [number, number, number];
  const lerpAtX = (p: V3, q: V3, x: number): V3 => {
    const t = (x - p[0]) / (q[0] - p[0]);
    return [x, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  };
  // חצי-מישור אנכי (Sutherland–Hodgman) — שומר על כיוון ה-winding
  const clipHalf = (pts: V3[], inside: (x: number) => boolean, atX: number): V3[] => {
    const out: V3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const pin = inside(p[0]), qin = inside(q[0]);
      if (pin) out.push(p);
      if (pin !== qin) out.push(lerpAtX(p, q, atX));
    }
    return out;
  };
  // חיתוך משולש לפרוסות X ברוחב step וטריאנגולציית מניפה של כל פרוסה
  const pushTri = (a: V3, b: V3, c: V3) => {
    const minX = Math.min(a[0], b[0], c[0]);
    const maxX = Math.max(a[0], b[0], c[0]);
    if (maxX - minX <= step) {
      positions.push(...a, ...b, ...c);
      return;
    }
    for (let lo = minX; lo < maxX - 1e-9; lo += step) {
      const hi = Math.min(lo + step, maxX);
      let poly: V3[] = [a, b, c];
      poly = clipHalf(poly, (x) => x >= lo - 1e-9, lo);
      poly = clipHalf(poly, (x) => x <= hi + 1e-9, hi);
      for (let i = 1; i + 1 < poly.length; i++) {
        positions.push(...poly[0], ...poly[i], ...poly[i + 1]);
      }
    }
  };

  for (const poly of material) {
    // earcut: מערך שטוח + אינדקסי חורים
    const flat: number[] = [];
    const holeIdx: number[] = [];
    for (const [ri, ring] of poly.entries()) {
      if (ri > 0) holeIdx.push(flat.length / 2);
      for (const [x, y] of ring) flat.push(x, y);
    }
    const tris = earcut(flat, holeIdx.length ? holeIdx : undefined);
    const v = (i: number, z: number): V3 => [flat[i * 2], flat[i * 2 + 1], z];
    // משטח עליון (z=t) ותחתון (z=0), כיווני winding הפוכים
    for (let i = 0; i < tris.length; i += 3) {
      pushTri(v(tris[i], thickness), v(tris[i + 1], thickness), v(tris[i + 2], thickness));
      pushTri(v(tris[i], 0), v(tris[i + 2], 0), v(tris[i + 1], 0));
    }
  }
  // המשטחים העליון/תחתון מקבלים נורמלים רדיאליים אנליטיים אחרי הכיפוף
  const faceVertexCount = positions.length / 3;

  for (const poly of material) {
    // דפנות — מחלקים כל קטע לפי טווח ה-X שלו
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i];
        const q = ring[(i + 1) % ring.length];
        const n = Math.max(1, Math.ceil(Math.abs(q[0] - p[0]) / step));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const x0 = p[0] + (q[0] - p[0]) * t0, y0 = p[1] + (q[1] - p[1]) * t0;
          const x1 = p[0] + (q[0] - p[0]) * t1, y1 = p[1] + (q[1] - p[1]) * t1;
          const a: V3 = [x0, y0, 0], b: V3 = [x1, y1, 0];
          const a2: V3 = [x0, y0, thickness], b2: V3 = [x1, y1, thickness];
          positions.push(...a, ...b, ...b2);
          positions.push(...a, ...b2, ...a2);
        }
      }
    }
  }

  // כיפוף: θ=(x−L/2)/R_n + היסט של π כך שמרכז הטבעת בראשית והמפתח מול המצלמה.
  // x נמדד על הציר הניטרלי (זה מה שאורך הפריסה מייצג), ולכן הזווית נגזרת מ-R_n.
  // z רץ מ-0 (פנים) עד thickness (חוץ), והפנים יושבים ב-R_n − K·t.
  const Rn = neutralRadiusFromBlank(L, gap);
  const rInner = Rn - kFactor * thickness;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const theta = (x - L / 2) / Rn + Math.PI;
    positions[i] = (rInner + z) * Math.sin(theta);
    positions[i + 1] = W / 2 - y; // ציר Y של SVG כלפי מטה → הפוך לתצוגה
    positions[i + 2] = (rInner + z) * Math.cos(theta);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();

  // נורמלים אנליטיים למשטחים הכפופים — פני מתכת חלקים במקום פאות שטוחות
  const norm = geo.getAttribute("normal") as THREE.BufferAttribute;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < faceVertexCount; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const len = Math.hypot(x, z) || 1;
    const rx = x / len, rz = z / len;
    const sign = Math.sign(norm.getX(i) * rx + norm.getZ(i) * rz) || 1;
    norm.setXYZ(i, sign * rx, 0, sign * rz);
  }
  norm.needsUpdate = true;
  return geo;
}
