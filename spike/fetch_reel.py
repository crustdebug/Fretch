"""
SPIKE: Can we get media out of an Instagram reel?

This is a throwaway experiment, not production code. Its only job is to answer
the question that the entire PROJECT_PLAN.md rests on. Delete it once answered.

Usage:
    python spike/fetch_reel.py <reel-url>

It runs four stages and reports on each independently, so a failure tells us
*which* assumption broke rather than just "it didn't work":

    1. PROBE    - can we read the reel's metadata without downloading?
    2. DOWNLOAD - can we pull the actual video bytes?
    3. AUDIO    - can ffmpeg extract an audio track (for AudD fingerprinting)?
    4. FRAMES   - can ffmpeg sample frames (for OCR)?
"""

import json
import subprocess
import sys
import time
from pathlib import Path

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)


def hr(title):
    print(f"\n{'=' * 62}\n  {title}\n{'=' * 62}")


def run(cmd, timeout=180):
    """Run a subprocess, returning (ok, stdout, stderr)."""
    try:
        p = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, encoding="utf-8", errors="replace"
        )
        return p.returncode == 0, p.stdout or "", p.stderr or ""
    except subprocess.TimeoutExpired:
        return False, "", f"TIMEOUT after {timeout}s"
    except FileNotFoundError as e:
        return False, "", f"COMMAND NOT FOUND: {e}"


# --------------------------------------------------------------------------
# Stage 1: probe metadata (cheap, no media transfer)
# --------------------------------------------------------------------------
def probe(url):
    hr("STAGE 1 - PROBE METADATA")
    print("Asking yt-dlp to describe the reel WITHOUT downloading it.")
    print("This is the cheapest possible test of whether Instagram will talk to us.\n")

    t0 = time.time()
    ok, out, err = run([sys.executable, "-m", "yt_dlp", "-J", "--no-warnings", url])
    dt = time.time() - t0

    if not ok:
        print(f"[FAIL] after {dt:.1f}s")
        print("--- stderr ---")
        print(err.strip()[:2500])
        return None

    try:
        meta = json.loads(out)
    except json.JSONDecodeError:
        print(f"[FAIL] yt-dlp returned non-JSON after {dt:.1f}s")
        print(out[:1000])
        return None

    print(f"[OK] metadata retrieved in {dt:.1f}s\n")
    for key in ("id", "title", "uploader", "duration", "width", "height", "ext", "filesize_approx"):
        if meta.get(key) is not None:
            print(f"    {key:16} {meta[key]}")

    fmts = meta.get("formats") or []
    print(f"\n    {'formats':16} {len(fmts)} available")
    for f in fmts[:8]:
        print(
            f"      - id={f.get('format_id'):<12} {str(f.get('width'))}x{str(f.get('height')):<6}"
            f" vcodec={str(f.get('vcodec'))[:12]:<12} acodec={str(f.get('acodec'))[:12]}"
        )

    (OUT / "metadata.json").write_text(json.dumps(meta, indent=2)[:400_000], encoding="utf-8")
    print(f"\n    full metadata -> {OUT / 'metadata.json'}")
    return meta


# --------------------------------------------------------------------------
# Stage 2: download the media
# --------------------------------------------------------------------------
def download(url):
    hr("STAGE 2 - DOWNLOAD MEDIA")
    print("Pulling the lowest-resolution version that still has video.")
    print("Per PROJECT_PLAN.md section 6: frames only need to be legible, not HD.\n")

    target = OUT / "reel.%(ext)s"
    t0 = time.time()
    ok, out, err = run(
        [
            sys.executable, "-m", "yt_dlp",
            "-f", "worst[vcodec!=none]/worst/best",
            "-o", str(target),
            "--no-warnings",
            "--force-overwrites",
            url,
        ],
        timeout=300,
    )
    dt = time.time() - t0

    if not ok:
        print(f"[FAIL] after {dt:.1f}s")
        print(err.strip()[:2500])
        return None

    files = [p for p in OUT.glob("reel.*") if p.suffix != ".json"]
    if not files:
        print(f"[FAIL] yt-dlp reported success but produced no file")
        return None

    media = max(files, key=lambda p: p.stat().st_size)
    print(f"[OK] downloaded in {dt:.1f}s")
    print(f"    file  {media.name}")
    print(f"    size  {media.stat().st_size / 1024:.0f} KB")
    return media


# --------------------------------------------------------------------------
# Stage 3: extract audio (this is what AudD fingerprints)
# --------------------------------------------------------------------------
def extract_audio(media):
    hr("STAGE 3 - EXTRACT AUDIO")
    print("AudD needs an audio file to fingerprint. AudD's docs recommend")
    print("a short mono clip, so we take the first 20s as 16kHz mono MP3.\n")

    audio = OUT / "audio.mp3"
    t0 = time.time()
    ok, out, err = run([
        "ffmpeg", "-y", "-i", str(media),
        "-vn",              # drop video
        "-t", "20",         # first 20 seconds is plenty to fingerprint
        "-ac", "1",         # mono
        "-ar", "16000",     # 16kHz
        "-b:a", "64k",
        str(audio),
    ])
    dt = time.time() - t0

    if not ok or not audio.exists():
        print(f"[FAIL] after {dt:.1f}s")
        print(err.strip()[-2000:])
        return None

    print(f"[OK] extracted in {dt:.1f}s")
    print(f"    file  {audio.name}")
    print(f"    size  {audio.stat().st_size / 1024:.0f} KB")
    return audio


# --------------------------------------------------------------------------
# Stage 4: sample frames (this is what OCR reads)
# --------------------------------------------------------------------------
def extract_frames(media):
    hr("STAGE 4 - SAMPLE FRAMES")
    print("Two strategies, both from PROJECT_PLAN.md section 6:\n")
    print("  A) fixed rate  - 2 fps, simple and predictable")
    print("  B) scene-change - only frames where the picture changed a lot,")
    print("                    which is where a chord overlay would appear/change\n")

    # --- A: fixed 2fps ---
    fixed_dir = OUT / "frames_fixed"
    fixed_dir.mkdir(exist_ok=True)
    for old in fixed_dir.glob("*.jpg"):
        old.unlink()

    t0 = time.time()
    ok_a, _, err_a = run([
        "ffmpeg", "-y", "-i", str(media),
        "-vf", "fps=2,scale=720:-1",
        "-q:v", "3",
        str(fixed_dir / "f_%04d.jpg"),
    ])
    dt_a = time.time() - t0
    n_a = len(list(fixed_dir.glob("*.jpg")))

    if ok_a:
        print(f"[OK] fixed-rate: {n_a} frames in {dt_a:.1f}s -> {fixed_dir.name}/")
    else:
        print(f"[FAIL] fixed-rate")
        print(err_a.strip()[-1200:])

    # --- B: scene change ---
    scene_dir = OUT / "frames_scene"
    scene_dir.mkdir(exist_ok=True)
    for old in scene_dir.glob("*.jpg"):
        old.unlink()

    t0 = time.time()
    ok_b, _, err_b = run([
        "ffmpeg", "-y", "-i", str(media),
        "-vf", "select='gt(scene,0.10)',scale=720:-1",
        "-vsync", "vfr", "-q:v", "3",
        str(scene_dir / "s_%04d.jpg"),
    ])
    dt_b = time.time() - t0
    n_b = len(list(scene_dir.glob("*.jpg")))

    if ok_b:
        print(f"[OK] scene-change: {n_b} frames in {dt_b:.1f}s -> {scene_dir.name}/")
    else:
        print(f"[FAIL] scene-change")
        print(err_b.strip()[-1200:])

    return n_a, n_b


# --------------------------------------------------------------------------
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("ERROR: no URL given.\n")
        print("Find a guitar tutorial reel on Instagram, copy its link, then:")
        print("    python spike/fetch_reel.py https://www.instagram.com/reel/XXXXXXXXX/")
        sys.exit(1)

    url = sys.argv[1]
    print(f"\nSPIKE: Instagram reel media extraction")
    print(f"target: {url}")

    meta = probe(url)
    if meta is None:
        hr("VERDICT")
        print("Could not even read metadata. Instagram is refusing us.")
        print("Read the stderr above - the usual causes are:")
        print("  * 'login required' / 'rate-limit reached'  -> needs cookies or a proxy")
        print("  * 'Unsupported URL'                        -> the URL isn't a reel")
        print("  * 'Video unavailable'                      -> private or deleted")
        sys.exit(2)

    media = download(url)
    if media is None:
        hr("VERDICT")
        print("Metadata worked but the media download failed.")
        print("Often means the CDN URL expired or is IP-locked. Notable, not fatal.")
        sys.exit(3)

    audio = extract_audio(media)
    n_fixed, n_scene = extract_frames(media)

    hr("VERDICT")
    dur = meta.get("duration")
    print(f"  probe      OK")
    print(f"  download   OK   ({media.stat().st_size / 1024:.0f} KB, {dur}s)")
    print(f"  audio      {'OK' if audio else 'FAIL'}")
    print(f"  frames     fixed={n_fixed}  scene={n_scene}")
    print()
    if audio and n_fixed:
        print("  The core assumption in PROJECT_PLAN.md holds: we can get")
        print("  both audio (for AudD) and frames (for OCR) from a reel URL.")
        print(f"\n  Look at spike/out/frames_fixed/ - are chords legible in them?")
        print("  That answers the SECOND question: is OCR going to work?")


if __name__ == "__main__":
    main()
