#!/usr/bin/env python3
"""
Build blend-friendly playlists from the BPM and key tags written by tag_music.py.

Two ideas drive it:
  * Tempo bands: tracks are grouped into BPM bands (default 6 BPM wide), so
    everything in a playlist sits in the same tempo range.
  * Camelot wheel: within a band, tracks are ordered around the key wheel, so
    each step is a key that mixes well (same key, or one step round the wheel,
    or the relative major/minor).

Usage:
    python3 build_playlists.py ~/Music/Swinsian --out ~/Music/Playlists
    python3 build_playlists.py ~/Music/Swinsian --out ~/Music/Playlists --band 4

Writes one .m3u8 per BPM band plus one flowing set (set.m3u8) that chains
compatible tracks from slowest to fastest. Import the .m3u8 files into Swinsian.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tag_music import iter_tracks, read_tags  # noqa: E402

# Camelot codes: number 1-12 on the wheel, letter A = minor, B = major.
CAMELOT = {
    "C": "8B", "Cm": "5A", "C#": "3B", "C#m": "12A", "D": "10B", "Dm": "7A",
    "D#": "5B", "D#m": "2A", "E": "12B", "Em": "9A", "F": "7B", "Fm": "4A",
    "F#": "2B", "F#m": "11A", "G": "9B", "Gm": "6A", "G#": "4B", "G#m": "1A",
    "A": "11B", "Am": "8A", "A#": "6B", "A#m": "3A", "B": "1B", "Bm": "10A",
}


def camelot_position(camelot):
    """'8A' -> (8, 'A')."""
    return int(camelot[:-1]), camelot[-1]


def keys_blend(a, b):
    """True when two Camelot codes mix: same code, +/-1 on the wheel, or relative major/minor."""
    na, la = camelot_position(a)
    nb, lb = camelot_position(b)
    wheel_distance = min(abs(na - nb), 12 - abs(na - nb))
    return (wheel_distance == 0 and la == lb) or \
           (wheel_distance == 1 and la == lb) or \
           (wheel_distance == 0 and la != lb)


def load_library(folder):
    """Return a list of dicts for every track that has both a BPM and a key."""
    tracks, untagged = [], []
    for path in iter_tracks(folder):
        try:
            bpm_text, key = read_tags(path)
        except Exception as error:
            print(f"Could not read {path.name}: {error}", file=sys.stderr)
            continue
        if not bpm_text or not key or key not in CAMELOT:
            untagged.append(path.name)
            continue
        tracks.append({"path": path, "bpm": float(bpm_text), "key": key, "camelot": CAMELOT[key]})
    return tracks, untagged


def bpm_bands(tracks, width):
    """Group tracks into bands of `width` BPM, keyed by the band's lower edge."""
    bands = {}
    for track in tracks:
        lower = int(track["bpm"] // width) * width
        bands.setdefault(lower, []).append(track)
    return dict(sorted(bands.items()))


def order_on_wheel(tracks):
    """Sort a band so keys step around the Camelot wheel (1A..12A, then 1B..12B)."""
    def sort_key(track):
        number, letter = camelot_position(track["camelot"])
        return (letter, number, track["bpm"])
    return sorted(tracks, key=sort_key)


def flowing_set(tracks, bpm_tolerance):
    """Chain tracks slowest to fastest, always picking a key-compatible, tempo-close next track."""
    remaining = sorted(tracks, key=lambda t: t["bpm"])
    if not remaining:
        return []
    chain = [remaining.pop(0)]
    while remaining:
        current = chain[-1]
        candidates = [
            t for t in remaining
            if keys_blend(current["camelot"], t["camelot"])
            and abs(t["bpm"] - current["bpm"]) <= bpm_tolerance
        ]
        if not candidates:
            # Nothing blends: take the closest tempo so the set keeps moving.
            candidates = remaining
        nxt = min(candidates, key=lambda t: abs(t["bpm"] - current["bpm"]))
        remaining.remove(nxt)
        chain.append(nxt)
    return chain


def write_m3u(path, tracks):
    lines = ["#EXTM3U"]
    for track in tracks:
        lines.append(f"#EXTINF:-1,{track['path'].stem}  [{track['bpm']:.0f} BPM, {track['key']}]")
        lines.append(str(track["path"]))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", help="Music folder that has been tagged with tag_music.py")
    parser.add_argument("--out", required=True, help="Folder to write the .m3u8 playlists into")
    parser.add_argument("--band", type=int, default=6, help="BPM band width (default 6)")
    parser.add_argument("--tolerance", type=float, default=4.0,
                        help="Max BPM difference between neighbours in the flowing set (default 4)")
    args = parser.parse_args()

    tracks, untagged = load_library(args.folder)
    if not tracks:
        print("No tagged tracks found. Run tag_music.py with --write first.")
        return 1

    out = Path(args.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)

    for lower, band in bpm_bands(tracks, args.band).items():
        name = f"BPM {lower}-{lower + args.band - 1}.m3u8"
        write_m3u(out / name, order_on_wheel(band))
        print(f"{name}: {len(band)} tracks")

    chain = flowing_set(tracks, args.tolerance)
    write_m3u(out / "set.m3u8", chain)
    blends = sum(keys_blend(a["camelot"], b["camelot"]) for a, b in zip(chain, chain[1:]))
    print(f"set.m3u8: {len(chain)} tracks, {blends}/{max(len(chain) - 1, 0)} key-compatible steps")

    if untagged:
        print(f"\n{len(untagged)} tracks have no BPM/key tag and were left out, e.g. {untagged[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
