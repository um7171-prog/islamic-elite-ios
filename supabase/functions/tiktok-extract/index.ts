import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface TikwmResp {
  code: number;
  msg?: string;
  data?: {
    id: string;
    title: string;
    cover: string;
    play: string;       // no-watermark mp4
    wmplay: string;     // watermarked mp4
    hdplay?: string;    // hd mp4 (sometimes)
    music: string;      // mp3
    duration: number;
    images?: string[];  // photo posts
    author?: { unique_id?: string; nickname?: string };
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string' || !/tiktok\.com|vm\.tiktok|vt\.tiktok|douyin/.test(url)) {
      return new Response(JSON.stringify({ error: 'Invalid TikTok URL' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const form = new URLSearchParams({ url, hd: '1' });
    const r = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const j: TikwmResp = await r.json();
    if (j.code !== 0 || !j.data) {
      return new Response(JSON.stringify({ error: j.msg || 'Extraction failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const d = j.data;
    const base = `${d.author?.unique_id || 'tiktok'}-${d.id}`;
    const safe = base.replace(/[^a-z0-9_\-]/gi, '_').slice(0, 60);

    // Direct TikTok CDN URLs frequently return 403 outside TikTok's player.
    // Use TikWM's media endpoints so our proxy receives a stable, downloadable file.
    const vid = d.id;
    const mediaUrl = (kind: 'play' | 'hdplay' | 'wmplay' | 'music') =>
      kind === 'music'
        ? `https://www.tikwm.com/video/music/${vid}.mp3`
        : `https://www.tikwm.com/video/media/${kind}/${vid}.mp4`;
    const absoluteUrl = (value?: string) => {
      if (!value) return '';
      try { return new URL(value, 'https://www.tikwm.com').toString(); }
      catch { return value; }
    };

    const formats: Array<{ label: string; url: string; filename: string; type: 'video' | 'audio' | 'image' }> = [];
    // TikWM HD is often ByteVC2/bvc2, which downloads but does not save/play reliably on iPhone Photos.
    // Use the normal no-watermark MP4 first because it is H.264/avc1 and works with iOS sharing.
    if (d.play) formats.push({ label: 'iPhone Compatible MP4 (No Watermark)', url: mediaUrl('play'), filename: `${safe}.mp4`, type: 'video' });
    if (d.wmplay) formats.push({ label: 'With Watermark', url: mediaUrl('wmplay'), filename: `${safe}-wm.mp4`, type: 'video' });
    if (d.music) formats.push({ label: 'Audio MP3', url: mediaUrl('music'), filename: `${safe}.mp3`, type: 'audio' });
    if (d.images?.length) {
      d.images.forEach((u, i) => formats.push({
        label: `Image ${i + 1}`, url: absoluteUrl(u), filename: `${safe}-${i + 1}.jpg`, type: 'image',
      }));
    }

    return new Response(JSON.stringify({
      title: d.title, cover: d.cover, duration: d.duration,
      author: d.author?.nickname || d.author?.unique_id || '', formats,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
