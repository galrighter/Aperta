import type { ProductType } from "@/lib/fabrication.config";
import type { ValidationReport, MultiPolygon } from "@/lib/geometry/types";

export interface Profile {
  id: string;
  name: string;
  color: string;
}

export interface Account {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface Design {
  id: string;
  profile_id?: string;
  /** המספר הסידורי הרץ. designCode() הופך אותו ל-"AP-0007". */
  serial?: number | null;
  name: string;
  product_type: ProductType;
  length_mm: number;
  width_mm: number;
  gap_mm: number;
  thickness_mm: number;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Version {
  id: string;
  design_id: string;
  version_no: number;
  svg: string;
  source: "generate" | "edit" | "auto_repair";
  user_prompt: string | null;
  validation_report: ValidationReport;
  validation_status: "pass" | "warn" | "fail";
  created_at: string;
  /** 0012 — ההצעות שהוצעו יחד עם הגרסה. undefined במסד שלפני המיגרציה. */
  candidates?: Array<{ svg: string; report: ValidationReport }> | null;
  generation_id?: string | null;
  picked_index?: number | null;
}

export interface Geometry {
  material: MultiPolygon;
  cutUnion: MultiPolygon;
}

export type Pt = [number, number];

export type Annotation =
  | { id: string; type: "pen"; points: Pt[] }
  | { id: string; type: "arrow"; from: Pt; to: Pt }
  | { id: string; type: "ellipse"; x0: number; y0: number; x1: number; y1: number }
  | { id: string; type: "text"; x: number; y: number; text: string };

export type AnnotationTool = "none" | "pen" | "arrow" | "ellipse" | "text" | "eraser";

export type GenStatus = "idle" | "generating" | "validating" | "repairing" | "error";
