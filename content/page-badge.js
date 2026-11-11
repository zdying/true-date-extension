import { extractBlocks, diffBlocks } from '../lib/diff.js';
import { fromJsonLd, fromMeta, fromTimeTags, fromPaths, fromWayback, fromLastModified, judge, badgeText } from '../lib/dates.js';

const api = globalThis.browser ?? globalThis.chrome;
const SKIP_HOSTS = /(^|\.)(youtube\.com|youtu\.be|twitter\.com|x\.com|facebook\.com|instagram\.com|tiktok\.com|reddit\.com|linkedin\.com|mail\.google\.com)$/;
const ARTICLE_TYPE = /"@type"\s*:\s*\[?\s*"[A-Za-z]*(Article|BlogPosting)"/;
const DIFF_STYLE_ID = 'truedate-diff-style';

const THEMES = {
  revamped: { bg: '#fffbeb', fg: '#92400e', border: '#fcd34d', accent: '#f59e0b', pill: '#fef3c7' },
  hidden:   { bg: '#eff6ff', fg: '#1e40af', border: '#93c5fd', accent: '#3b82f6', pill: '#dbeafe' },
  human:    { bg: '#ecfdf5', fg: '#065f46', border: '#6ee7b7', accent: '#10b981', pill: '#d1fae5' },
  ai:       { bg: '#f8fafc', fg: '#334155', border: '#cbd5e1', accent: '#64748b', pill: '#e2e8f0' },
  unknown:  { bg: '#f8fafc', fg: '#334155', border: '#cbd5e1', accent: '#64748b', pill: '#e2e8f0' },
  lastmod:  { bg: '#f8fafc', fg: '#334155', border: '#cbd5e1', accent: '#64748b', pill: '#e2e8f0' },
};

const now = new Date();
let host = null;
let localEvidence = [];
let waybackEvidence = [];
let diffHtml = '';
let highlightedEls = [];

main();

// 默认只在本地分析；Wayback 会把 URL 发给第三方，必须由用户点击触发
function main() {
  if (location.pathname === '/' || SKIP_HOSTS.test(location.hostname)) return;

  const jsonLdTexts = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent);
  const metas = [...document.querySelectorAll('meta')].map((m) => ({
    name: m.getAttribute('property') ?? m.getAttribute('name'),
    content: m.getAttribute('content'),
  }));
  const timeValues = [...document.querySelectorAll('time[datetime]')].map((t) => t.getAttribute('datetime'));
  const imgUrls = [...document.querySelectorAll('article img, main img')].map((i) => i.currentSrc || i.src);

  localEvidence = [
    ...fromJsonLd(jsonLdTexts, now),
    ...fromMeta(metas, now),
    ...fromTimeTags(timeValues, now),
    ...fromPaths([location.href, ...imgUrls], now),
  ];

  // 页面没有任何日期线索时，才退而求其次看服务器的 Last-Modified
  if (!localEvidence.some((e) => e.layer === 1)) {
    localEvidence.push(...fromLastModified(document.lastModified, now));
  }

  const declared = localEvidence.some((e) => e.layer === 1 && e.role === 'published');
  const articleLike = declared
    || document.querySelector('article')
    || jsonLdTexts.some((t) => ARTICLE_TYPE.test(t));
  if (!articleLike) return;

  render();
}

// 对比首发时期的快照，高亮现页中新增 / 改动的段落
async function compareOld(firstDate) {
  diffHtml = '<div class="diff-box">⏳ Fetching original snapshot from Internet Archive…</div>';
  render({ openCard: true });

  const reply = await api.runtime.sendMessage({ type: 'wayback-snapshot', url: location.href, target: firstDate.toISOString() });
  if (!reply?.html) {
    diffHtml = '<div class="diff-box">No historical snapshot available for comparison.</div>';
    return render({ openCard: true });
  }

  const oldDoc = new DOMParser().parseFromString(reply.html, 'text/html');
  const oldBlocks = extractBlocks(oldDoc);
  const newBlocks = extractBlocks(document);
  if (!oldBlocks.length || !newBlocks.length) {
    diffHtml = '<div class="diff-box">No comparable article body in snapshot (likely JS-rendered).</div>';
    return render({ openCard: true });
  }

  const diff = diffBlocks(oldBlocks.map((b) => b.text), newBlocks.map((b) => b.text));
  const snap = `${reply.timestamp.slice(0, 4)}-${reply.timestamp.slice(4, 6)}-${reply.timestamp.slice(6, 8)}`;
  const removedList = diff.removed.slice(0, 4)
    .map((j) => `<li>${esc(oldBlocks[j].text.slice(0, 100))}…</li>`).join('');

  if (diff.rewritten) {
    diffHtml = `<div class="diff-box">Compared to <b>${snap}</b> snapshot, content was heavily rewritten (${Math.round(diff.similarity * 100)}% retained).</div>`;
    return render({ openCard: true });
  }

  highlight([...diff.added, ...diff.modified].map((i) => newBlocks[i].el));
  diffHtml = `
    <div class="diff-box">
      <div class="diff-title">Diff vs. <b>${snap}</b> snapshot (highlighted on page):</div>
      <div class="diff-stats">
        <span class="chip">+${diff.added.length} added</span>
        <span class="chip">~${diff.modified.length} edited</span>
        <span class="chip">-${diff.removed.length} removed</span>
      </div>
      ${removedList ? `<details><summary>View removed paragraphs (${diff.removed.length})</summary><ul class="removed">${removedList}</ul></details>` : ''}
    </div>`;
  render({ openCard: true });
}

function highlight(elements) {
  clearHighlights();
  if (!elements.length) return;
  if (globalThis.CSS?.highlights) {
    if (!document.getElementById(DIFF_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = DIFF_STYLE_ID;
      style.textContent = '::highlight(truedate-diff){background-color:#fde68a;color:#111827;}';
      document.head.append(style);
    }
    const ranges = elements.map((el) => {
      const range = new Range();
      range.selectNodeContents(el);
      return range;
    });
    CSS.highlights.set('truedate-diff', new Highlight(...ranges));
    elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  highlightedEls = elements.map((el) => ({ el, bg: el.style.backgroundColor }));
  elements.forEach((el) => { el.style.backgroundColor = '#fde68a'; });
  elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearHighlights() {
  globalThis.CSS?.highlights?.delete?.('truedate-diff');
  highlightedEls.forEach(({ el, bg }) => { el.style.backgroundColor = bg; });
  highlightedEls = [];
}

async function queryWayback() {
  const reply = await api.runtime.sendMessage({ type: 'wayback-earliest', url: location.href });
  waybackEvidence = fromWayback(reply?.timestamp, now);
  render({ openCard: true, waybackDone: true });
}

function render({ openCard = false, waybackDone = false } = {}) {
  const result = judge([...localEvidence, ...waybackEvidence]);
  const kind = result.kind === 'none' ? 'unknown' : result.kind;
  const theme = THEMES[kind] ?? THEMES.unknown;

  host?.remove();
  host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });

  const rows = result.evidence
    .map((e) => `
      <li class="ev-row">
        <span class="ev-tag">L${e.layer}</span>
        <span class="ev-src">${esc(e.source)}</span>
        <span class="ev-val" title="${esc(e.raw)}">${esc(e.raw)}</span>
      </li>`)
    .join('');

  const archive = `https://web.archive.org/web/0/${encodeURI(location.href)}`;
  const waybackNote = waybackDone && !waybackEvidence.length
    ? '<div class="note">No snapshot found for this URL in Internet Archive</div>'
    : '';
  const diffButton = result.kind === 'revamped' && !diffHtml
    ? '<button class="btn" id="diff"><span>🔍 Compare with original snapshot</span><small>Fetches archived HTML from archive.org on click</small></button>'
    : '';
  const queryButton = waybackDone
    ? `<a class="link-btn" href="${archive}" target="_blank" rel="noopener">Open in Wayback Machine ↗</a>`
    : '<button class="btn" id="wb"><span>🏛️ Check Wayback earliest snapshot</span><small>Only sends current URL to archive.org on click</small></button>';

  root.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .badge {
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
        background: ${theme.bg};
        color: ${theme.fg};
        border: 1px solid ${theme.border};
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 4px 10px -2px rgba(15, 23, 42, 0.08);
        width: max-content;
        max-width: min(390px, calc(100vw - 32px));
        overflow: hidden;
        transition: box-shadow 0.2s ease;
      }
      .badge:hover {
        box-shadow: 0 14px 30px -5px rgba(15, 23, 42, 0.2), 0 6px 12px -2px rgba(15, 23, 42, 0.1);
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px 8px 12px;
        user-select: none;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${theme.accent};
        flex-shrink: 0;
      }
      .text {
        cursor: pointer;
        flex: 1;
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .chev {
        cursor: pointer;
        font-size: 11px;
        opacity: 0.65;
        padding: 2px 4px;
        transition: transform 0.2s ease;
      }
      .badge.is-open .chev {
        transform: rotate(180deg);
      }
      .x {
        cursor: pointer;
        opacity: 0.55;
        width: 22px;
        height: 22px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        font-size: 12px;
        transition: background 0.15s, opacity 0.15s;
      }
      .x:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.07);
      }
      .card {
        display: none;
        padding: 10px 12px 12px;
        border-top: 1px solid ${theme.border};
        background: rgba(255, 255, 255, 0.65);
        font-size: 12px;
      }
      .badge.is-open .card {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .sec-label {
        font-size: 11px;
        font-weight: 600;
        opacity: 0.7;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .ev-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .ev-row {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(255, 255, 255, 0.75);
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 7px;
        padding: 4px 7px;
      }
      .ev-tag {
        font-size: 10px;
        font-weight: 700;
        background: ${theme.pill};
        color: ${theme.fg};
        padding: 1px 5px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .ev-src {
        font-weight: 600;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .ev-val {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 11px;
        opacity: 0.85;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .empty {
        opacity: 0.75;
        font-style: italic;
        padding: 2px 0;
      }
      .note {
        padding: 5px 8px;
        border-radius: 6px;
        background: ${theme.pill};
        font-size: 11.5px;
      }
      .btn {
        all: unset;
        box-sizing: border-box;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        padding: 7px 10px;
        border-radius: 8px;
        background: #ffffff;
        border: 1px solid ${theme.border};
        color: ${theme.fg};
        cursor: pointer;
        transition: background 0.15s, transform 0.1s;
      }
      .btn:hover {
        background: ${theme.pill};
      }
      .btn:active {
        transform: scale(0.99);
      }
      .btn span {
        font-weight: 600;
        font-size: 12px;
      }
      .btn small {
        font-size: 10.5px;
        opacity: 0.7;
      }
      .link-btn {
        display: inline-block;
        color: ${theme.fg};
        font-weight: 600;
        text-decoration: none;
        padding: 4px 2px;
      }
      .link-btn:hover {
        text-decoration: underline;
      }
      .diff-box {
        padding: 8px 10px;
        border-radius: 8px;
        background: #ffffff;
        border: 1px solid ${theme.border};
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .diff-stats {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .chip {
        background: ${theme.pill};
        padding: 2px 7px;
        border-radius: 999px;
        font-weight: 600;
        font-size: 11px;
      }
      details summary {
        cursor: pointer;
        font-weight: 600;
        font-size: 11.5px;
        margin-top: 2px;
      }
      .removed {
        margin: 4px 0 0;
        padding-left: 16px;
        font-size: 11px;
        opacity: 0.85;
      }
    </style>
    <div class="badge ${openCard ? 'is-open' : ''}" id="badge">
      <div class="head">
        <span class="dot"></span>
        <span class="text" id="text">${esc(badgeText({ ...result, kind }))}</span>
        <span class="chev" id="chev" title="Toggle evidence details">▾</span>
        <span class="x" id="x" title="Dismiss">✕</span>
      </div>
      <div class="card" id="card">
        <div class="sec-label">Evidence Chain (${result.evidence.length})</div>
        ${rows ? `<ul class="ev-list">${rows}</ul>` : '<div class="empty">No local date metadata found on page</div>'}
        ${waybackNote}
        ${queryButton}
        ${diffButton}
        ${diffHtml}
      </div>
    </div>`;

  const toggleCard = () => root.getElementById('badge').classList.toggle('is-open');
  root.getElementById('text').addEventListener('click', toggleCard);
  root.getElementById('chev').addEventListener('click', toggleCard);
  root.getElementById('x').addEventListener('click', () => {
    clearHighlights();
    host.remove();
  });
  root.getElementById('diff')?.addEventListener('click', () => compareOld(result.first));
  root.getElementById('wb')?.addEventListener('click', queryWayback);
  document.documentElement.append(host);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
