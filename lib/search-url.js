// 搜索引擎 URL 的"判断 / 添加 / 移除"日期过滤，纯函数，便于测试。
export const YEARS = [2023, 2022, 2021, 2020];
export const DEFAULT_YEAR = 2023;

const DAY_MS = 86400000;

export function isSearchHost(hostname) {
  return /(^|\.)google\.[a-z.]+$/.test(hostname)
    || /(^|\.)bing\.com$/.test(hostname)
    || /(^|\.)duckduckgo\.com$/.test(hostname);
}

export function detectEngine(url) {
  const { hostname, pathname, searchParams } = url;
  if (/(^|\.)google\.[a-z.]+$/.test(hostname) && pathname === '/search') return 'google';
  if (/(^|\.)bing\.com$/.test(hostname) && pathname === '/search') return 'bing';
  if (/(^|\.)duckduckgo\.com$/.test(hostname) && searchParams.has('q')) return 'ddg';
  return null;
}

function daysSinceEpoch(year) {
  return Math.floor(Date.UTC(year, 0, 1) / DAY_MS);
}

export function isActive(url, engine) {
  const { searchParams } = url;
  if (engine === 'google') return /(^|\s)before:\S+/.test(searchParams.get('q') ?? '');
  if (engine === 'bing') return (searchParams.get('filters') ?? '').includes('ez5_');
  return (searchParams.get('df') ?? '').includes('..');
}

export function removeFilter(url, engine) {
  const next = new URL(url);
  const { searchParams } = next;

  if (engine === 'google') {
    const q = (searchParams.get('q') ?? '').replace(/(^|\s)before:\S+/g, '').trim();
    searchParams.set('q', q);
    // Google 的日期范围参数也一并清掉，避免残留
    searchParams.delete('tbs');
  }
  if (engine === 'bing') searchParams.delete('filters');
  if (engine === 'ddg') searchParams.delete('df');
  return next;
}

export function applyFilter(url, engine, year) {
  const next = removeFilter(url, engine);
  const { searchParams } = next;

  if (engine === 'google') {
    const q = searchParams.get('q') ?? '';
    searchParams.set('q', `${q} before:${year}-01-01`.trim());
  }
  if (engine === 'bing') {
    // Bing 自定义日期范围：ez5_<起始天数>_<结束天数>（自 1970-01-01 起的天数）
    const end = daysSinceEpoch(year) - 1;
    searchParams.set('filters', `ex1:"ez5_${daysSinceEpoch(1995)}_${end}"`);
  }
  if (engine === 'ddg') searchParams.set('df', `1995-01-01..${year - 1}-12-31`);
  return next;
}
