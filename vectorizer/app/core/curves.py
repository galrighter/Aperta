"""Corner-aware cubic Bézier fitting — the traced polygon becomes real curves.

The tracer produces a polygon: every ring is a chain of short straight segments
following the raster staircase. Chaikin corner-cutting used to be what turned
that into something smooth, but it is blind — it moves every vertex by the same
clamped amount whether that vertex is a genuine 90° corner of the strip or a
one-pixel jag on an arc. Real corners get rounded off and real arcs stay
faceted, and no parameter fixes both at once.

This does what potrace's published algorithm does — the idea, not its GPL code:
classify each vertex as a corner or not, then fit cubic Béziers to the smooth
runs *between* corners, subdividing a run until every input point lies within
``max_error`` of the curve. Corners survive exactly, staircases smaller than the
error budget vanish into the curve, and a run that is already straight stays a
straight line (which is what keeps the stock edges dead straight after the
boundary snap).

The error budget is the candidate's own simplification tolerance, so the
existing candidate sweep already searches over "how much smoothing", and the
fidelity gate — which rasterises the emitted SVG, curves and all — picks the
winner. Nothing here decides quality on appearance.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

Pt = tuple[float, float]
#: ``("L", to)`` or ``("C", c1, c2, to)`` — the two path commands we emit.
Segment = tuple

#: Depth cap for the subdivide-until-it-fits recursion. A run that still misses
#: the budget this deep is pathological (usually a degenerate ring); accepting
#: the current fit is better than splitting down to per-point segments.
_MAX_DEPTH = 12


@dataclass(frozen=True)
class CurveSettings:
    """How aggressively to fit, in millimetres and degrees."""

    max_error_mm: float
    corner_deg: float
    window_mm: float


@dataclass(frozen=True)
class FittedRing:
    start: Pt
    segments: list[Segment]

    @property
    def anchor_count(self) -> int:
        return len(self.segments)

    @property
    def curve_count(self) -> int:
        return sum(1 for s in self.segments if s[0] == "C")


# --- small vector helpers ---------------------------------------------------


def _unit(v: Pt) -> Pt:
    d = math.hypot(v[0], v[1])
    return (v[0] / d, v[1] / d) if d > 1e-12 else (0.0, 0.0)


def _dist(a: Pt, b: Pt) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _point_to_segment(p: Pt, a: Pt, b: Pt) -> float:
    vx, vy = b[0] - a[0], b[1] - a[1]
    L2 = vx * vx + vy * vy
    if L2 < 1e-24:
        return _dist(p, a)
    t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2
    t = max(0.0, min(1.0, t))
    return _dist(p, (a[0] + t * vx, a[1] + t * vy))


# --- corner detection -------------------------------------------------------


def _corner_angles(pts: list[Pt], window: float) -> list[float]:
    """Turn angle at each vertex, measured across ``window`` of arc length.

    Measuring over a window rather than between immediate neighbours is the
    whole point: on a raster staircase every single vertex is a 90° turn, so a
    per-vertex angle calls the entire outline a corner. Over a window, a
    staircase reads as the gentle turn it approximates and only a real corner
    keeps its angle.
    """
    n = len(pts)
    seg = [_dist(pts[i], pts[(i + 1) % n]) for i in range(n)]

    def walk(i: int, step: int) -> int:
        d = 0.0
        j = i
        for _ in range(n - 1):
            d += seg[j if step > 0 else (j - 1) % n]
            j = (j + step) % n
            if d >= window:
                break
        return j

    angles = [0.0] * n
    for i in range(n):
        a, b, c = pts[walk(i, -1)], pts[i], pts[walk(i, +1)]
        v1 = _unit((b[0] - a[0], b[1] - a[1]))
        v2 = _unit((c[0] - b[0], c[1] - b[1]))
        if v1 == (0.0, 0.0) or v2 == (0.0, 0.0):
            continue
        dot = max(-1.0, min(1.0, v1[0] * v2[0] + v1[1] * v2[1]))
        angles[i] = math.acos(dot)
    return angles


def _corner_indices(pts: list[Pt], angles: list[float], corner_rad: float, window: float) -> list[int]:
    """Vertices that turn more than ``corner_rad``, one per window.

    Without the local-maximum test a single physical corner blunted by
    anti-aliasing arrives as three or four consecutive over-threshold vertices,
    and splitting at each of them emits a burst of tiny segments exactly where
    the eye is most likely to look.

    The comparison is strictly bounded by the window. Suppressing against the
    immediate neighbour regardless of distance is wrong in the case that matters
    most: where a long straight edge meets a curve at one end and a 90° corner at
    the other, the two are the only vertices on the ring that turn at all, and
    the sharper one silently deleted the other.
    """
    n = len(pts)
    seg = [_dist(pts[i], pts[(i + 1) % n]) for i in range(n)]
    out: list[int] = []
    for i in range(n):
        if angles[i] < corner_rad:
            continue
        best = True
        for step in (-1, 1):
            d = 0.0
            j = i
            while True:
                d += seg[j if step > 0 else (j - 1) % n]
                if d > window:
                    break
                j = (j + step) % n
                if j == i:
                    break
                # ties go to the lower index so the choice is deterministic
                if angles[j] > angles[i] or (angles[j] == angles[i] and j < i):
                    best = False
                    break
            if not best:
                break
        if best:
            out.append(i)
    return out


def _runs(pts: list[Pt], corners: list[int]) -> list[list[Pt]]:
    """Split the closed ring into open runs, each corner to the next."""
    n = len(pts)
    if not corners:
        return []
    if len(corners) == 1:
        i = corners[0]
        return [[pts[(i + k) % n] for k in range(n + 1)]]
    runs = []
    for a, b in zip(corners, corners[1:] + corners[:1]):
        run = [pts[a]]
        i = a
        while i != b:
            i = (i + 1) % n
            run.append(pts[i])
        runs.append(run)
    return runs


# --- least-squares cubic fit ------------------------------------------------


def _chord_params(pts: list[Pt]) -> list[float]:
    d = [0.0]
    for i in range(1, len(pts)):
        d.append(d[-1] + _dist(pts[i - 1], pts[i]))
    total = d[-1]
    if total <= 1e-12:
        last = max(len(pts) - 1, 1)
        return [i / last for i in range(len(pts))]
    return [x / total for x in d]


def _cubic_at(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: float) -> Pt:
    mt = 1.0 - t
    b0, b1, b2, b3 = mt**3, 3 * t * mt * mt, 3 * t * t * mt, t**3
    return (
        p0[0] * b0 + c1[0] * b1 + c2[0] * b2 + p3[0] * b3,
        p0[1] * b0 + c1[1] * b1 + c2[1] * b2 + p3[1] * b3,
    )


def _fit_cubic(pts: list[Pt], ts: list[float], t0: Pt, t1: Pt) -> tuple[Pt, Pt]:
    """Least-squares cubic through fixed endpoints with fixed end tangents.

    Only the two control-point distances are free (``P1 = P0 + a1*t0``,
    ``P2 = P3 + a2*t1``), which is what keeps the curve tangent-continuous with
    its neighbours in the run and pinned to the traced endpoints.
    """
    p0, p3 = pts[0], pts[-1]
    c11 = c12 = c22 = x1 = x2 = 0.0
    for p, t in zip(pts, ts):
        mt = 1.0 - t
        b0, b1, b2, b3 = mt**3, 3 * t * mt * mt, 3 * t * t * mt, t**3
        a1 = (t0[0] * b1, t0[1] * b1)
        a2 = (t1[0] * b2, t1[1] * b2)
        c11 += a1[0] * a1[0] + a1[1] * a1[1]
        c12 += a1[0] * a2[0] + a1[1] * a2[1]
        c22 += a2[0] * a2[0] + a2[1] * a2[1]
        rx = p[0] - (p0[0] * (b0 + b1) + p3[0] * (b2 + b3))
        ry = p[1] - (p0[1] * (b0 + b1) + p3[1] * (b2 + b3))
        x1 += rx * a1[0] + ry * a1[1]
        x2 += rx * a2[0] + ry * a2[1]

    chord = _dist(p0, p3)
    det = c11 * c22 - c12 * c12
    if abs(det) < 1e-12:
        a1_len = a2_len = chord / 3.0
    else:
        a1_len = (x1 * c22 - x2 * c12) / det
        a2_len = (c11 * x2 - c12 * x1) / det
    # A non-positive or absurdly long arm folds the curve back on itself; the
    # classic third-of-the-chord is the safe fallback.
    #
    # **The ceiling is one chord, not three** (18.8). Three was not a limit: an
    # arm longer than the chord is exactly what makes a cubic loop over itself,
    # so the guard admitted the shape it was written to reject. Measured on
    # AP-0317 — 33 near-parallel slots, the case that shows it — the fitted
    # rings came back like this:
    #
    #     ceiling   self-intersecting rings   holes source/vector   IoU
    #       3.0            10 of 34                32 / 34         0.9899
    #       2.0             2 of 34                32 / 33         0.9897
    #       1.0             0 of 34                32 / 32         0.9898
    #
    # A looped ring is not a cosmetic defect. The boolean union downstream
    # resolves the crossing into a main polygon plus hairline artefacts, and
    # where the loop sits the outline bulges into the neighbouring rib: on
    # AP-0317 two ribs of 2.8mm reached the customer at 0.74mm and 1.12mm,
    # while every other rib in the piece stayed at 2.8. In a repeating pattern
    # that is the whole design.
    #
    # Nothing above catches it. `geometry_stats` counts self-intersections on
    # the traced polygon, before this fit runs, and the fidelity gate scores
    # area — a loop of 0.003mm² moves IoU by 0.0001, which is exactly what the
    # table shows. So the fit has to not produce it.
    #
    # The fidelity cost of the tighter ceiling is that 0.0001 of IoU. 0.67
    # (the ratio that draws a circular arc) is equally clean and was left on
    # the table: one chord is the standard bound and keeps more of the fit's
    # freedom on genuinely long smooth runs.
    if not (1e-6 * chord <= a1_len <= 1.0 * chord) or not (1e-6 * chord <= a2_len <= 1.0 * chord):
        a1_len = a2_len = chord / 3.0
    return (
        (p0[0] + a1_len * t0[0], p0[1] + a1_len * t0[1]),
        (p3[0] + a2_len * t1[0], p3[1] + a2_len * t1[1]),
    )


def _worst_error(pts: list[Pt], ts: list[float], c1: Pt, c2: Pt) -> tuple[float, int]:
    p0, p3 = pts[0], pts[-1]
    worst, at = 0.0, len(pts) // 2
    for i, (p, t) in enumerate(zip(pts, ts)):
        e = _dist(p, _cubic_at(p0, c1, c2, p3, t))
        if e > worst:
            worst, at = e, i
    return worst, at


def _straight_error(pts: list[Pt]) -> float:
    a, b = pts[0], pts[-1]
    return max(_point_to_segment(p, a, b) for p in pts)


def _direction(pts: list[Pt], i: int, step: int, window: float) -> Pt:
    """Unit tangent at endpoint ``i`` of an open run, averaged over ``window``."""
    base = pts[i]
    d = 0.0
    j = i
    while 0 <= j + step < len(pts):
        d += _dist(pts[j], pts[j + step])
        j += step
        if d >= window:
            break
    return _unit((pts[j][0] - base[0], pts[j][1] - base[1]))


def _fit_run(pts: list[Pt], t0: Pt, t1: Pt, s: CurveSettings, depth: int = 0) -> list[Segment]:
    if len(pts) < 3:
        return [("L", pts[-1])]
    if _straight_error(pts) <= s.max_error_mm:
        return [("L", pts[-1])]

    ts = _chord_params(pts)
    c1, c2 = _fit_cubic(pts, ts, t0, t1)
    err, at = _worst_error(pts, ts, c1, c2)
    if err <= s.max_error_mm:
        return [("C", c1, c2, pts[-1])]
    if depth >= _MAX_DEPTH:
        # Out of subdivisions and still outside the budget. The budget is a
        # promise the fidelity gate is entitled to rely on, so fall back to the
        # traced points themselves — ugly, bounded, and never worse than the
        # input — rather than shipping a curve that misses it.
        return [("L", p) for p in pts[1:]]

    at = min(max(at, 1), len(pts) - 2)
    mid = _unit((pts[at + 1][0] - pts[at - 1][0], pts[at + 1][1] - pts[at - 1][1]))
    return _fit_run(pts[: at + 1], t0, (-mid[0], -mid[1]), s, depth + 1) + _fit_run(
        pts[at:], mid, t1, s, depth + 1
    )


# --- public entry point -----------------------------------------------------


def _dedupe_closed(coords) -> list[Pt]:
    pts = [(float(x), float(y)) for x, y in coords]
    if len(pts) > 1 and _dist(pts[0], pts[-1]) < 1e-9:
        pts = pts[:-1]
    out: list[Pt] = []
    for p in pts:
        if not out or _dist(out[-1], p) > 1e-9:
            out.append(p)
    return out


def fit_ring(coords, s: CurveSettings) -> FittedRing:
    """Fit one closed ring; the last segment lands back on ``start``."""
    pts = _dedupe_closed(coords)
    if len(pts) < 3:
        start = pts[0] if pts else (0.0, 0.0)
        return FittedRing(start, [("L", p) for p in pts[1:]] or [("L", start)])

    angles = _corner_angles(pts, s.window_mm)
    corners = _corner_indices(pts, angles, math.radians(s.corner_deg), s.window_mm)
    if not corners:
        # A ring with no corner at all (a circle, a blob) still needs a seam;
        # putting it at the sharpest vertex hides the one discontinuity the fit
        # can produce in the place where the outline is least smooth anyway.
        corners = [max(range(len(pts)), key=lambda i: angles[i])]

    segments: list[Segment] = []
    runs = _runs(pts, corners)
    for run in runs:
        t0 = _direction(run, 0, +1, s.window_mm)
        t1 = _direction(run, len(run) - 1, -1, s.window_mm)
        segments.extend(_fit_run(run, t0, t1, s))
    return FittedRing(runs[0][0], segments)
