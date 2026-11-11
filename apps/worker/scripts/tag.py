"""Writes tags, lyrics, loudness and cover art into one audio file.

Called by src/tools/tagger.ts with a JSON job on stdin. This step is in Python
because mutagen is the one library that writes Opus, MP3 and M4A tags correctly.
Exits with code 1 and a message on stderr when the file cannot be tagged.
"""

import base64
import json
import sys

from mutagen.flac import Picture
from mutagen.id3 import APIC, ID3, TALB, TCON, TDRC, TIT2, TPE1, TPE2, TPOS, TRCK, TSRC, TXXX, USLT, ID3NoHeaderError
from mutagen.mp4 import MP4, MP4Cover, MP4FreeForm
from mutagen.oggopus import OggOpus

# ReplayGain 2.0 measures against -18 LUFS. Opus uses its own R128 tag, measured
# against -23 LUFS and stored as a whole number of 1/256 dB (RFC 7845, section 5.2.1).
REPLAYGAIN_REFERENCE_LUFS = -18.0
R128_REFERENCE_LUFS = -23.0


def main() -> None:
    job = json.load(sys.stdin)
    writers = {"opus": write_opus, "mp3": write_mp3, "aac": write_m4a}
    writer = writers.get(job["codec"])
    if writer is None:
        raise ValueError(f"Unsupported codec: {job['codec']}")

    cover = None
    if job.get("cover"):
        with open(job["cover"], "rb") as f:
            cover = f.read()
    writer(job["path"], job["tags"], lyrics_text(job.get("lyrics")), job.get("loudnessLufs"), cover)


# Synced (LRC) lyrics when there are any: Android players such as Poweramp and
# Musicolet read LRC from the normal lyrics tag and scroll it with the song.
def lyrics_text(lyrics):
    if not lyrics:
        return None
    return lyrics.get("synced") or lyrics.get("plain")


def replaygain(lufs):
    return f"{REPLAYGAIN_REFERENCE_LUFS - lufs:.2f} dB"


def write_opus(path, tags, lyrics, lufs, cover):
    audio = OggOpus(path)
    for key in list(audio.tags.keys()):
        del audio.tags[key]

    fields = {
        "TITLE": tags["title"],
        "ARTIST": tags["artist"],
        "ALBUM": tags.get("album"),
        "ALBUMARTIST": tags.get("albumArtist"),
        "DATE": tags.get("year"),
        "GENRE": tags.get("genre"),
        "TRACKNUMBER": tags.get("trackNumber"),
        "DISCNUMBER": tags.get("discNumber"),
        "ISRC": tags.get("isrc"),
        "LYRICS": lyrics,
    }
    if lufs is not None:
        gain = round((R128_REFERENCE_LUFS - lufs) * 256)
        fields["R128_TRACK_GAIN"] = max(-32768, min(32767, gain))
    for key, value in fields.items():
        if value is not None:
            audio.tags[key] = [str(value)]

    if cover:
        # Ogg files have no picture field, so the picture is stored the FLAC way:
        # a picture block, base64-encoded into a comment.
        picture = Picture()
        picture.type = 3  # front cover
        picture.mime = "image/jpeg"
        picture.data = cover
        audio.tags["METADATA_BLOCK_PICTURE"] = [base64.b64encode(picture.write()).decode("ascii")]

    audio.save()


def write_mp3(path, tags, lyrics, lufs, cover):
    # ffmpeg writes an encoder tag even with -map_metadata -1, so existing tags are removed first.
    try:
        ID3(path).delete(path)
    except ID3NoHeaderError:
        pass
    id3 = ID3()

    frames = [
        (TIT2, tags["title"]),
        (TPE1, tags["artist"]),
        (TALB, tags.get("album")),
        (TPE2, tags.get("albumArtist")),
        (TDRC, tags.get("year")),
        (TCON, tags.get("genre")),
        (TRCK, tags.get("trackNumber")),
        (TPOS, tags.get("discNumber")),
        (TSRC, tags.get("isrc")),
    ]
    for frame, value in frames:
        if value is not None:
            id3.add(frame(encoding=3, text=str(value)))

    if lyrics:
        id3.add(USLT(encoding=3, lang="eng", desc="", text=lyrics))
    if lufs is not None:
        id3.add(TXXX(encoding=3, desc="REPLAYGAIN_TRACK_GAIN", text=replaygain(lufs)))
    if cover:
        id3.add(APIC(encoding=3, mime="image/jpeg", type=3, desc="Cover", data=cover))

    # ID3 version 2.3 rather than 2.4: some players, including older Windows ones, cannot read 2.4.
    id3.update_to_v23()
    id3.save(path, v2_version=3)


def write_m4a(path, tags, lyrics, lufs, cover):
    audio = MP4(path)
    if audio.tags is None:
        audio.add_tags()
    audio.tags.clear()

    text_fields = {
        "\xa9nam": tags["title"],
        "\xa9ART": tags["artist"],
        "\xa9alb": tags.get("album"),
        "aART": tags.get("albumArtist"),
        "\xa9day": tags.get("year"),
        "\xa9gen": tags.get("genre"),
        "\xa9lyr": lyrics,
    }
    for key, value in text_fields.items():
        if value is not None:
            audio.tags[key] = [str(value)]

    # Track and disc are (number, total) pairs. 0 means the total is unknown.
    if tags.get("trackNumber") is not None:
        audio.tags["trkn"] = [(tags["trackNumber"], 0)]
    if tags.get("discNumber") is not None:
        audio.tags["disk"] = [(tags["discNumber"], 0)]

    # MP4 has no standard ISRC or ReplayGain atoms. These custom ("----") atoms
    # are the names iTunes and most taggers use.
    if tags.get("isrc"):
        audio.tags["----:com.apple.iTunes:ISRC"] = [MP4FreeForm(tags["isrc"].encode("utf-8"))]
    if lufs is not None:
        audio.tags["----:com.apple.iTunes:replaygain_track_gain"] = [MP4FreeForm(replaygain(lufs).encode("utf-8"))]
    if cover:
        audio.tags["covr"] = [MP4Cover(cover, imageformat=MP4Cover.FORMAT_JPEG)]

    audio.save()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - any failure is reported to the worker the same way
        print(f"tag.py: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
