// 仅负责请求 Internet Archive 最早快照，并缓存结果（含"无快照"）。
const api = globalThis.browser ?? globalThis.chrome;
const CACHE_PREFIX = 'wb:';
const MAX_HTML = 3_000_000;

function stripHash(url) {
  return url.split('#')[0];
}

async function fetchEarliest(url) {
  const key = CACHE_PREFIX + url;
  const cached = (await api.storage.local.get(key))[key];
  if (cached !== undefined) return cached.timestamp;

  const endpoint = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=1&fl=timestamp`;
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CDX ${res.status}`);

  // 返回形如 [["timestamp"],["20180412..."]]，无记录时为 []
  const rows = await res.json();
  const timestamp = rows[1]?.[0] ?? null;
  await api.storage.local.set({ [key]: { timestamp } });
  return timestamp;
}

// 取离目标日期最近的快照原始 HTML（id_ 表示不带 Wayback 工具栏与链接改写）
async function fetchSnapshot(url, targetIso) {
  const target = targetIso.replace(/\D/g, '').slice(0, 8);
  const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=1&fl=timestamp&filter=statuscode:200&sort=closest&closest=${target}`;
  const res = await fetch(cdx, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CDX ${res.status}`);

  const timestamp = (await res.json())[1]?.[0];
  if (!timestamp) return { timestamp: null, html: null };

  const page = await fetch(`https://web.archive.org/web/${timestamp}id_/${url}`, { signal: AbortSignal.timeout(15000) });
  if (!page.ok) throw new Error(`snapshot ${page.status}`);
  return { timestamp, html: (await page.text()).slice(0, MAX_HTML) };
}

const handlers = {
  'wayback-earliest': (msg) => fetchEarliest(stripHash(msg.url)).then((timestamp) => ({ timestamp })),
  'wayback-snapshot': (msg) => fetchSnapshot(stripHash(msg.url), msg.target),
};

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler || typeof msg.url !== 'string') return false;

  handler(msg)
    .then(sendResponse)
    .catch(() => sendResponse({ timestamp: null, html: null, error: true }));
  return true;
});
