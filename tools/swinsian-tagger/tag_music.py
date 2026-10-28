#!/usr/bin/env python3
"""
Estimate BPM and musical key for every track in a music folder and write them
into the file tags (BPM and initial key). Swinsian reads these tags from the
files, so the values show up in your Swinsian library.

Usage:
    python3 tag_music.py ~/Music/Swinsian            # dry run: shows what it would write
    python3 tag_music.py ~/Music/Swinsian --write    # writes the tags
    python3 tag_music.py ~/Music/Swinsian --write --overwrite   # replace existing values

Supported formats: WAV and AIFF (ID3 chunk), MP3 (ID3), M4A/AAC/ALAC (MP4), FLAC.
"""

import argparse
import sys
from pathlib import Path

import librosa
import numpy as np
from mutagen import File as MutagenFile
from mutagen.aiff import AIFF
from mutagen.flac import FLAC
from mutagen.id3 import ID3, TBPM, TKEY, ID3NoHeaderError
from mutagen.mp4 import MP4, MP4FreeForm
from mutagen.wave import WAVE

AUDIO_EXTENSIONS = {".mp3", ".m4a", ".flac", ".wav", ".aif", ".aiff"}
ID3_CONTAINERS = {".wav": WAVE, ".aif": AIFF, ".aiff": AIFF}
MP4_KEY_ATOM = "----:com.apple.iTunes:initialkey"

# Krumhansl-Schmuckler key profiles, index 0 = tonic.
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

ANALYSIS_SECONDS = 120


def estimate_key(chroma_mean):
    """Return (key_name, confidence) such as ('Am', 0.91) or ('F#', 0.74)."""
    best_score, best_key = -2.0, None
    for tonic in range(12):
        for profile, suffix in ((MAJOR_PROFILE, ""), (MINOR_PROFILE, "m")):
            score = np.corrcoef(np.roll(profile, tonic), chroma_mean)[0, 1]
            if score > best_score:
                best_score, best_key = score, f"{PITCH_NAMES[tonic]}{suffix}"
    return best_key, float(best_score)


def analyse(path):
    """Estimate BPM and key from the middle ~2 minutes of a track."""
    duration = librosa.get_duration(path=str(path))
    offset = max(0.0, duration / 2 - ANALYSIS_SECONDS / 2)
    y, sr = librosa.load(str(path), sr=22050, mono=True,
                         offset=offset, duration=ANALYSIS_SECONDS)

    onset_envelope = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, _ = librosa.beat.beat_track(onset_envelope=onset_envelope, sr=sr)
    bpm = int(round(float(np.atleast_1d(tempo)[0])))

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key, confidence = estimate_key(chroma.mean(axis=1))
    return bpm, key, confidence


def read_tags(path):
    """Return the (bpm, key) already stored in the file, as strings or None."""
    ext = path.suffix.lower()
    if ext == ".mp3":
        try:
            tags = ID3(path)
        except ID3NoHeaderError:
            return None, None
        bpm = tags.get("TBPM")
        key = tags.get("TKEY")
        return (str(bpm.text[0]) if bpm else None), (str(key.text[0]) if key else None)
    if ext == ".m4a":
        tags = MP4(path).tags or {}
        bpm = tags.get("tmpo")
        key = tags.get(MP4_KEY_ATOM)
        return (str(bpm[0]) if bpm else None), (key[0].decode("utf-8") if key else None)
    if ext == ".flac":
        tags = FLAC(path).tags or {}
        bpm = tags.get("BPM")
        key = tags.get("INITIALKEY")
        return (bpm[0] if bpm else None), (key[0] if key else None)
    if ext in ID3_CONTAINERS:
        tags = ID3_CONTAINERS[ext](path).tags
        if tags is None:
            return None, None
        bpm = tags.get("TBPM")
        key = tags.get("TKEY")
        return (str(bpm.text[0]) if bpm else None), (str(key.text[0]) if key else None)
    return None, None


def write_tags(path, bpm, key):
    ext = path.suffix.lower()
    if ext == ".mp3":
        try:
            tags = ID3(path)
        except ID3NoHeaderError:
            tags = ID3()
        tags.delall("TBPM")
        tags.add(TBPM(encoding=3, text=str(bpm)))
        tags.delall("TKEY")
        tags.add(TKEY(encoding=3, text=key))
        tags.save(path, v2_version=3)
    elif ext == ".m4a":
        mp4 = MP4(path)
        mp4.tags["tmpo"] = [bpm]
        mp4.tags[MP4_KEY_ATOM] = [MP4FreeForm(key.encode("utf-8"))]
        mp4.save()
    elif ext == ".flac":
        flac = FLAC(path)
        flac["BPM"] = str(bpm)
        flac["INITIALKEY"] = key
        flac.save()
    elif ext in ID3_CONTAINERS:
        audio = ID3_CONTAINERS[ext](path)
        if audio.tags is None:
            audio.add_tags()
        audio.tags.delall("TBPM")
        audio.tags.add(TBPM(encoding=3, text=str(bpm)))
        audio.tags.delall("TKEY")
        audio.tags.add(TKEY(encoding=3, text=key))
        audio.save()


def iter_tracks(root):
    for path in sorted(Path(root).expanduser().rglob("*")):
        if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS:
            yield path


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", help="Folder to scan (searched recursively)")
    parser.add_argument("--write", action="store_true", help="Actually write tags. Without this it is a dry run.")
    parser.add_argument("--overwrite", action="store_true", help="Replace BPM/key that are already in the tags.")
    parser.add_argument("--min-confidence", type=float, default=0.6,
                        help="Keys below this correlation are flagged for review (default 0.6).")
    args = parser.parse_args()

    tracks = list(iter_tracks(args.folder))
    if not tracks:
        print(f"No MP3, M4A or FLAC files found under {args.folder}")
        return 1

    mode = "WRITING" if args.write else "DRY RUN (no files changed)"
    print(f"{mode}: {len(tracks)} tracks under {args.folder}\n")

    counts = {"written": 0, "skipped": 0, "failed": 0, "review": 0}
    for i, path in enumerate(tracks, 1):
        label = f"[{i}/{len(tracks)}] {path.name}"
        try:
            existing_bpm, existing_key = read_tags(path)
            if existing_bpm and existing_key and not args.overwrite:
                print(f"{label}: already tagged ({existing_bpm} BPM, {existing_key}), skipped")
                counts["skipped"] += 1
                continue

            bpm, key, confidence = analyse(path)
            flag = ""
            if confidence < args.min_confidence:
                flag = f"  <- low confidence ({confidence:.2f}), check by ear"
                counts["review"] += 1
            print(f"{label}: {bpm} BPM, {key}{flag}")

            if args.write:
                write_tags(path, bpm, key)
            counts["written" if args.write else "skipped"] += 1
        except Exception as error:  # keep going through the library
            print(f"{label}: FAILED ({error})", file=sys.stderr)
            counts["failed"] += 1

    print(f"\nDone. Tagged: {counts['written'] if args.write else 0}, "
          f"would tag: {counts['skipped'] if not args.write else 0}, "
          f"failed: {counts['failed']}, low confidence: {counts['review']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
