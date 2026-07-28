"""
SPIKE 2: Are chord overlays in tutorial videos legible to OCR?

This tests the assumption the whole product rests on (PROJECT_PLAN.md section 6):
that we can read chord text off video frames and separate it from everything else
on screen.

Usage:
    python spike/ocr_chords.py <video-url-or-file>

Pipeline:
    acquire -> sample frames -> OCR each frame -> chord-grammar filter -> collapse
"""

import re
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)


def find_binary(name: str, candidates: list[str]) -> str:
    """
    Locate an executable without relying on PATH being set up correctly.

    Windows installs from winget land in per-user or per-machine directories
    that a freshly-spawned subprocess may not see, so we check known install
    locations explicitly and fall back to the bare name.
    """
    import shutil

    found = shutil.which(name)
    if found:
        return found
    for c in candidates:
        expanded = Path(c).expanduser()
        # candidates may contain glob wildcards (winget paths embed versions)
        if any(ch in c for ch in "*?"):
            matches = sorted(Path(expanded.anchor).glob(str(expanded.relative_to(expanded.anchor))))
            if matches:
                return str(matches[-1])
        elif expanded.exists():
            return str(expanded)
    return name  # let it fail loudly with a clear message


FFMPEG = find_binary("ffmpeg", [
    str(Path.home() / r"AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe"),
    str(Path.home() / r"AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg*\*\bin\ffmpeg.exe"),
    r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
])
TESSERACT = find_binary("tesseract", [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
])


# ==========================================================================
# THE CHORD GRAMMAR  (PROJECT_PLAN.md section 6, step 4)
# ==========================================================================
# A chord name is highly structured:
#
#     C#m7/G#
#     ^^^^^ ^^
#     | ||| |
#     | ||| +-- optional bass note after a slash  (inversions)
#     | ||+---- optional extension: 7, 9, 11, 13, 6, sus4, add9 ...
#     | |+----- optional quality: m / maj / dim / aug
#     | +------ optional accidental: # or b
#     +-------- root note: A-G
#
# That structure is why this works as an error-corrector as well as a
# classifier: the space of valid chords is small and known, so a token that
# is *almost* a chord was probably a chord that OCR got slightly wrong.

ROOT = r"[A-G]"
ACCIDENTAL = r"(?:#|b|♯|♭)?"
QUALITY = r"(?:m|min|maj|M|dim|aug|\+|°|ø)?"

# Extensions are richer than they first appear. Real tutorials use all of:
#   G7  Cmaj7  Dsus4  Cadd9  Am6  D6-9  C6/9  F#m7b5  E7#9  Bbmaj13
# Note the separator between stacked extensions can be '-' or '/' or nothing,
# which is what tripped up the first version of this grammar: 'D6-9/F#' was
# OCR'd perfectly and then rejected by the filter.
EXT_ATOM = r"(?:sus2|sus4|sus|add9|add11|add13|add2|alt|no3|no5|maj|M|m|2|4|5|6|7|9|11|13)"
ALTER = r"(?:[#b+-](?:5|9|11|13))"
EXTENSION = rf"(?:[-/]?(?:{EXT_ATOM}|{ALTER}))*"
BASS = r"(?:/[A-G](?:#|b)?)?"

CHORD_RE = re.compile(rf"^{ROOT}{ACCIDENTAL}{QUALITY}{EXTENSION}{BASS}$")

# Common OCR confusions, applied only when the raw token is NOT already a
# valid chord. Order matters: most-specific first.
OCR_FIXES = [
    ("rn", "m"),    # 'rn' renders almost identically to 'm'
    ("l", "1"),     # lowercase L vs one
    ("I", "1"),
    ("O", "0"),
    ("o", "0"),
    ("§", "5"),
    ("S", "5"),
    ("|", ""),      # stray vertical bars from diagram lines
    ("(", ""),
    (")", ""),
    ("*", ""),
    ("~", ""),
    ("_", ""),
    (",", ""),
    (".", ""),
]

# Tokens that pass the regex but are almost never chords in practice.
# 'A' and 'I' are real words; 'Em' is a real chord so it stays.
AMBIGUOUS = {"A", "a", "I", "b", "B"}


def normalise(tok: str) -> str:
    """Strip junk and unify unicode accidentals."""
    tok = tok.strip().strip("-—–:;")
    tok = tok.replace("♯", "#").replace("♭", "b")
    return tok


def try_repair(tok: str):
    """
    Given a token that is not a valid chord, try single substitutions from the
    OCR-confusion table and return the first repair that IS a valid chord.
    Returns (repaired, rule) or (None, None).
    """
    for bad, good in OCR_FIXES:
        if bad in tok:
            cand = tok.replace(bad, good)
            if CHORD_RE.match(cand) and cand not in AMBIGUOUS:
                return cand, f"{bad!r}->{good!r}"
    return None, None


def classify(raw: str):
    """
    Classify one OCR token.
    Returns (chord_or_None, status) where status is 'exact' | 'repaired' | 'rejected'.
    """
    tok = normalise(raw)
    if not tok or len(tok) > 10:
        return None, "rejected"

    if CHORD_RE.match(tok) and tok not in AMBIGUOUS:
        return tok, "exact"

    repaired, rule = try_repair(tok)
    if repaired:
        return repaired, f"repaired ({rule})"

    return None, "rejected"


# ==========================================================================
# Acquire + sample
# ==========================================================================
def acquire(target: str) -> Path:
    """Accept either a local file or a URL. Returns path to a local video."""
    p = Path(target)
    if p.exists():
        print(f"  using local file: {p.name}")
        return p

    print(f"  downloading: {target}")
    dest = OUT / "ocr_source.%(ext)s"
    r = subprocess.run(
        [sys.executable, "-m", "yt_dlp",
         "-f", "worst[vcodec!=none][height>=480]/worst[vcodec!=none]/worst",
         "-o", str(dest), "--no-warnings", "--force-overwrites", target],
        capture_output=True, text=True, timeout=420, encoding="utf-8", errors="replace",
    )
    if r.returncode != 0:
        print("  [FAIL] download error:")
        print("  " + (r.stderr or "")[:1500].replace("\n", "\n  "))
        sys.exit(2)

    files = [f for f in OUT.glob("ocr_source.*") if f.suffix not in (".json", ".part")]
    if not files:
        print("  [FAIL] no file produced")
        sys.exit(2)
    got = max(files, key=lambda f: f.stat().st_size)
    print(f"  got {got.name} ({got.stat().st_size / 1024:.0f} KB)")
    return got


def sample_frames(video: Path, fps=1) -> list[Path]:
    d = OUT / "ocr_frames"
    d.mkdir(exist_ok=True)
    for old in d.glob("*.png"):
        old.unlink()

    # Upscale 2x and grayscale: OCR accuracy improves markedly on small text.
    subprocess.run(
        [FFMPEG, "-y", "-i", str(video),
         "-vf", f"fps={fps},scale=iw*2:ih*2:flags=lanczos,format=gray",
         str(d / "f_%04d.png")],
        capture_output=True, text=True, timeout=300,
    )
    return sorted(d.glob("*.png"))


# ==========================================================================
# OCR
# ==========================================================================
def ocr(frame: Path) -> str:
    """Run tesseract on one frame. PSM 11 = sparse text, good for overlays."""
    r = subprocess.run(
        [TESSERACT, str(frame), "stdout", "--psm", "11", "-l", "eng"],
        capture_output=True, text=True, timeout=90, encoding="utf-8", errors="replace",
    )
    return r.stdout or ""


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    target = sys.argv[1]
    print("\n" + "=" * 64)
    print("  SPIKE 2 - CHORD OCR LEGIBILITY")
    print("=" * 64)

    print("\n[1/4] ACQUIRE")
    video = acquire(target)

    print("\n[2/4] SAMPLE FRAMES")
    t0 = time.time()
    frames = sample_frames(video)
    print(f"  {len(frames)} frames in {time.time() - t0:.1f}s")
    if not frames:
        print("  [FAIL] no frames extracted")
        sys.exit(3)

    print("\n[3/4] OCR + CHORD FILTER")
    print("  (showing per-frame detail for the first 10 frames)\n")

    all_tokens = Counter()
    chord_hits = Counter()
    repairs = Counter()
    timeline = []
    t0 = time.time()

    for i, fr in enumerate(frames):
        text = ocr(fr)
        toks = [t for t in re.split(r"\s+", text) if t.strip()]
        all_tokens.update(toks)

        found = []
        for t in toks:
            chord, status = classify(t)
            if chord:
                found.append(chord)
                chord_hits[chord] += 1
                if status.startswith("repaired"):
                    repairs[f"{t} -> {chord}"] += 1

        if found:
            timeline.append((i, sorted(set(found))))

        if i < 10:
            preview = " ".join(toks)[:70].replace("\n", " ")
            print(f"    frame {i:>3}  raw[{len(toks):>3} tok]: {preview}")
            print(f"              chords: {sorted(set(found)) if found else '-'}")

    dt = time.time() - t0

    print(f"\n[4/4] RESULTS   ({dt:.1f}s OCR, {dt / max(len(frames), 1):.2f}s/frame)")
    print("=" * 64)
    print(f"  frames processed     {len(frames)}")
    print(f"  frames with chords   {len(timeline)}")
    print(f"  raw tokens seen      {sum(all_tokens.values())}")
    print(f"  unique chords found  {len(chord_hits)}")

    if chord_hits:
        print(f"\n  CHORDS DETECTED (by frequency):")
        for c, n in chord_hits.most_common(20):
            bar = "#" * min(n, 40)
            print(f"    {c:<10} {n:>4}  {bar}")

    if repairs:
        print(f"\n  OCR REPAIRS MADE (the error-correction layer earning its keep):")
        for r, n in repairs.most_common(12):
            print(f"    {r}   x{n}")

    if timeline:
        print(f"\n  PROGRESSION (collapsed, consecutive dupes merged):")
        seq = []
        for _, chords in timeline:
            key = tuple(chords)
            if not seq or seq[-1] != key:
                seq.append(key)
        line = "  ".join("/".join(s) for s in seq[:25])
        print(f"    {line}")

    print(f"\n  REJECTED (top non-chord tokens - filter working correctly):")
    rejected = [(t, n) for t, n in all_tokens.most_common(200)
                if classify(t)[0] is None and len(t.strip()) > 1]
    for t, n in rejected[:12]:
        print(f"    {t[:28]:<30} x{n}")

    print("\n" + "=" * 64)
    print("  VERDICT")
    print("=" * 64)
    if len(chord_hits) >= 3:
        print("  OCR found a plausible chord set. The core assumption HOLDS.")
        print("  Next: check the chords above against what the video actually teaches.")
    elif chord_hits:
        print("  Some chords found, but few. Could be a hard video, or the")
        print("  filter needs tuning. Inspect spike/out/ocr_frames/ by eye.")
    else:
        print("  No chords detected. Either this video has no chord overlays,")
        print("  or OCR/preprocessing needs work. Inspect the frames.")
    print(f"\n  frames saved to: {OUT / 'ocr_frames'}")


if __name__ == "__main__":
    main()
