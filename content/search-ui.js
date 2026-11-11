import { detectEngine, isActive, applyFilter, removeFilter, YEARS, DEFAULT_YEAR } from '../lib/search-url.js';

const api = globalThis.browser ?? globalThis.chrome;
const REDIRECT_GUARD = 'truedate:redirected';

let host = null;
let lastHref = null;

init();
// DuckDuckGo 等站点是 SPA 导航，页面不会重载，需监听 URL 变化重新初始化
setInterval(() => {
  if (location.href !== lastHref) init();
}, 500);

async function init() {
  lastHref = location.href;
  host?.remove();
  host = null;

  const url = new URL(location.href);
  const engine = detectEngine(url);
  if (!engine) return;

  const prefs = await api.storage.local.get({ preEnabled: false, preYear: DEFAULT_YEAR });
  const active = isActive(url, engine);

  // 偏好为开启但当前结果未过滤：自动补上一次；用 sessionStorage 防止被引擎剥离参数后死循环
  if (prefs.preEnabled && !active && !sessionStorage.getItem(REDIRECT_GUARD)) {
    sessionStorage.setItem(REDIRECT_GUARD, '1');
    location.replace(applyFilter(url, engine, prefs.preYear));
    return;
  }
  sessionStorage.removeItem(REDIRECT_GUARD);
  renderPill({ url, engine, on: active, year: prefs.preYear });
}

function renderPill({ url, engine, on, year }) {
  host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });

  const options = YEARS
    .map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>&lt; ${y}-01-01</option>`)
    .join('');

  root.innerHTML = `
    <style>
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font: 600 12.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
        background: ${on ? '#065f46' : '#ffffff'};
        color: ${on ? '#ffffff' : '#1e293b'};
        border: 1px solid ${on ? '#047857' : '#cbd5e1'};
        border-radius: 999px;
        padding: 6px 8px 6px 12px;
        box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.16), 0 4px 10px -2px rgba(15, 23, 42, 0.08);
        user-select: none;
        transition: all 0.18s ease;
      }
      .pill:hover {
        box-shadow: 0 14px 28px -5px rgba(15, 23, 42, 0.22), 0 6px 12px -2px rgba(15, 23, 42, 0.12);
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${on ? '#34d399' : '#94a3b8'};
        box-shadow: ${on ? '0 0 0 3px rgba(52, 211, 153, 0.25)' : 'none'};
      }
      button {
        all: unset;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 2px 2px;
      }
      .state {
        font-size: 10.5px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 999px;
        background: ${on ? 'rgba(255, 255, 255, 0.2)' : '#f1f5f9'};
        color: ${on ? '#ecfdf5' : '#64748b'};
      }
      select {
        font: 600 11.5px/1 inherit;
        border: 1px solid ${on ? 'rgba(255, 255, 255, 0.25)' : '#e2e8f0'};
        border-radius: 999px;
        padding: 4px 8px;
        background: ${on ? 'rgba(0, 0, 0, 0.18)' : '#f8fafc'};
        color: ${on ? '#ffffff' : '#334155'};
        cursor: pointer;
        outline: none;
      }
      select option {
        background: #ffffff;
        color: #1e293b;
      }
    </style>
    <div class="pill">
      <button id="toggle" title="Toggle Pre-AI Era search filter">
        <span class="dot"></span>
        <span>🕰️ Pre-${year}</span>
        <span class="state">${on ? 'ON' : 'OFF'}</span>
      </button>
      <select id="year" title="Select cutoff year">${options}</select>
    </div>`;

  const selected = () => Number(root.getElementById('year').value);

  async function go(enable, y) {
    await api.storage.local.set({ preEnabled: enable, preYear: y });
    sessionStorage.removeItem(REDIRECT_GUARD);
    location.assign(enable ? applyFilter(url, engine, y) : removeFilter(url, engine));
  }

  root.getElementById('toggle').addEventListener('click', () => go(!on, selected()));
  // 已开启时切换年份立即生效；未开启时只记住选择
  root.getElementById('year').addEventListener('change', () => (
    on ? go(true, selected()) : api.storage.local.set({ preYear: selected() })
  ));

  document.documentElement.append(host);
}
