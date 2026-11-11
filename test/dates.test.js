import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromJsonLd, fromMeta, fromTimeTags, fromPaths, fromWayback, fromLastModified, judge, badgeText, fmtDay } from '../lib/dates.js';
import { diffBlocks } from '../lib/diff.js';
import { applyFilter, removeFilter, isActive, detectEngine } from '../lib/search-url.js';

const NOW = new Date('2026-11-10T00:00:00Z');
const html = readFileSync(new URL('./fixture.html', import.meta.url), 'utf8');
const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const metas = [...html.matchAll(/<meta property="([^"]+)" content="([^"]+)"/g)].map((m) => ({ name: m[1], content: m[2] }));
const times = [...html.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);
const imgs = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);

test('首发与更新相差超 1 年 → revamped', () => {
  const evidence = [...fromJsonLd(ld, NOW), ...fromMeta(metas, NOW), ...fromTimeTags(times, NOW), ...fromPaths(imgs, NOW)];
  const result = judge(evidence);
  assert.equal(result.kind, 'revamped');
  assert.equal(badgeText(result), '📝 Published 2019-05 · Updated 2026-11');
});

test('路径取最早年月', () => {
  const [hit] = fromPaths(imgs, NOW);
  assert.equal(hit.raw.slice(0, 7), '2019-05');
});

test('页面声明了首发日期时，旧图片路径与档案馆只作旁证', () => {
  const evidence = [
    ...fromMeta([{ name: 'article:published_time', content: '2026-03-01' }], NOW),
    ...fromPaths(['https://x.com/uploads/2019/05/a.jpg'], NOW),
    ...fromWayback('20190510000000', NOW),
  ];
  const result = judge(evidence);
  assert.equal(result.kind, 'ai');
  assert.equal(fmtDay(result.first), '2026-03-01');
});

test('隐藏日期：仅 Wayback → hidden', () => {
  const result = judge(fromWayback('20200812093000', NOW));
  assert.equal(badgeText(result), '🕵️ Hidden date · First archived 2020-08');
});

test('正常日期：2023 前 / 后', () => {
  const human = judge(fromMeta([{ name: 'article:published_time', content: '2021-03-14' }], NOW));
  const ai = judge(fromMeta([{ name: 'article:published_time', content: '2025-07-19' }], NOW));
  assert.equal(badgeText(human), '🟢 Pre-AI Era · Published 2021-03-14');
  assert.equal(badgeText(ai), '🤖 Post-2023 · Published 2025-07-19');
});

test('非法日期与无证据', () => {
  assert.equal(fromWayback('garbage', NOW).length, 0);
  assert.equal(fromMeta([{ name: 'date', content: '1980-01-01' }], NOW).length, 0);
  assert.equal(judge([]).kind, 'none');
});

test('搜索 URL 过滤', () => {
  const g = new URL('https://www.google.com/search?q=foo');
  const on = applyFilter(g, 'google', 2023);
  assert.equal(on.searchParams.get('q'), 'foo before:2023-01-01');
  assert.ok(isActive(on, 'google'));
  assert.equal(removeFilter(on, 'google').searchParams.get('q'), 'foo');

  const d = applyFilter(new URL('https://duckduckgo.com/?q=foo'), 'ddg', 2023);
  assert.equal(d.searchParams.get('df'), '1995-01-01..2022-12-31');
  assert.equal(detectEngine(d), 'ddg');

  const b = applyFilter(new URL('https://www.bing.com/search?q=foo'), 'bing', 2023);
  assert.equal(b.searchParams.get('filters'), 'ex1:"ez5_9131_19357"');
  assert.ok(!isActive(removeFilter(b, 'bing'), 'bing'));
});

test('diff：识别新增 / 改动 / 删除，忽略数字噪音', () => {
  const oldTexts = [
    'This guide explains how to install the tool on every platform. Views: 100',
    'Configuration is stored in a single yaml file in your home directory.',
    'This paragraph was deleted from the later version of the article.',
  ];
  const newTexts = [
    'This guide explains how to install the tool on every platform. Views: 9999',
    'Configuration is stored in a single yaml file in your home directory, plus an optional override.',
    'A brand new section about plugins and extensions that did not exist before.',
  ];
  const d = diffBlocks(oldTexts, newTexts);
  assert.equal(d.unchanged, 1);
  assert.deepEqual(d.modified, [1]);
  assert.deepEqual(d.added, [2]);
  assert.deepEqual(d.removed, [2]);
  assert.equal(d.rewritten, false);
});

test('diff：整篇重写 → rewritten', () => {
  const d = diffBlocks(['alpha beta gamma delta epsilon zeta eta theta'], ['completely different words appear here instead now']);
  assert.equal(d.rewritten, true);
});

test('Last-Modified：有效值 → lastmod；缺失（等于当前时间）→ 忽略', () => {
  const valid = judge(fromLastModified('03/05/2024 10:20:30', NOW));
  assert.equal(valid.kind, 'lastmod');
  assert.equal(badgeText(valid), '🕰️ No pub date · Last-Modified 2024-03 (unverified)');
  assert.equal(fromLastModified(new Date(NOW - 5000).toUTCString(), NOW).length, 0);
});

test('Wayback 日期优先于 Last-Modified', () => {
  const r = judge([...fromLastModified('03/05/2024 10:20:30', NOW), ...fromWayback('20200812000000', NOW)]);
  assert.equal(r.kind, 'hidden');
});

test('diff：中文追加一句 → 改动而非重写', () => {
  const oldText = '这篇文章介绍了如何在各个平台上安装这个工具，并说明了基本的配置方法。';
  const d = diffBlocks([oldText], [`${oldText}此外还补充了插件的使用说明。`]);
  assert.deepEqual(d.modified, [0]);
  assert.equal(d.rewritten, false);
});

test('diff：全部段落轻微改动 → 不算重写', () => {
  const oldTexts = [
    'The first section describes installation steps for the tool in detail.',
    'The second section describes configuration options for the tool in detail.',
    'The third section describes troubleshooting tips for the tool in detail.',
  ];
  const newTexts = oldTexts.map((t) => `${t} Updated recently.`);
  const d = diffBlocks(oldTexts, newTexts);
  assert.equal(d.modified.length, 3);
  assert.equal(d.rewritten, false);
});
