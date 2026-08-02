declare module "clipper-lib" {
  export interface IntPoint {
    X: number;
    Y: number;
  }
  export type Path = IntPoint[];
  export type Paths = Path[];

  export enum JoinType {
    jtSquare = 0,
    jtRound = 1,
    jtMiter = 2,
  }
  export enum EndType {
    etOpenSquare = 0,
    etOpenRound = 1,
    etOpenButt = 2,
    etClosedLine = 3,
    etClosedPolygon = 4,
  }
  export enum PolyType {
    ptSubject = 0,
    ptClip = 1,
  }
  export enum ClipType {
    ctIntersection = 0,
    ctUnion = 1,
    ctDifference = 2,
    ctXor = 3,
  }
  export enum PolyFillType {
    pftEvenOdd = 0,
    pftNonZero = 1,
    pftPositive = 2,
    pftNegative = 3,
  }

  export class PolyNode {
    Contour(): Path;
    Childs(): PolyNode[];
    IsHole(): boolean;
  }
  export class PolyTree extends PolyNode {
    Clear(): void;
  }

  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPaths(paths: Paths, joinType: JoinType, endType: EndType): void;
    Execute(solution: Paths | PolyTree, delta: number): void;
    Clear(): void;
  }

  export class Clipper {
    AddPaths(paths: Paths, polyType: PolyType, closed: boolean): boolean;
    Execute(
      clipType: ClipType,
      solution: Paths,
      subjFillType?: PolyFillType,
      clipFillType?: PolyFillType,
    ): boolean;
    static Area(path: Path): number;
    static CleanPolygons(paths: Paths, distance: number): Paths;
  }
}
