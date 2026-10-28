# Swinsian BPM, key and playlist tools

Two small scripts for a music folder on your Mac. They work on WAV, AIFF, MP3, M4A and FLAC.

## 1. Tag BPM and key (`tag_music.py`)

Listens to the middle two minutes of each track, estimates its tempo and key, and writes them into the file's tags, which Swinsian reads.

```
python3 tag_music.py ~/Music/Swinsian            # dry run: shows results, changes nothing
python3 tag_music.py ~/Music/Swinsian --write    # writes the tags
```

- Tracks that already have a BPM and key are skipped unless you add `--overwrite`.
- Tracks flagged "low confidence" are worth checking by ear.
- Auto-detected BPM can be off by a few points or be half or double the real tempo.

**Before you use `--write` on your real library:** back up the music folder and Swinsian's library file, and try it on a copy of a few folders first.

## 2. Build blend playlists (`build_playlists.py`)

Reads the tags and creates playlists you can import into Swinsian:

- **`BPM 120-125.m3u8` and similar:** one playlist per tempo band, with tracks ordered around the key wheel so neighbours mix.
- **`set.m3u8`:** one flowing set, from slowest to fastest, where each track is in a key that blends with the one before and within a few BPM.

```
python3 build_playlists.py ~/Music/Swinsian --out ~/Music/Playlists
```

Options: `--band 4` for narrower tempo bands, `--tolerance 3` for a stricter BPM gap in the set.

Import the `.m3u8` files into Swinsian. I haven't confirmed Swinsian's exact import menu from here.
