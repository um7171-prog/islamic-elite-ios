import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const API_BASE = 'https://dev.omar-thing.site/api/v1';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const key = Deno.env.get('OMAR_THING_API_KEY');
    if (!key) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);

    let raw = '';
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      raw = typeof body?.username === 'string' ? body.username : '';
    } else {
      raw = new URL(req.url).searchParams.get('username') ?? '';
    }

    // Accept @handle, plain username, or a full profile URL.
    let username = raw.trim();
    const urlMatch = username.match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
    if (urlMatch) username = urlMatch[1];
    username = username.replace(/^@/, '').trim();

    if (!username || username.length > 30 || !/^[A-Za-z0-9._]+$/.test(username)) {
      return json({ error: 'INVALID_USERNAME' }, 400);
    }

    const target = `${API_BASE}/profile?username=${encodeURIComponent(username)}`;
    const res = await fetch(target, { headers: { 'X-API-Key': key } });
    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      const code = (payload as { code?: string } | null)?.code;
      if (res.status === 404 || code === 'NOT_FOUND') return json({ error: 'NOT_FOUND' }, 404);
      if (res.status === 429) return json({ error: 'RATE_LIMIT' }, 429);
      return json({ error: 'UPSTREAM_ERROR' }, 502);
    }

    const data = (payload as { data?: Record<string, unknown> } | null)?.data ?? {};
    const user = (data.user ?? {}) as Record<string, unknown>;
    const stats = (data.statsV2 ?? data.stats ?? {}) as Record<string, unknown>;
    if (!user?.uniqueId && !user?.id) return json({ error: 'NOT_FOUND' }, 404);

    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // The profile payload omits region data, so the official flow merges two more endpoints.
    const uid = String(user.id ?? '');
    const fetchRegion = async (path: string) => {
      try {
        const r = await fetch(`${API_BASE}/${path}`, { headers: { 'X-API-Key': key } });
        if (!r.ok) return { code: '', name: '' };
        const j = await r.json().catch(() => null);
        const d = (j as { data?: Record<string, unknown> } | null)?.data ?? {};
        return {
          code: typeof d.region === 'string' ? d.region : '',
          name: typeof d.region_name === 'string' ? d.region_name : '',
        };
      } catch {
        return { code: '', name: '' };
      }
    };

    const [registeredRegion, currentRegion] = await Promise.all([
      fetchRegion(`registered_region?username=${encodeURIComponent(username)}`),
      uid ? fetchRegion(`current_region?user_id=${encodeURIComponent(uid)}`) : Promise.resolve({ code: '', name: '' }),
    ]);

    const region = (user as { region?: string }).region || registeredRegion.code || currentRegion.code || '';

    // Deep-scan the whole upstream payload for any field that may hold a "last change" date.
    const INTEREST = /modify|change|unique|nickname|nick_name|username|user_name|display|history|edit|time/i;
    const matchedFields: Record<string, unknown> = {};
    const walk = (node: unknown, path: string, depth = 0) => {
      if (depth > 6 || node == null) return;
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
        return;
      }
      if (typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          const p = path ? `${path}.${k}` : k;
          if (INTEREST.test(k) && (typeof v !== 'object' || v === null)) matchedFields[p] = v;
          walk(v, p, depth + 1);
        }
      }
    };
    walk(payload, '');

    // Prefer any explicit username-change field over uniqueIdModifyTime.
    const USERNAME_CHANGE = /(unique|user_?name|handle).*(modify|change|edit|update)|(last).*(unique|user_?name)/i;
    let usernameChangeField: string | null = null;
    let usernameChangeValue: unknown = null;
    for (const [k, v] of Object.entries(matchedFields)) {
      const leaf = k.split('.').pop() ?? k;
      if (leaf === 'uniqueIdModifyTime') continue;
      if (USERNAME_CHANGE.test(leaf) && v != null && v !== '') {
        usernameChangeField = k;
        usernameChangeValue = v;
        break;
      }
    }

    const rawTimes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(matchedFields)) {
      if (/modify|change|time/i.test(k)) rawTimes[k] = v;
    }

    // Deep-scan for gift/support level and story availability.
    let giftLevel: number | null = null;
    let hasStories: boolean | null = null;
    const scan2 = (node: unknown, depth = 0) => {
      if (depth > 6 || node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach((v) => scan2(v, depth + 1)); return; }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (giftLevel == null && /level/i.test(k) && (typeof v === 'number' || typeof v === 'string')) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0 && n < 1000) giftLevel = n;
        }
        if (hasStories == null && /stor(y|ies)/i.test(k)) {
          if (typeof v === 'boolean') hasStories = v;
          else if (typeof v === 'number') hasStories = v > 0;
          else if (Array.isArray(v)) hasStories = v.length > 0;
        }
        scan2(v, depth + 1);
      }
    };
    scan2(payload);

    return json({
      rawTimes,
      rawResponse: payload,
      matchedFields,
      usernameChangeField,
      usernameChangeValue,

      profile: {
        avatar: user.avatarLarger || user.avatarMedium || user.avatarThumb || '',
        nickname: user.nickname ?? '',
        username: user.uniqueId ?? username,
        signature: user.signature ?? '',
        verified: Boolean(user.verified),
        privateAccount: Boolean(user.privateAccount),
        id: user.id ?? '',
        secUid: user.secUid ?? '',
        region,
        registeredRegion,
        currentRegion,
        language: user.language ?? '',
        createTime: num(user.createTime),
        uniqueIdModifyTime: num(user.uniqueIdModifyTime),
        nickNameModifyTime: num(user.nickNameModifyTime),
        bioLink: (user.bioLink as { link?: string } | undefined)?.link ?? '',
        giftLevel,
        hasStories,
      },
      stats: {
        followers: num(stats.followerCount),
        following: num(stats.followingCount),
        likes: num(stats.heartCount ?? stats.heart),
        videos: num(stats.videoCount),
        friends: num(stats.friendCount),
      },
    });

  } catch (_e) {
    return json({ error: 'UNKNOWN' }, 500);
  }
});
