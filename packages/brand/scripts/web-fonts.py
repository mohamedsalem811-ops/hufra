"""Web fonts for the website and the admin panel (plan 8.6).

Makes WOFF2 copies of Readex Pro, trimmed to the characters HUFRA's pages use:
Arabic (with its presentation forms), Latin, punctuation including the
direction marks, and arrows. Every OpenType feature is kept, so Arabic letters
still join. The apps keep the full TTF files.

Run once after changing the fonts (needs fonttools and brotli):
  python3 packages/brand/scripts/web-fonts.py
"""
from pathlib import Path

from fontTools import subset

FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
WEIGHTS = ["Regular", "Medium", "SemiBold", "Bold"]
UNICODES = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,"  # Latin
    "U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+25CC,"  # punctuation, direction marks, arrows
    "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF"  # Arabic
)

for weight in WEIGHTS:
    source = FONTS / f"ReadexPro-{weight}.ttf"
    target = FONTS / "web" / f"ReadexPro-{weight}.woff2"
    subset.main([
        str(source),
        f"--unicodes={UNICODES}",
        "--layout-features=*",
        "--flavor=woff2",
        "--no-hinting",
        "--desubroutinize",
        f"--output-file={target}",
    ])
    print(f"{target.name}: {source.stat().st_size // 1024} KB -> {target.stat().st_size // 1024} KB")
