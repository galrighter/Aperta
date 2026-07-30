"use client";

import { create } from "zustand";
import { he } from "@/i18n/he";
import { api, ClientApiError } from "./api";
import type {
  Annotation, AnnotationTool, Design, GenStatus, Geometry, Profile, Version,
} from "./types";
import { svgFrame } from "@/lib/geometry/frame";

interface StudioState {
  profiles: Profile[];
  profile: Profile | null;
  designs: Design[];
  design: Design | null;
  versions: Version[];
  /** אינדקס הגרסה המוצגת בתוך versions */
  versionIdx: number;
  geometry: Geometry | null;
  genStatus: GenStatus;
  genError: string | null;
  tab: "flat" | "3d" | "render";
  renderUrl: string | null;
  tool: AnnotationTool;
  annotations: Annotation[];
  drawerOpen: boolean;
  paramsOpen: boolean;
  validationOpen: boolean;
  /** בקשת מיקוד הקנבס בנקודה (מ"מ) — n מונוטוני כדי לזהות בקשה חדשה */
  focus: { x: number; y: number; n: number } | null;

  init: () => Promise<void>;
  selectProfile: (p: Profile) => Promise<void>;
  refreshDesigns: () => Promise<void>;
  newDesign: (productType: "bracelet" | "ring") => Promise<void>;
  openDesign: (id: string) => Promise<void>;
  closeDesign: () => void;
  renameDesign: (name: string) => Promise<void>;
  updateDims: (patch: { lengthMm?: number; widthMm?: number; gapMm?: number }) => Promise<void>;
  deleteDesign: (id: string) => Promise<void>;
  duplicateDesign: (id: string) => Promise<void>;
  generate: (prompt: string, images: Array<{ kind: "inspiration" | "annotation"; dataUrl: string }>) => Promise<boolean>;
  vectorize: (dataUrl: string, colorKey?: "coverage" | "warm" | "dark" | "saturation" | "auto") => Promise<boolean>;
  gotoVersion: (idx: number) => Promise<void>;
  setTab: (t: "flat" | "3d" | "render") => void;
  setTool: (t: AnnotationTool) => void;
  addAnnotation: (a: Annotation) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  setDrawerOpen: (v: boolean) => void;
  setParamsOpen: (v: boolean) => void;
  setValidationOpen: (v: boolean) => void;
  requestFocus: (x: number, y: number) => void;
}

const PROFILE_KEY = "studio.profileId";

export const currentVersion = (s: Pick<StudioState, "versions" | "versionIdx">): Version | null =>
  s.versions[s.versionIdx] ?? null;

export const useStudio = create<StudioState>((set, get) => ({
  profiles: [],
  profile: null,
  designs: [],
  design: null,
  versions: [],
  versionIdx: -1,
  geometry: null,
  genStatus: "idle",
  genError: null,
  tab: "flat",
  renderUrl: null,
  tool: "none",
  annotations: [],
  drawerOpen: false,
  paramsOpen: false,
  validationOpen: false,
  focus: null,

  init: async () => {
    const { profiles } = await api.profiles();
    set({ profiles });
    const savedId = typeof localStorage !== "undefined" ? localStorage.getItem(PROFILE_KEY) : null;
    const profile = profiles.find((p) => p.id === savedId) ?? profiles[0] ?? null;
    if (profile) await get().selectProfile(profile);
  },

  selectProfile: async (p) => {
    localStorage.setItem(PROFILE_KEY, p.id);
    set({ profile: p, design: null, versions: [], versionIdx: -1, geometry: null, annotations: [] });
    const { designs } = await api.designs(p.id);
    set({ designs });
  },

  refreshDesigns: async () => {
    const p = get().profile;
    if (!p) return;
    const { designs } = await api.designs(p.id);
    set({ designs });
  },

  newDesign: async (productType) => {
    const p = get().profile;
    if (!p) return;
    const { design } = await api.createDesign({ profileId: p.id, productType });
    set({ design, versions: [], versionIdx: -1, geometry: null, annotations: [], drawerOpen: false });
    await get().refreshDesigns();
  },

  openDesign: async (id) => {
    const { design, versions } = await api.getDesign(id);
    const idx = versions.findIndex((v) => v.id === design.current_version_id);
    set({
      design,
      versions,
      versionIdx: idx >= 0 ? idx : versions.length - 1,
      geometry: null,
      annotations: [],
      drawerOpen: false,
      genStatus: "idle",
      genError: null,
    });
    const v = currentVersion(get());
    if (v) await loadGeometry(set, design, v);
    set({ validationOpen: v != null && v.validation_status !== "pass" });
  },

  closeDesign: () => set({ design: null, versions: [], versionIdx: -1, geometry: null, annotations: [] }),

  renameDesign: async (name) => {
    const d = get().design;
    if (!d || !name.trim() || name === d.name) return;
    const { design } = await api.patchDesign(d.id, { name: name.trim() });
    set({ design });
    await get().refreshDesigns();
  },

  updateDims: async (patch) => {
    const d = get().design;
    if (!d) return;
    const { design } = await api.patchDesign(d.id, patch);
    set({ design });
    // אם יש עיצוב קיים — התאמה ע"י ה-AI (הדיאלוג באחריות ה-UI לפני הקריאה)
    const v = currentVersion(get());
    if (v) {
      await get().generate(
        "The strip dimensions changed. Adapt the existing design to the new dimensions, preserving the design intent.",
        [],
      );
    }
  },

  deleteDesign: async (id) => {
    await api.deleteDesign(id);
    if (get().design?.id === id) get().closeDesign();
    await get().refreshDesigns();
  },

  duplicateDesign: async (id) => {
    const { design } = await api.duplicateDesign(id);
    await get().refreshDesigns();
    await get().openDesign(design.id);
  },

  generate: async (prompt, images) => {
    const d = get().design;
    if (!d) return false;
    const v = currentVersion(get());
    set({ genStatus: "generating", genError: null });
    try {
      const res = await api.generate({
        designId: d.id,
        userPrompt: prompt,
        currentSvg: v?.svg ?? null,
        images,
      });
      // רענון העיצוב (current_version_id השתנה) והוספת הגרסה
      const { design, versions } = await api.getDesign(d.id);
      const idx = versions.findIndex((x) => x.id === res.version.id);
      set({
        design,
        versions,
        versionIdx: idx >= 0 ? idx : versions.length - 1,
        geometry: res.geometry,
        renderUrl: res.render?.url ?? null,
        genStatus: "idle",
        annotations: [],
        validationOpen: res.report.status !== "pass",
      });
      await get().refreshDesigns();
      return res.report.status !== "fail";
    } catch (e) {
      const msg = e instanceof ClientApiError ? e.message : he.errGeneric;
      set({ genStatus: "error", genError: msg });
      return false;
    }
  },

  vectorize: async (dataUrl, colorKey = "auto") => {
    const d = get().design;
    if (!d) return false;
    set({ genStatus: "generating", genError: null });
    try {
      const res = await api.vectorize({ designId: d.id, image: { dataUrl }, colorKey });
      const { design, versions } = await api.getDesign(d.id);
      const idx = versions.findIndex((x) => x.id === res.version.id);
      set({
        design,
        versions,
        versionIdx: idx >= 0 ? idx : versions.length - 1,
        geometry: res.geometry,
        renderUrl: dataUrl,
        genStatus: "idle",
        annotations: [],
        validationOpen: res.report.status !== "pass",
      });
      await get().refreshDesigns();
      return res.report.status !== "fail";
    } catch (e) {
      const msg = e instanceof ClientApiError ? e.message : he.errGeneric;
      set({ genStatus: "error", genError: msg });
      return false;
    }
  },

  gotoVersion: async (idx) => {
    const { versions, design } = get();
    if (!design || idx < 0 || idx >= versions.length) return;
    const v = versions[idx];
    set({ versionIdx: idx, annotations: [] });
    // מקבעים את הגרסה המוצגת כנוכחית (ניווט, לא מחיקה — סעיף 12.6)
    await api.patchDesign(design.id, { currentVersionId: v.id });
    set({ design: { ...design, current_version_id: v.id } });
    await loadGeometry(set, design, v);
  },

  setTab: (t) => set({ tab: t }),
  setTool: (t) => set({ tool: t }),
  addAnnotation: (a) => set((s) => ({ annotations: [...s.annotations, a] })),
  removeAnnotation: (id) => set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
  clearAnnotations: () => set({ annotations: [] }),
  setDrawerOpen: (v) => set({ drawerOpen: v }),
  setParamsOpen: (v) => set({ paramsOpen: v }),
  setValidationOpen: (v) => set({ validationOpen: v }),
  requestFocus: (x, y) => set((s) => ({ focus: { x, y, n: (s.focus?.n ?? 0) + 1 }, tab: "flat" })),
}));

async function loadGeometry(
  set: (partial: Partial<StudioState>) => void,
  design: Design,
  v: Version,
) {
  try {
    // המסגרת נקראת מה-SVG של הגרסה ולא מהרשומה: הרוחב בפועל עשוי להיבדל
    // מהרוחב שהוזמן עד כדי הסטייה המותרת, והוולידציה דורשת התאמה מדויקת.
    const frame = svgFrame(v.svg);
    const res = await api.validate({
      svg: v.svg,
      productType: design.product_type,
      lengthMm: frame?.lengthMm ?? Number(design.length_mm),
      widthMm: frame?.widthMm ?? Number(design.width_mm),
      thicknessMm: Number(design.thickness_mm),
    });
    set({ geometry: res.geometry });
  } catch {
    set({ geometry: null });
  }
}
