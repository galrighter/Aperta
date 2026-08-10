# forme vectorizer — image → SVG (faithful, verified)

Standalone service that turns a **two-tone flat bracelet PNG + physical
dimensions** into a clean, closed-path **cutouts SVG** — and proves fidelity by
rendering the result back to a raster and comparing it to the source. It does
**not** design, edit, kerf-compensate, or apply laser design-rules; forme's
existing engine still owns normalize/validate/DXF/3D. Spec + research live in
[`../docs/research/`](../docs/research).

## Why a separate service

forme runs on Cloudflare Workers, which can't run Python/OpenCV/VTracer/resvg.
This service is a Docker container meant to run on the **Hetzner box**; forme
calls it over HTTP and feeds the returned `cutouts_svg` into its normal pipeline.

## Pipeline

```
PNG + mm  →  Otsu binarize  →  resolve zero-width diagonal touches (turn policy)
          →  trace (OpenCV baseline / VTracer)
          →  scale to mm + snap to stock edges  →  cleanup (Shapely)
          →  corner-aware Bézier fit  →  build metal.svg + cutouts.svg
          →  render back (resvg)
          →  IoU + contour deviation + topology  →  select best / reject
```

Fidelity gate is the point: **no SVG is approved on appearance alone.** Multiple
candidates (threshold × simplification) are generated and the most faithful one
that preserves topology wins; if none clears the hard gate, the job is rejected.

## Run locally

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"

# quick CLI test on any PNG
python scripts/make_fixture.py --out fixture.png      # or bring your own
python -m app.cli fixture.png --width 160 --height 15 --out out/
#   -> out/{metal.svg,cutouts.svg,rendered.png,difference.png,overlay.png,result.json}

# condition a real (shaded, coloured) design render into a clean two-tone PNG
python -m scripts.prep_image render.png --height 15 --out conditioned.png
python -m app.cli conditioned.png --width <printed> --height 15 --out out/

# the HTTP service
uvicorn app.api.main:app --reload --port 8000
pytest -q
```

## Run with Docker (Hetzner)

```bash
docker build -t forme-vectorizer .
docker run -p 8000:8000 -e VECTORIZER_TOKEN=some-secret forme-vectorizer
curl localhost:8000/api/health
```

### Automated deploy

`.github/workflows/deploy-vectorizer.yml` SSHes into the Hetzner box, rsyncs
`vectorizer/`, rebuilds the image, and restarts the container. It runs on pushes
to `main` touching `vectorizer/**`, or via **workflow_dispatch**.

Required repo secrets: `HETZNER_SSH` (private key), `HETZNER_HOST`, `HETZNER_USER`,
and `OPENAI_KEY` (the image model, for `/api/generate`).
Optional: `HETZNER_PORT` (default 22), `VECTORIZER_TOKEN` (bearer token gating the
job endpoints — `/api/health` stays open), `GENERATE_CONCURRENCY` (how many panels
are traced at once, default 4 — a memory knob). The box needs Docker installed.

> The container publishes `:8000` on all interfaces, protected by the bearer
> token. Put a TLS reverse proxy (Caddy/nginx) in front before production
> traffic — a token over plain HTTP is fine for testing, not for real images.

## HTTP API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET  | `/api/health` | liveness + active tracer backend |
| POST | `/api/generate` | JSON `prompt,calls,rows,height_mm,color_key,[inspiration],[base_svg],[artifacts]` → renders + splits + traces every row, uploads the artifacts, returns one candidate per panel. `base_svg` is an edit: the current design, rasterised here and given to the image model as the reference (it wins over `inspiration`) |
| POST | `/api/jobs` | multipart `image,height_mm,[width_mm],dark_region_role,output_mode,condition,color_key` → result.json + inline `cutouts_svg`/`metal_svg` |
| GET  | `/api/jobs/{id}` | job status + result |
| GET  | `/api/jobs/{id}/files/{name}` | download a fixed-name artifact |
| DELETE | `/api/jobs/{id}` | delete a job |

```bash
# already-two-tone image (supply width_mm)
curl -F image=@fixture.png -F width_mm=160 -F height_mm=15 localhost:8000/api/jobs

# raw metallic render — condition to two-tone + smooth in one call
# (width_mm is derived from the cropped metal; only height_mm is needed)
curl -F image=@render.png -F height_mm=15 -F condition=true -F color_key=warm localhost:8000/api/jobs
```

### `/api/generate` — a whole customer generation

`/api/jobs` traces one image. `/api/generate` runs the heavy half of forme's own
`/api/generate`: it asks the image model for `calls` renders, cuts each into its
`rows` bands, traces every band, and returns one candidate per band.

It exists because that work cannot run where it used to. A short, wide piece
(a 53×10mm ring) plans to four renders, and four 1536×1024 PNGs decoded, cropped
and re-encoded in JS — plus four debug payloads buffered whole — exceed what a
Cloudflare isolate may spend (128MB, hard CPU ceiling). The run was killed
*after* the pipeline had already succeeded: the customer saw `503`, and nothing
was saved. None of that is edge work.

What deliberately stayed in forme: the plan (`rows`/`calls`), the prompt (it
carries the fabrication minimums from `resolveFab()`), and the verdict on whether
a candidate can be manufactured. One geometry engine, in TypeScript.

Artifacts are uploaded by this service, but it holds **no storage credentials**:
forme mints a short-lived signed upload URL per path and passes them in
`artifacts` (`renders: [url]`, `stages: {conditioned,overlay,difference,rendered}`).
The response reports which of them landed. Omit `artifacts` and nothing is
uploaded.

```bash
curl -X POST localhost:8000/api/generate -H 'content-type: application/json' -d '{
  "prompt": "flat top-down render of a pierced ring strip ...",
  "calls": 4, "rows": 1, "height_mm": 10, "color_key": "dark"
}'
```

Needs `OPENAI_KEY` in the container env (the deploy workflow passes the repo
secret of the same name). Without it the endpoint returns 422 `RENDER_FAILED`;
`/api/jobs` is unaffected.

A failure of the image model answers **422**, not 5xx, and that is deliberate:
forme calls this service from a Cloudflare Worker, and Cloudflare replaces the
body of a 502 with its own error page. On the old status the JSON below never
survived the trip — forme logged `Render service returned non-JSON (502): error
code: 502` for a run whose real cause (a spent OpenAI budget, 30.7.26) was
sitting in a body nobody ever saw. A spent budget answers `QUOTA_EXHAUSTED`
rather than `RENDER_FAILED`, which is what lets forme mail someone about the one
failure no retry can fix.

With `condition=true` the service colour-keys the metal (`color_key`:
`warm`|`dark`|`saturation`), crops, denoises and smooths the render into a clean
two-tone image before tracing — so a raw shaded bracelet render goes straight to
a smooth SVG in a single call.

## Config (env)

Fidelity gates and the candidate grid are tunable — real generated images will
likely force loosening. See `app/config.py`. Key knobs:
`MIN_IOU_HARD` (0.985), `TARGET_IOU` (0.99), `MAX_MEAN_DEVIATION_MM` (0.05),
`MAX_MAX_DEVIATION_MM` (0.15), `MAX_ASPECT_RATIO_ERROR` (0.01),
`TRACER_BACKEND` (`opencv` | `vtracer`),
`TURN_POLICY` (`minority`), `CURVE_FIT` (1), `CURVE_CORNER_DEG` (55),
`CURVE_WINDOW_MM` (0.3), `SMOOTH_ITERS` (0 — the old Chaikin path).

## Conditioning & smoothing (calibrated on real renders)

Real design renders are shaded, textured and coloured, with the metal in a
distinct hue against a near-white background+cutouts. `scripts/prep_image.py`
conditions them: key on the metal colour (warm/dark/saturation), crop to the
metal, despeckle, and — crucially — blur the **continuous metal score** before
thresholding so boundaries come out smooth without fattening the thin bands.

Smoothing is finished by fitting the traced rings with **corner-aware cubic
Béziers** (`app/core/curves.py`) — the idea potrace published, written here from
scratch so nothing GPL enters the image. Each vertex is classified as a corner or
not by the turn measured across a `CURVE_WINDOW_MM` arc (per-vertex angles are
useless: every step of a raster staircase is a 90° turn), and the smooth runs
between corners are fitted with cubics, subdivided until every traced point is
within the candidate's own simplification tolerance. A run that is already
straight stays a straight line, which is what keeps the stock edges straight
after the border snap.

That error budget is a hard promise, not a target: where the budget cannot be
met the fit falls back to the traced points rather than emitting a curve that
misses it. Because the budget *is* `tolerance_mm`, the existing candidate sweep
is already a sweep over how much staircase may be smoothed away, and the
fidelity gate — which rasterises the emitted SVG, curves and all — picks the
winner. Nothing is decided on appearance.

This replaced `SMOOTH_ITERS` Chaikin passes, which cut every corner by the same
clamped amount because they cannot tell a 90° corner from a one-pixel jag. On
the shaded-render fixture that cost 2.78mm of max contour deviation against a
4mm gate; the fit brings the same design in at 0.31mm with 140 anchors instead
of 359. Chaikin is still switchable (`SMOOTH_ITERS`, `CURVE_FIT=0`) so the two
can be compared through the gate, but running both would round real corners
before the fit ever saw them.

### Zero-width diagonal touches

Where metal occupies exactly one diagonal of a 2x2 pixel window, two metal areas
meet at a single mathematical point — and so do the two openings around them.
OpenCV traces the foreground 8-connected and so calls the metal joined, silently:
a bridge of zero width reaches the SVG as sound geometry, the component count
says one piece, and the minimum-bridge-width check downstream is handed a part
that reads as connected. The laser cuts through the point and the piece arrives
in two.

`TURN_POLICY` makes that an explicit, reported decision, the way potrace's
`turnpolicy` does. Default `minority`: whichever colour is locally scarce keeps
its connection, so a thin metal strand stays joined (and gains one honest pixel
of width) while a hairline slit through a solid plate stays open. Also
`majority`, `metal`, `cutout`, and `none` for the old implicit behaviour. The
count of touches found, joined and separated goes into the debug bundle whatever
the policy — including under `none`, so "nobody decided" and "nothing to decide"
stay distinguishable.

The fidelity philosophy after calibration: **topology (exact hole/component
match) and mean contour deviation are the real gates**; IoU (`MIN_IOU_HARD`
0.88) and max deviation (`MAX_MAX_DEVIATION_MM` 1.0) are loose on purpose,
because smoothing an AI render's pixel noise shifts thin-band edges
sub-pixel-uniformly and tanks IoU even when nothing is lost. All env-overridable
to tighten per use case.

## Known constraints / next steps

- The colour key + `--height` are supplied per image today; forme (or a small
  auto-detect) will pick them when integrated.
- VTracer backend is wired but the OpenCV polygon tracer is the default; the
  Bézier fit is what produces the curves, so both backends now emit them. The
  VTracer path samples its splines at a fixed sub-pixel step rather than at the
  simplification tolerance, which used to spend the smoothing budget twice — once
  coarsening the spline into a polyline, once smoothing the polyline again.
- No forme integration yet — this service stands alone. Wiring it into
  `src/lib/llm/pipeline.ts` (design image → this service → cutouts) is the
  following step.
