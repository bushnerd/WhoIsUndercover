const fs = require('node:fs');
const path = require('node:path');

const oldHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const definitions = [
  ['wordBankSchool', 'study-work', [['文具教室', 20], ['校园生活', 20], ['职场日常', 20]]],
  ['wordBankGaming', 'digital-world', [['游戏世界', 20], ['网络平台', 20], ['数字生活', 20]]],
  ['wordBankFoodie', 'food-drink', [['小吃餐饮', 20], ['甜品饮品', 20], ['食材调料', 20]]],
  ['wordBankShow', 'screen-entertainment', [['综艺节目', 20], ['影视剧集', 20], ['动漫小说', 20]]],
  ['wordBankOutdoorLife', 'outdoor-travel', [['户外运动', 20], ['露营装备', 20], ['聚会旅行', 21]]],
];
const roots = [
  ['study-work', '学习与职场', [['stationery', '文具教室'], ['campus', '校园生活'], ['workplace', '职场日常']]],
  ['digital-world', '数码与网络', [['gaming', '游戏世界'], ['platforms', '网络平台'], ['digital-life', '数字生活']]],
  ['food-drink', '美食与饮品', [['street-food', '小吃餐饮'], ['desserts', '甜品饮品'], ['ingredients', '食材调料']]],
  ['screen-entertainment', '影视与文娱', [['variety', '综艺节目'], ['screen', '影视剧集'], ['anime-books', '动漫小说']]],
  ['outdoor-travel', '户外与旅行', [['outdoor-sports', '户外运动'], ['camping', '露营装备'], ['gathering-travel', '聚会旅行']]],
  ['animals', '动物世界', [['mammals', '哺乳动物'], ['birds-insects', '鸟类昆虫'], ['aquatic-life', '水生动物']]],
  ['nature', '自然地理', [['landforms', '山川地貌'], ['weather', '天气天象'], ['plants', '花草树木']]],
  ['home-life', '居家生活', [['kitchenware', '厨房餐具'], ['home-goods', '家居用品'], ['daily-life', '居家日常'], ['clothing', '服饰配件']]],
  ['city-travel', '城市出行', [['transport', '道路交通'], ['city-spaces', '城市出行'], ['travel-stays', '旅行住宿']]],
  ['sports-festivals', '运动与节庆', [['sports', '运动项目'], ['festivals', '节日庆典'], ['jobs-school', '职业校园']]],
];
const categories = [];
const leafIdByName = new Map();
for (const [rootId, rootName, children] of roots) {
  categories.push({ id: rootId, parentId: null, name: rootName });
  for (const [id, name] of children) {
    categories.push({ id, parentId: rootId, name });
    leafIdByName.set(name, id);
  }
}

const pairs = [];
const seen = new Set();
for (const [arrayName, rootId, children] of definitions) {
  const match = oldHtml.match(new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\n        \\];`));
  if (!match) throw new Error(`Could not locate ${arrayName}`);
  const oldPairs = [...match[1].matchAll(/\{\s*w1:\s*'([^']*)',\s*w2:\s*'([^']*)'\s*\}/g)].map((item) => [item[1], item[2]]);
  const expected = children.reduce((total, [, count]) => total + count, 0);
  if (oldPairs.length !== expected) throw new Error(`${arrayName}: expected ${expected}, found ${oldPairs.length}`);
  let offset = 0;
  for (const [categoryName, count] of children) {
    for (const [w1, w2] of oldPairs.slice(offset, offset + count)) {
      pairs.push({ id: `pair-${String(pairs.length + 1).padStart(3, '0')}`, categoryId: leafIdByName.get(categoryName), w1, w2 });
    }
    offset += count;
  }
}

for (const pair of pairs) seen.add([pair.w1, pair.w2].sort().join('\u0000'));
const extraRows = fs.readFileSync(path.join(__dirname, 'extra-pairs.txt'), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
if (extraRows.length !== 16) throw new Error(`Expected 16 new leaf categories, found ${extraRows.length}`);
for (const [rowIndex, row] of extraRows.entries()) {
  const [categoryName, ...tokens] = row.split('|');
  if (!leafIdByName.has(categoryName)) throw new Error(`Unknown new category ${categoryName}`);
  const target = rowIndex < 11 ? 19 : 18;
  let assigned = 0;
  for (const token of tokens) {
    const words = token.split('/');
    if (words.length !== 2) throw new Error(`Invalid pair: ${token}`);
    const key = words.slice().sort().join('\u0000');
    if (seen.has(key) || assigned >= target) continue;
    seen.add(key);
    pairs.push({ id: `pair-${String(pairs.length + 1).padStart(3, '0')}`, categoryId: leafIdByName.get(categoryName), w1: words[0], w2: words[1] });
    assigned += 1;
  }
  if (assigned < target) throw new Error(`${categoryName}: expected ${target} unique pairs, found ${assigned}`);
}

for (const pair of pairs) {
  if (!pair.w1.trim() || !pair.w2.trim() || pair.w1 === pair.w2) throw new Error(`Invalid words in ${pair.id}`);
  const key = [pair.w1, pair.w2].sort().join('\u0000');
  if (!seen.has(key)) throw new Error(`Unindexed pair ${pair.w1} / ${pair.w2}`);
}
if (pairs.length !== 600) throw new Error(`Expected exactly 600 pairs, found ${pairs.length}`);
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'categories.json'), `${JSON.stringify(categories, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(dataDir, 'pairs.json'), `${JSON.stringify(pairs, null, 2)}\n`, 'utf8');
console.log(`Generated ${pairs.length} pairs across ${roots.length} themes and ${categories.length - roots.length} subcategories.`);
