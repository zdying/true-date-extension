// 经典脚本入口：content script 不能直接用静态 import，这里动态加载 ES Module。
(async () => {
  const api = globalThis.browser ?? globalThis.chrome;
  const load = (path) => import(api.runtime.getURL(path));

  const { detectEngine, isSearchHost } = await load('lib/search-url.js');
  const url = new URL(location.href);

  if (detectEngine(url)) return load('content/search-ui.js');
  if (isSearchHost(url.hostname)) return;
  return load('content/page-badge.js');
})();
