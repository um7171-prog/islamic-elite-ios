#!/usr/bin/env python3
"""Measures the horizontal ink extent of every Mushaf page image and prints the INK string used by
src/components/mushaf/pageInk.ts.

For each page 1..604 it downloads the same image the reader shows (CDN, then mirror), converts it to
grayscale and finds the leftmost / rightmost columns holding at least 2 pixels darker than 160
(text and margin ornaments; the paper is white). Output: "LLLRRR" per page — thousandths of the
image width, left rounded down and right rounded up.

Requires: Python 3.9+, numpy, Pillow.   Usage: python scripts/measure-mushaf-ink.py > ink.txt
"""
import io
import math
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

CDN = "https://cdn.jsdelivr.net/gh/Five-Prayers/quran-pages@main/quran_pages"
MIRROR = "https://raw.githubusercontent.com/Five-Prayers/quran-pages/main/quran_pages"
TOTAL_PAGES = 604


def fetch(page: int) -> bytes:
    for base in (CDN, MIRROR):
        for _ in range(3):
            try:
                with urllib.request.urlopen(f"{base}/{page}.png", timeout=60) as r:
                    return r.read()
            except Exception:  # noqa: BLE001 - retried, then the mirror
                pass
    raise RuntimeError(f"page {page} unavailable")


def ink(page: int) -> str:
    a = np.asarray(Image.open(io.BytesIO(fetch(page))).convert("L"))
    cols = np.where((a < 160).sum(axis=0) >= 2)[0]
    w = a.shape[1]
    return f"{math.floor(cols[0] / w * 1000):03d}{math.ceil((cols[-1] + 1) / w * 1000):03d}"


if __name__ == "__main__":
    with ThreadPoolExecutor(8) as pool:
        sys.stdout.write("".join(pool.map(ink, range(1, TOTAL_PAGES + 1))) + "\n")
