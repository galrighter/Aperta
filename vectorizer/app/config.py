"""Runtime configuration for the raster-to-SVG vectorizer.

Values come from the MVP spec (docs/research/IMAGE_TO_SVG_MVP_SPEC.md).
Everything here is a tunable knob — real generated bracelet images will
almost certainly force us to loosen the fidelity gates, so keep them here
and load from the environment rather than hard-coding at call sites.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _f(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


def _i(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


@dataclass(frozen=True)
class Settings:
    # input contract
    max_upload_mb: float = _f("MAX_UPLOAD_MB", 20)
    min_image_dimension: int = _i("MIN_IMAGE_DIMENSION", 256)
    max_image_dimension: int = _i("MAX_IMAGE_DIMENSION", 8192)
    max_aspect_ratio_error: float = _f("MAX_ASPECT_RATIO_ERROR", 0.01)
    max_dim_mm: float = _f("MAX_DIM_MM", 1000)

    # Fidelity gates. The meaningful guarantees are TOPOLOGY (exact hole/
    # component match — no feature lost) and MEAN contour deviation (the honest
    # average-error measure). IoU and MAX deviation are deliberately loose:
    #   - IoU is dominated by total boundary length, so smoothing a noisy AI
    #     render shifts every thin-band edge sub-pixel-uniformly and IoU falls
    #     to ~0.92 even though mean deviation is ~0.04mm and nothing is lost.
    #   - MAX deviation spikes on a single localized smoothing artifact.
    # Faithfully reproducing an AI render's pixel noise is not the goal; a clean
    # smooth manufacturable design that preserves the topology is. Calibrated on
    # real 40+ hole wavy cuffs. All env-overridable to tighten per use case.
    # IoU is length-biased — a faithful trace of a thin-line design still scores
    # ~0.80, so IoU is only a loose sanity floor. MEAN contour deviation is the
    # real faithfulness gate; topology (tolerant) guards feature preservation.
    min_iou_hard: float = _f("MIN_IOU_HARD", 0.75)
    target_iou: float = _f("TARGET_IOU", 0.75)
    max_mean_deviation_mm: float = _f("MAX_MEAN_DEVIATION_MM", 0.15)
    max_max_deviation_mm: float = _f("MAX_MAX_DEVIATION_MM", 4.0)
    # Topology tolerance: losing/gaining a few small holes on an AI render is
    # fine (the design intent survives); require the hole count within this
    # fraction (or a small absolute floor) and components within a small delta.
    hole_diff_frac: float = _f("HOLE_DIFF_FRAC", 0.2)
    hole_diff_abs: int = _i("HOLE_DIFF_ABS", 3)
    component_diff_abs: int = _i("COMPONENT_DIFF_ABS", 1)

    # candidate search
    max_candidates: int = _i("MAX_CANDIDATES", 15)

    # tracer backend: "opencv" (robust polygon baseline) or "vtracer" (smooth splines)
    tracer_backend: str = os.environ.get("TRACER_BACKEND", "opencv")

    # How a zero-width diagonal touch between two metal areas is resolved:
    # "minority" (potrace's default — the locally rarer colour keeps its
    # connection), "majority", "metal", "cutout", or "none" for OpenCV's old
    # implicit "always connected". See core/mask.resolve_diagonal_pinches.
    turn_policy: str = os.environ.get("TURN_POLICY", "minority")

    # Corner-aware cubic Bézier fitting of the emitted rings (core/curves.py).
    # This is the smoothing step: the error budget is the candidate's own
    # simplification tolerance, so the candidate sweep searches over it and the
    # fidelity gate scores the curves that actually get written.
    curve_fit: bool = os.environ.get("CURVE_FIT", "1").lower() not in ("0", "false", "no")
    # Turn sharper than this stays a corner. Above the ~17° a 1mm-radius arc
    # turns through one window, well below a 90° strip corner.
    curve_corner_deg: float = _f("CURVE_CORNER_DEG", 55.0)
    # Arc length the corner test looks across. Per-vertex angles cannot work:
    # every step of a raster staircase is a 90° turn.
    curve_window_mm: float = _f("CURVE_WINDOW_MM", 0.3)

    # Chaikin corner-cutting passes applied to the trace (0 = off). Superseded
    # by curve_fit, which decides corner-vs-staircase instead of cutting every
    # vertex alike; left switchable so the two can still be compared through the
    # fidelity gate. Running both would round real corners before the fit sees
    # them, so the default is off whenever curve fitting is on.
    smooth_iters: int = _i("SMOOTH_ITERS", 0)
    # Cap on how far one smoothing pass may move the boundary. Without it a
    # corner is cut by a quarter of its edge, which bends the four-corner strip
    # outline into a lens (measured: 5.11mm pull-in against a 4mm gate).
    max_smooth_cut_mm: float = _f("MAX_SMOOTH_CUT_MM", 0.4)

    # storage / lifecycle
    job_storage_dir: str = os.environ.get("JOB_STORAGE_DIR", "/tmp/raster-to-svg")
    job_ttl_minutes: int = _i("JOB_TTL_MINUTES", 60)
    # Held generations (see storage/generation_store.py). A *sibling* of the job
    # directory, never a child: JobStore deletes every directory under its own
    # base at startup, which would throw away exactly the paid results this
    # store exists to keep.
    generation_storage_dir: str = os.environ.get(
        "GENERATION_STORAGE_DIR",
        os.environ.get("JOB_STORAGE_DIR", "/tmp/raster-to-svg").rstrip("/") + "-generations",
    )

    # bearer token for /api/jobs* and /api/generate. Auth fails closed when this
    # is unset (see require_auth) — an open endpoint here spends the OpenAI key.
    auth_token: str = os.environ.get("VECTORIZER_TOKEN", "")

    # SSRF guard for the upload step: signed URLs are PUT to blindly. Internal/
    # loopback/link-local hosts and non-https are always refused; when this
    # allowlist is non-empty the host must also be in it (set UPLOAD_ALLOWED_HOSTS
    # to the storage host in production for a full lockdown).
    upload_allowed_hosts: tuple[str, ...] = tuple(
        h.strip().lower()
        for h in os.environ.get("UPLOAD_ALLOWED_HOSTS", "").split(",")
        if h.strip()
    )

    # /api/generate: the image-model key, and how many panels may be traced at
    # once. Concurrency is a memory knob — each in-flight trace holds a decoded
    # render — so it is capped here rather than by whatever forme asks for.
    openai_key: str = os.environ.get("OPENAI_KEY", "") or os.environ.get("OPENAI_API_KEY", "")
    generate_concurrency: int = _i("GENERATE_CONCURRENCY", 4)
    # How many whole generations may be in flight at once. `generate_concurrency`
    # bounds the traces *within* one run; this bounds the runs. Without it N
    # simultaneous customers each hold their decoded renders and open their own
    # pool of traces, so the memory ceiling is set by whoever happens to press
    # the button together — and the OOM killer takes the container down with
    # every run in it, including the ones already paid for.
    max_concurrent_generations: int = _i("MAX_CONCURRENT_GENERATIONS", 3)


SETTINGS = Settings()

# threshold offsets (added to the Otsu threshold) and simplification tolerances
# in millimetres — the raw candidate grid before the two-phase pruning.
THRESHOLD_OFFSETS = (-12, -6, 0, 6, 12)
TOLERANCE_MM = (0.01, 0.025, 0.05, 0.075, 0.1)
