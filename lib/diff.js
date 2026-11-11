// 段落级正文 diff：只在本地比较，不上传任何内容。
const MIN_LEN = 20;
const SAME_THRESHOLD = 0.6;
const REWRITE_THRESHOLD = 0.3;
const SKIP = 'nav,aside,footer,header,script,style,form,noscript';

// 从任意 DOM 根（真实页面或 DOMParser 结果）提取正文块
export function extractBlocks(doc) {
  const root = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body;
  if (!root) return [];

  return [...root.querySelectorAll('p,li,h1,h2,h3,h4,blockquote')]
    .filter((el) => !el.closest(SKIP))
    .map((el) => ({ el, text: el.textContent.replace(/\s+/g, ' ').trim() }))
    .filter((b) => b.text.length >= MIN_LEN);
}

// 忽略大小写、空白与数字，避免日期、阅读量之类的噪音
const normalize = (s) => s.toLowerCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim();

// 西文按词，汉字按二元组（整段汉字连在一起时没有词边界）
function words(s) {
  const runs = normalize(s).match(/\p{Script=Han}+|\p{L}+/gu) ?? [];
  const tokens = runs.flatMap((run) => {
    if (!/\p{Script=Han}/u.test(run)) return [run];
    const chars = [...run];
    return chars.length === 1 ? chars : chars.slice(1).map((c, i) => chars[i] + c);
  });
  return new Set(tokens);
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common += 1;
  return common / (a.size + b.size - common);
}

// 返回 added / modified（现页段落下标）、removed（旧页段落下标）与相似度
export function diffBlocks(oldTexts, newTexts) {
  const oldNorm = oldTexts.map(normalize);
  const oldWords = oldTexts.map(words);
  const usedOld = new Set();
  const added = [];
  const modified = [];
  let unchanged = 0;

  newTexts.forEach((text, i) => {
    const norm = normalize(text);
    const exact = oldNorm.findIndex((o, j) => !usedOld.has(j) && o === norm);
    if (exact >= 0) {
      usedOld.add(exact);
      unchanged += 1;
      return;
    }

    const ws = words(text);
    let best = -1;
    let bestScore = 0;
    oldWords.forEach((ow, j) => {
      if (usedOld.has(j)) return;
      const score = jaccard(ws, ow);
      if (score > bestScore) { best = j; bestScore = score; }
    });

    if (bestScore >= SAME_THRESHOLD) {
      usedOld.add(best);
      modified.push(i);
      return;
    }
    added.push(i);
  });

  const removed = oldTexts.map((_, j) => j).filter((j) => !usedOld.has(j));
  const total = Math.max(oldTexts.length, newTexts.length);
  // 轻度改动的段落同样属于"内容仍在"，要计入相似度
  const similarity = total ? (unchanged + modified.length) / total : 0;
  return { added, modified, removed, unchanged, similarity, rewritten: similarity < REWRITE_THRESHOLD };
}
