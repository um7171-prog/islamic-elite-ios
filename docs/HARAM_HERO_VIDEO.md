# Home hero video: source and license

`public/media/haram-hero.mp4` and `public/media/haram-hero-poster.jpg` (Home header, `components/site/HaramHero.tsx`).

## Source
- **Original:** "Tawaf Ifadha 2016 with Amm Salim.webm"
- **Where:** Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Tawaf_Ifadha_2016_with_Amm_Salim.webm
- **Author / attribution:** Amm Salim (Commons "Attribution" field); credit line on the Commons page: "YouTube: Tawaf Ifadha 2016 with Amm Salim"; recorded date 2017-01-13; description "Tawaf Ifadha during hajj 2016"
- **License:** Creative Commons Attribution 3.0 Unported (CC BY 3.0), https://creativecommons.org/licenses/by/3.0/
- **Original specs:** 1920x1080, VP8, 13.56 s, 29.97 fps, with audio.

## What this app changed (an adaptation, as CC BY 3.0 allows)
Segment 0.2 s to 8.8 s only. Stabilised on the Kaaba, cropped to 2:1 (this also removes the burned-in
subtitle at the bottom of the source), downscaled to 1080x540, audio removed, and given a 1 s cross-fade
at the seam so the loop has no visible jump. Re-encoded as H.264 (Main profile, yuv420p, faststart).
Result: 1080x540, 7.61 s, about 2.9 Mbps, 2.80 MB (2,796,454 bytes), 29.97 fps, no audio track (x264 crf 24, single GOP so playback restarts on one keyframe).

## Attribution (required by CC BY 3.0)
Credit is shown in the app under **About > Credits**. Keep it there while the video ships.

## Caveats for whoever owns release decisions
- The license is the one stated on the Commons file page. The Commons file was uploaded by a third party from a
  YouTube video the author marked as Creative Commons; this repository cannot independently verify that chain.
  If the App Store legal review needs stronger provenance, replace the clip with footage you own or have
  a written license for (keep the file names and dimensions and nothing else needs to change).
- People are identifiable only as a distant crowd; no individual is a subject of the footage.

## Replacing the clip
Keep a 2:1 frame, no audio, H.264, a seamless loop (cross-fade the last second onto the first), and update
`HARAM_HERO_VIDEO` / `HARAM_HERO_POSTER` in `HaramHero.tsx` plus the credit in `pages/About.tsx`.
