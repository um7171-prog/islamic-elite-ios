# KFGQPC — Hafs text + Al-Muyassar tafsir (source record)

Verified on 2026-09-27.

## Where it comes from

- Publisher: King Fahd Glorious Quran Printing Complex (KFGQPC) — مجمع الملك فهد لطباعة المصحف الشريف
- Platform: منصة مطوري برمجيات القرآن الكريم — https://qurancomplex.gov.sa/quran-dev/
  (the address https://qurancomplex.gov.sa/en/techquran/dev/ returned HTTP 404 on 2026-09-27)
- Package: «التفسير الميسر للقرآن الكريم — Tafseer Muyassar»
- Download: https://download.qurancomplex.gov.sa/resources_dev/hafs_tafseerMouaser_v3.zip
- Version 3.0 · created 2020-12-15 · last modified 2023-01-08 (platform page and read.me)

## Checksums

| File | Value |
|---|---|
| ZIP MD5 (published by KFGQPC) | `b38703983d438a5cd22269b746eaac0c` — matched |
| ZIP SHA-1 (published by KFGQPC) | `a8f054411c6cd14a258d5ba7bc4e30c9ea79b336` — matched |
| ZIP SHA-256 (computed) | `443a6927dbbf9df0fb63792dc83b83511f7d308f3ec322c9230fbebfe3c69c86` |
| ZIP size | 7,885,418 bytes |
| `tafseerMouaser_v03.txt` SHA-256 (computed, kept verbatim here) | `df92e4e2c86b0a57cf67c31e710b55db00f04ba0ee6f18c497bb5f8b1b1be0cc` |

`hafs_tafseerMouaser_v3/` holds `tafseerMouaser_v03.txt` and `read.me` exactly as extracted from the ZIP.
The fonts in the ZIP are NOT included in the project (not needed for the data layer).

## Terms found (quoted verbatim)

1. Platform page, description of this package:
   > هي خدمة يقدمها مجمع الملك فهد لطباعة المصحف الشريف للمطورين والباحثين ودور النشر لاستخدامها في محتوى تطبيقاتهم (المكتبية والجوالات والمتصفحات) وبحوثهم، وهذا المحتوى موثوق ومعتمد من المجمع، ويحتوي على بيانات المصحف الشريف برواية حفص عن عاصم مع نص التفسير الميسر المقابل لكل آية

2. KFGQPC site policy (https://policy.qurancomplex.gov.sa), section «ترخيص الاستخدام»:
   > إن جميع محتويات مواقع مجمع الملك فهد لطباعة المصحف الشريف ، بما فيها النصوص والرسوم والصور ومصنفات البيانات، وقوائم العناوين، كل ذلك ملكٌ لمجمع الملك فهد، تحميه قوانين حقوق التأليف والنشر السعودية والدولية، باستثناء بعض الخدمات، والملفات الحاسوبية، والأدوات البرمجية، وغيرها التي يصـرِّح المجمع بإتاحتها للاستخدام العام.

3. Font EULA embedded in the package fonts (uthmanic_hafs_v20.ttf / uthman_tn1_ver20.ttf) — applies to the FONTS only:
   > Permission is hereby granted, Free of Cost, to any person obtaining a copy of this Font accompanying this license, the rights to Use, Copy, Distribute, subject to the following conditions:
   > 1. The Font Software cannot be Sold, Modified, Altered, Translated, Reverse Engineered, Decompiled, Disassembled, Reproduced or Attempted to discover the Source Code of this Font in no means.

The package read.me contains no license text. No page states a restriction on commercial use; none
states an explicit permission for commercial use either.

## Facts about the data (verified by src/test/quranData.test.ts)

- 114 surahs, 6236 rows; per-surah counts equal the app's `SURAHS`.
- The text is NOT Unicode-normalised (e.g. 2:255 stores SHADDA before FATHA). Never normalise it.
- `aya_text` ends with the ayah-number glyph of the KFGQPC Uthmanic Hafs font (renders correctly only with that font).
- `page` is the KFGQPC edition's page. For 56 ayahs it is one page off from the app's current Mushaf
  images (checked on the images: 80:41–42 are at the bottom of page 585, the source says 586). The data
  layer keeps the source value as `sourcePage` and uses the app's verified mapping (PAGE_START) as `mushafPage`.
- The source has no hizb field; `pageHizb` comes from the app's PAGE_INFO.
- 8 tafsir entries are not prefixed "[n]" in the source: 26:99, 38:83, 50:44, 82:8, 95:3 lack the
  opening bracket; 28:33 and 28:34 share one entry labelled "[33، 34]"; 68:22 is labelled "[21، 22]"
  (68:21 has its own "[21]" entry). Kept verbatim.

## How it is used here

- `scripts/ingest-kfgqpc-muyassar.mjs` converts the TXT to one JSON per surah in `src/lib/quran/data/`,
  copying every text field verbatim (no trimming, no normalisation, no tag removal).
- Attribution to KFGQPC must be shown in the app wherever this text/tafsir is displayed.
- The text is not to be altered. The fonts, if used later, must not be sold or modified.
