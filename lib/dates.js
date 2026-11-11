// 日期证据的提取与判定，全部是纯函数（不碰 DOM），便于单元测试。
export const AI_CUTOFF = new Date('2023-01-01T00:00:00Z');
export const MIN_YEAR = 1995;
const DAY_MS = 86400000;
const STALE_DAYS = 365;

const PUBLISHED_META = ['article:published_time', 'og:published_time', 'pubdate', 'publishdate', 'date', 'dc.date'];
const MODIFIED_META = ['article:modified_time'];
const JSONLD_PUBLISHED = ['datePublished', 'dateCreated'];
const JSONLD_MODIFIED = ['dateModified'];

export function parseDate(value, now = new Date()) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  if (year < MIN_YEAR || year > now.getUTCFullYear() + 1) return null;
  return date;
}

export const fmtMonth = (d) => d.toISOString().slice(0, 7);
export const fmtDay = (d) => d.toISOString().slice(0, 10);

function walk(node, visit) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (node === null || typeof node !== 'object') return;
  visit(node);
  Object.values(node).forEach((n) => walk(n, visit));
}

// 第 1 层：JSON-LD（递归遍历，自然覆盖嵌套数组与 @graph）
export function fromJsonLd(texts, now) {
  const found = [];
  for (const text of texts) {
    let data;
    try { data = JSON.parse(text); } catch { continue; }

    walk(data, (obj) => {
      for (const key of [...JSONLD_PUBLISHED, ...JSONLD_MODIFIED]) {
        const date = parseDate(obj[key], now);
        if (!date) continue;
        const role = JSONLD_MODIFIED.includes(key) ? 'modified' : 'published';
        found.push({ layer: 1, source: `JSON-LD ${key}`, raw: obj[key], date, role });
      }
    });
  }
  return found;
}

export function fromMeta(metas, now) {
  const found = [];
  for (const { name, content } of metas) {
    const key = (name ?? '').toLowerCase();
    const date = parseDate(content, now);
    if (!date) continue;
    if (PUBLISHED_META.includes(key)) found.push({ layer: 1, source: `meta ${key}`, raw: content, date, role: 'published' });
    if (MODIFIED_META.includes(key)) found.push({ layer: 1, source: `meta ${key}`, raw: content, date, role: 'modified' });
  }
  return found;
}

export function fromTimeTags(values, now) {
  return values
    .map((raw) => ({ raw, date: parseDate(raw, now) }))
    .filter((x) => x.date)
    .map(({ raw, date }) => ({ layer: 1, source: '<time datetime>', raw, date, role: 'published' }));
}

// 第 2 层：URL / 图片路径中的 /YYYY/MM/，取最早一个
export function fromPaths(urls, now) {
  const pattern = /\/((?:19|20)\d{2})\/(0[1-9]|1[0-2])(?=\/|$)/;
  const found = [];
  for (const url of urls) {
    const match = pattern.exec(url ?? '');
    if (!match) continue;
    const raw = `${match[1]}-${match[2]}`;
    const date = parseDate(`${raw}-01`, now);
    if (date) found.push({ layer: 2, source: 'URL/Image Path', raw: `${raw}  (${url})`, date, role: 'published' });
  }
  return found.sort((a, b) => a.date - b.date).slice(0, 1);
}

// 第 3 层：Wayback 14 位时间戳 → Date
export function fromWayback(timestamp, now) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(timestamp ?? '');
  if (!m) return [];
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const date = parseDate(iso, now);
  return date ? [{ layer: 3, source: 'Wayback Earliest', raw: timestamp, date, role: 'published' }] : [];
}

// document.lastModified 来自 Last-Modified 响应头；缺失时浏览器会返回"当前时间"，
// 所以与当前时间几乎相同的值视为无效。它只是弱证据：动态页面常常返回生成时间。
export function fromLastModified(text, now) {
  const date = parseDate(text, now);
  if (!date || now - date < 60_000) return [];
  return [{ layer: 4, source: 'HTTP Last-Modified (weak)', raw: text, date, role: 'modified' }];
}

const earliest = (items) => items.reduce((min, e) => (!min || e.date < min.date ? e : min), null);
const latest = (items) => items.reduce((max, e) => (!max || e.date > max.date ? e : max), null);

// 把所有证据归并成一个徽章结论：页面自己声明了首发日期就以它为准，
// 路径 / 档案馆只作旁证；仅在页面没声明时才拿 L2/L3 当结论。
export function judge(evidence) {
  const published = evidence.filter((e) => e.role === 'published');
  const modified = latest(evidence.filter((e) => e.role === 'modified'));
  const declared = published.filter((e) => e.layer === 1);

  if (!declared.length) {
    const guess = earliest(published);
    if (!guess) {
      return modified
        ? { kind: 'lastmod', modified: modified.date, evidence }
        : { kind: 'none', evidence };
    }
    return { kind: 'hidden', first: guess.date, via: guess.layer, evidence };
  }

  const first = earliest(declared);
  if (modified && (modified.date - first.date) / DAY_MS > STALE_DAYS) {
    return { kind: 'revamped', first: first.date, modified: modified.date, evidence };
  }
  return { kind: first.date < AI_CUTOFF ? 'human' : 'ai', first: first.date, evidence };
}

export function badgeText(result) {
  switch (result.kind) {
    case 'revamped':
      return `📝 Published ${fmtMonth(result.first)} · Updated ${fmtMonth(result.modified)}`;
    case 'hidden': {
      const by = result.via === 3 ? 'First archived' : 'Path hints';
      return `🕵️ Hidden date · ${by} ${fmtMonth(result.first)}`;
    }
    case 'human': return `🟢 Pre-AI Era · Published ${fmtDay(result.first)}`;
    case 'ai': return `🤖 Post-2023 · Published ${fmtDay(result.first)}`;
    case 'lastmod': return `🕰️ No pub date · Last-Modified ${fmtMonth(result.modified)} (unverified)`;
    case 'unknown': return '🕰️ No date declared · Click to check archive';
    default: return '';
  }
}
