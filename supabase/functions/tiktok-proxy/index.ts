import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Streams a remote file through the function so the browser avoids CORS issues.
// Forwards Range header for resume support.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const u = new URL(req.url);
    const target = u.searchParams.get('url');
    if (!target || !/^https?:\/\//i.test(target)) {
      return new Response('Invalid url', { status: 400, headers: corsHeaders });
    }
    const host = new URL(target).hostname;
    const allowed = /(^|\.)(tikwm\.com|tiktokcdn(?:-[a-z0-9]+)?\.com|tiktok\.com|byteoversea\.com|musical\.ly|tiktokv\.com|snssdk\.com|akamaized\.net|googlevideo\.com|youtube\.com|youtu\.be|ytimg\.com|piped\.video|kavin\.rocks|adminforge\.de|leptons\.xyz|private\.coffee)$/i;
    if (!allowed.test(host)) {
      return new Response('Host not allowed', { status: 403, headers: corsHeaders });
    }
    const isYT = /(googlevideo|youtube|youtu\.be|ytimg)\.com$/i.test(host) || host.endsWith('youtu.be');

    const fwd: HeadersInit = isYT
      ? { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.youtube.com/' }
      : { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.tiktok.com/' };
    const range = req.headers.get('range');
    if (range) (fwd as Record<string, string>).Range = range;

    const r = await fetch(target, { headers: fwd, redirect: 'follow' });
    const headers = new Headers(corsHeaders);
    const passthrough = ['content-length', 'content-range', 'accept-ranges', 'content-type', 'last-modified', 'etag'];
    for (const h of passthrough) {
      const v = r.headers.get(h);
      if (v) headers.set(h, v);
    }
    const filename = u.searchParams.get('filename');
    if (filename) {
      const cleaned = filename.replace(/[\r\n"]/g, '_').slice(0, 120);
      // ASCII fallback for the filename= param (Headers must be ByteString / latin-1)
      const asciiName = cleaned.replace(/[^\x20-\x7E]/g, '_');
      headers.set(
        'Content-Disposition',
        `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`,
      );
    }
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Disposition');
    return new Response(r.body, { status: r.status, headers });
  } catch (e) {
    return new Response(String((e as Error).message || e), { status: 500, headers: corsHeaders });
  }
});
