import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Robust YouTube extraction with multi-source fallback chain:
// 1) Piped public instances
// 2) Invidious public instances
// 3) Cobalt API (co.wuk.sh / api.cobalt.tools) as last resort
// No API keys required. Returns normalized formats for the client to choose.

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://api.piped.private.coffee',
  'https://pipedapi.drgns.space',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.ducks.party',
  'https://pipedapi.reallyaweso.me',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
  'https://yewtu.be',
  'https://invidious.privacyredirect.com',
  'https://iv.melmac.space',
  'https://invidious.f5.si',
];

const COBALT_INSTANCES = [
  'https://api.cobalt.tools/api/json',
  'https://co.wuk.sh/api/json',
  'https://capi.oak.li/api/json',
];

function extractVideoId(input: string): string | null {
  try {
    const u = new URL(input);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.findIndex(p => ['shorts', 'embed', 'live', 'v'].includes(p));
    if (i >= 0 && parts[i + 1]) return parts[i + 1];
  } catch (_) {}
  const m = /([a-zA-Z0-9_-]{11})/.exec(input);
  return m ? m[1] : null;
}

type Stream = {
  url: string;
  quality?: string;
  mimeType?: string;
  videoOnly?: boolean;
  bitrate?: number;
};
type Normalized = {
  title?: string;
  uploader?: string;
  thumbnailUrl?: string;
  duration?: number;
  videoStreams?: Stream[];
  audioStreams?: Stream[];
};

function extFromMime(mime?: string, fallback = 'mp4') {
  if (!mime) return fallback;
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('mp4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('opus')) return 'opus';
  return fallback;
}

async function tryFetchJson(url: string, init?: RequestInit, timeoutMs = 7000) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

async function fetchFromPiped(videoId: string): Promise<Normalized | null> {
  for (const base of PIPED_INSTANCES) {
    const j: any = await tryFetchJson(`${base}/streams/${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (j && (j.videoStreams?.length || j.audioStreams?.length)) {
      return {
        title: j.title,
        uploader: j.uploader,
        thumbnailUrl: j.thumbnailUrl,
        duration: j.duration,
        videoStreams: j.videoStreams,
        audioStreams: j.audioStreams,
      };
    }
  }
  return null;
}

async function fetchFromInvidious(videoId: string): Promise<Normalized | null> {
  for (const base of INVIDIOUS_INSTANCES) {
    const j: any = await tryFetchJson(`${base}/api/v1/videos/${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!j || (!j.formatStreams?.length && !j.adaptiveFormats?.length)) continue;

    const videoStreams: Stream[] = [];
    const audioStreams: Stream[] = [];

    // formatStreams = progressive (video+audio combined) — ideal
    for (const f of j.formatStreams || []) {
      videoStreams.push({
        url: f.url,
        quality: f.qualityLabel || f.quality,
        mimeType: f.type,
        videoOnly: false,
      });
    }
    // adaptiveFormats = separate video / audio
    for (const f of j.adaptiveFormats || []) {
      const isAudio = (f.type || '').startsWith('audio');
      if (isAudio) {
        audioStreams.push({
          url: f.url,
          mimeType: f.type,
          bitrate: f.bitrate ? Number(f.bitrate) : undefined,
        });
      } else {
        videoStreams.push({
          url: f.url,
          quality: f.qualityLabel || f.quality,
          mimeType: f.type,
          videoOnly: true,
        });
      }
    }

    const thumb = Array.isArray(j.videoThumbnails) && j.videoThumbnails.length
      ? j.videoThumbnails[0].url : undefined;

    return {
      title: j.title,
      uploader: j.author,
      thumbnailUrl: thumb,
      duration: j.lengthSeconds,
      videoStreams,
      audioStreams,
    };
  }
  return null;
}

async function fetchFromCobalt(originalUrl: string, mode: 'auto' | 'audio'): Promise<{ url: string; filename?: string } | null> {
  for (const endpoint of COBALT_INSTANCES) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({
          url: originalUrl,
          vQuality: '1080',
          aFormat: 'mp3',
          isAudioOnly: mode === 'audio',
          filenamePattern: 'basic',
        }),
        signal: AbortSignal.timeout(9000),
      });
      if (!r.ok) continue;
      const j: any = await r.json();
      if (j?.status === 'stream' || j?.status === 'redirect' || j?.status === 'success' || j?.status === 'tunnel') {
        if (j.url) return { url: j.url, filename: j.filename };
      }
    } catch (_) { /* try next */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const id = extractVideoId(url);
    if (!id) {
      return new Response(JSON.stringify({ error: 'Could not extract YouTube video ID' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try Piped → Invidious in order
    let data: Normalized | null = await fetchFromPiped(id);
    let source = 'piped';
    if (!data) {
      data = await fetchFromInvidious(id);
      source = data ? 'invidious' : source;
    }

    // Build formats from normalized data when available
    const formats: Array<{ label: string; url: string; filename: string; type: 'video' | 'audio'; quality?: string }> = [];
    let title = '';
    let cover = '';
    let duration = 0;
    let author = '';

    if (data) {
      title = data.title || `youtube-${id}`;
      cover = data.thumbnailUrl || '';
      duration = data.duration || 0;
      author = data.uploader || '';
      const safe = title.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);

      const progressive = (data.videoStreams || [])
        .filter(s => !s.videoOnly && s.url)
        .sort((a, b) => parseInt(b.quality || '0') - parseInt(a.quality || '0'));

      const seen = new Set<string>();
      for (const v of progressive) {
        const q = v.quality || 'video';
        if (seen.has(q)) continue;
        seen.add(q);
        const ext = extFromMime(v.mimeType, 'mp4');
        formats.push({
          label: `MP4 · ${q}`,
          url: v.url,
          filename: `${safe}-${q}.${ext}`,
          type: 'video',
          quality: q,
        });
      }

      if (formats.length === 0) {
        const vo = (data.videoStreams || [])
          .filter(s => s.url)
          .sort((a, b) => parseInt(b.quality || '0') - parseInt(a.quality || '0'))[0];
        if (vo) {
          const ext = extFromMime(vo.mimeType, 'mp4');
          formats.push({
            label: `${ext.toUpperCase()} · ${vo.quality || ''} (video only)`,
            url: vo.url,
            filename: `${safe}-${vo.quality || 'video'}.${ext}`,
            type: 'video',
            quality: vo.quality,
          });
        }
      }

      const audios = (data.audioStreams || [])
        .filter(s => s.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const bestAudio = audios[0];
      if (bestAudio) {
        const ext = extFromMime(bestAudio.mimeType, 'm4a');
        formats.push({
          label: `Audio · ${bestAudio.bitrate ? Math.round(bestAudio.bitrate / 1000) + 'kbps ' : ''}${ext.toUpperCase()}`,
          url: bestAudio.url,
          filename: `${safe}.${ext}`,
          type: 'audio',
        });
      }
    }

    // Cobalt fallback if nothing usable was extracted
    if (formats.length === 0) {
      source = 'cobalt';
      const safe = (`youtube-${id}`).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
      const [video, audio] = await Promise.all([
        fetchFromCobalt(url, 'auto'),
        fetchFromCobalt(url, 'audio'),
      ]);
      if (video?.url) {
        formats.push({
          label: 'MP4 · Auto (best available)',
          url: video.url,
          filename: video.filename || `${safe}.mp4`,
          type: 'video',
        });
      }
      if (audio?.url) {
        formats.push({
          label: 'Audio · MP3',
          url: audio.url,
          filename: audio.filename || `${safe}.mp3`,
          type: 'audio',
        });
      }
      if (!title) title = `youtube-${id}`;
    }

    if (formats.length === 0) {
      return new Response(JSON.stringify({
        error: 'All extraction sources are temporarily unavailable. Please try again in a moment.',
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      title,
      cover,
      duration,
      author,
      source,
      formats,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
