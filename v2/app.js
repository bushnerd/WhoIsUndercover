const state = {
  playerCount: 5,
  undercoverCount: 1,
  blankCount: 0,
  categories: [],
  pairs: [],
  selected: new Set(),
  players: [],
  currentPairId: null,
  currentPlayer: 0,
  selectedPlayer: null,
  round: 1,
  stream: null,
  cameraRequestId: 0,
  photoData: null,
  peekTimer: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const screens = ['setup-screen', 'reveal-screen', 'play-screen', 'result-screen'];

async function loadData() {
  try {
    const [categories, pairs] = await Promise.all([
      fetch('./data/categories.json').then((response) => response.json()),
      fetch('./data/pairs.json').then((response) => response.json()),
    ]);
    state.categories = categories;
    state.pairs = pairs;
    state.selected = new Set(categories.filter((category) => category.parentId != null).map((category) => category.id));
    renderCategories();
    updateCounts();
  } catch (error) {
    $('#category-tree').innerHTML = '<p class="loading">词库暂时无法打开，请联网刷新一次。</p>';
    console.error('Could not load the word bank:', error);
  }
}

function rootsAndLeaves() {
  return state.categories.filter((category) => category.parentId == null).map((root) => ({
    ...root,
    children: state.categories.filter((category) => category.parentId === root.id),
  }));
}

function countPairs(leafIds) {
  const selected = new Set(leafIds);
  return state.pairs.filter((pair) => selected.has(pair.categoryId)).length;
}

function renderCategories() {
  const query = $('#category-search').value.trim().toLocaleLowerCase();
  const html = rootsAndLeaves().map((root) => {
    const matchesRoot = root.name.toLocaleLowerCase().includes(query);
    const leaves = root.children.filter((leaf) => !query || matchesRoot || leaf.name.toLocaleLowerCase().includes(query));
    if (query && leaves.length === 0) return '';
    const ids = root.children.map((leaf) => leaf.id);
    const checked = ids.length > 0 && ids.every((id) => state.selected.has(id));
    const open = Boolean(query) || root.open;
    const pairTotal = countPairs(ids);
    return `<section class="tree-root">
      <div class="root-row"><input class="root-check" type="checkbox" data-root="${root.id}" ${checked ? 'checked' : ''} aria-label="选择${root.name}">
        <button class="root-toggle" type="button" data-toggle="${root.id}" aria-label="${open ? '收起' : '展开'}${root.name}">${open ? '▼' : '▶'}</button>
        <span>${root.name}</span><span class="root-count">${pairTotal} 组</span></div>
      ${open ? `<div class="leaf-list">${leaves.map((leaf) => `<label class="leaf-row"><input class="leaf-check" type="checkbox" data-leaf="${leaf.id}" ${state.selected.has(leaf.id) ? 'checked' : ''}><span>${leaf.name}</span><span class="root-count">${countPairs([leaf.id])}</span></label>`).join('')}</div>` : ''}
    </section>`;
  }).join('');
  $('#category-tree').innerHTML = html || '<p class="loading">没有找到这个主题，再试试别的关键词。</p>';
  $$('[data-root]').forEach((checkbox) => {
    const root = state.categories.find((category) => category.id === checkbox.dataset.root);
    const leaves = state.categories.filter((category) => category.parentId === root.id);
    const selectedCount = leaves.filter((leaf) => state.selected.has(leaf.id)).length;
    checkbox.indeterminate = selectedCount > 0 && selectedCount < leaves.length;
  });
}

function updateCounts() {
  const count = countPairs([...state.selected]);
  const selectedThemes = rootsAndLeaves().filter((root) => root.children.some((leaf) => state.selected.has(leaf.id))).length;
  $('#pair-count').textContent = `已选 ${count} 组 · ${selectedThemes} 个主题`;
  $('#start-button').disabled = count === 0;
  $('#player-count').textContent = state.playerCount;
  $('#civilian-count').textContent = state.playerCount - state.undercoverCount - state.blankCount;
  $('#undercover-count').textContent = state.undercoverCount;
  $('#blank-count').textContent = state.blankCount;
  $$('[data-adjust="players"]').forEach((button) => {
    button.disabled = button.dataset.delta === '-1' ? state.playerCount <= 3 : state.playerCount >= 12;
  });
  $$('[data-adjust="undercover"]').forEach((button) => {
    button.disabled = button.dataset.delta === '-1' ? state.undercoverCount <= 1 : state.undercoverCount >= Math.min(3, state.playerCount - state.blankCount - 1);
  });
}

function setScreen(id, step) {
  screens.forEach((screen) => $(`#${screen}`).classList.toggle('active', screen === id));
  $$('#stepper span').forEach((item, index) => item.classList.toggle('active', index === step));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  window.setTimeout(() => element.classList.remove('show'), 2100);
}

function startGame({ avoidCurrentPair = false } = {}) {
  const selectedPairs = state.pairs.filter((pair) => state.selected.has(pair.categoryId));
  if (selectedPairs.length === 0) return false;
  if (avoidCurrentPair && selectedPairs.length === 1 && selectedPairs[0].id === state.currentPairId) return false;
  const availablePairs = avoidCurrentPair && selectedPairs.length > 1
    ? selectedPairs.filter((pair) => pair.id !== state.currentPairId)
    : selectedPairs;
  const pair = availablePairs[Math.floor(Math.random() * availablePairs.length)];
  state.currentPairId = pair.id;
  const roles = [
    ...Array(state.undercoverCount).fill({ type: 'undercover', word: pair.w2 }),
    ...Array(state.blankCount).fill({ type: 'blank', word: '' }),
    ...Array(state.playerCount - state.undercoverCount - state.blankCount).fill({ type: 'civilian', word: pair.w1 }),
  ];
  for (let index = roles.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [roles[index], roles[randomIndex]] = [roles[randomIndex], roles[index]];
  }
  state.players = roles.map((role, index) => ({ number: index + 1, ...role, avatar: null, eliminated: false }));
  state.currentPlayer = 0;
  state.selectedPlayer = null;
  state.round = 1;
  renderReveal();
  setScreen('reveal-screen', 1);
  return true;
}

function roleName(player) {
  if (player.type === 'undercover') return '卧底';
  if (player.type === 'blank') return '白板';
  return '平民';
}

function renderReveal() {
  const player = state.players[state.currentPlayer];
  $('#reveal-heading').textContent = `请 ${player.number} 号玩家查看`;
  $('#secret-word').textContent = '轻触查看词语';
  $('#secret-role').textContent = '这是你的秘密任务';
  $('#secret-card').classList.remove('revealed');
  $('#camera-button').disabled = true;
  $('#seen-button').disabled = true;
  $('#reveal-progress').innerHTML = state.players.map((item, index) => `<i class="${index < state.currentPlayer ? 'done' : ''}"></i>`).join('');
}

function revealCurrentWord() {
  const player = state.players[state.currentPlayer];
  $('#secret-word').textContent = player.word || '白板：没有词语';
  $('#secret-role').textContent = `${player.number} 号 · 记好后传给下一位`;
  $('#secret-card').classList.add('revealed');
  $('#camera-button').disabled = false;
  $('#seen-button').disabled = false;
}

function confirmSeen() {
  if (state.currentPlayer + 1 < state.players.length) {
    state.currentPlayer += 1;
    renderReveal();
  } else {
    renderPlayers();
    setScreen('play-screen', 2);
  }
}

function avatarMarkup(player) {
  return player.avatar
    ? `<img class="avatar" src="${player.avatar}" alt="${player.number}号玩家头像">`
    : `<span class="avatar avatar-emoji">${['🦊', '🐼', '🐸', '🐯', '🐻', '🐧'][((player.number - 1) % 6)]}</span>`;
}

function renderPlayers() {
  $('#round-number').textContent = state.round;
  $('#players-grid').innerHTML = state.players.map((player) => `<button class="player-card ${player.eliminated ? 'eliminated' : ''} ${state.selectedPlayer === player.number ? 'selected' : ''}" data-player="${player.number}" ${player.eliminated ? 'disabled' : ''}>
    ${avatarMarkup(player)}<b>${player.number} 号玩家</b><small>${player.eliminated ? '已淘汰' : '仍在场上'}</small></button>`).join('');
  const selected = state.players.find((player) => player.number === state.selectedPlayer);
  $('#selection-label').textContent = selected ? `已选中 ${selected.number} 号玩家` : '先点选一位玩家';
  $('#forget-button').disabled = !selected;
  $('#eliminate-button').disabled = !selected;
}

function aliveByRole(type) {
  return state.players.filter((player) => !player.eliminated && player.type === type).length;
}

function currentWinner() {
  const undercover = aliveByRole('undercover');
  const blank = aliveByRole('blank');
  const civilian = aliveByRole('civilian');
  if (undercover === 0 && blank === 0) return 'civilian';
  if (civilian === 0) return 'undercover';
  if (undercover === 0 && blank > 0 && civilian <= blank) return 'blank';
  return null;
}

function peekSelectedWord() {
  const player = state.players.find((item) => item.number === state.selectedPlayer);
  if (!player) return;
  $('#peek-word').textContent = player.word || '🃏 白板，没有词语';
  $('#peek-player').textContent = `${player.number} 号玩家`;
  $('#peek-dialog').showModal();
  window.clearTimeout(state.peekTimer);
  state.peekTimer = window.setTimeout(() => {
    if ($('#peek-dialog').open) $('#peek-dialog').close();
  }, 3000);
}

function eliminateSelected() {
  const player = state.players.find((item) => item.number === state.selectedPlayer);
  if (!player) return;
  player.eliminated = true;
  state.selectedPlayer = null;
  const winner = currentWinner();
  if (winner) showResult(winner);
  else {
    state.round += 1;
    renderPlayers();
    toast(`${player.number} 号已淘汰，继续讨论吧`);
  }
}

function manualEnd() {
  const undercover = aliveByRole('undercover');
  const blank = aliveByRole('blank');
  const civilian = aliveByRole('civilian');
  let winner = null;
  if (undercover === 0) winner = 'civilian';
  else if (civilian === 0) winner = 'undercover';
  else if (blank > 0 && undercover === 0) winner = 'blank';
  if (!winner) {
    toast('当前还没有达到胜利条件，请继续游戏');
    return;
  }
  showResult(winner);
}

function showResult(winner) {
  const titles = { civilian: ['🎉', '平民获胜！', '成功找出所有卧底与白板。'], undercover: ['🕵️', '卧底获胜！', '场上已经没有平民了。'], blank: ['🃏', '白板获胜！', '白板成为场上最后的谜团。'] };
  const [emoji, title, message] = titles[winner];
  $('#result-emoji').textContent = emoji;
  $('#result-title').textContent = title;
  $('#result-message').textContent = message;
  $('#result-players').innerHTML = state.players.map((player) => `<div class="result-player"><span>${player.type === 'undercover' ? '🕵️' : player.type === 'blank' ? '🃏' : '🙂'}</span>${player.number} 号玩家<small>${roleName(player)}${player.eliminated ? ' · 已淘汰' : ''}</small><small>词语：${player.word || '无'}</small></div>`).join('');
  const civilianWord = state.players.find((player) => player.type === 'civilian')?.word || '';
  const undercoverWord = state.players.find((player) => player.type === 'undercover')?.word || '';
  $('#word-reveal').textContent = `平民词：${civilianWord}　·　卧底词：${undercoverWord}`;
  setScreen('result-screen', 3);
}

async function openCamera() {
  const player = state.players[state.currentPlayer];
  const requestId = ++state.cameraRequestId;
  state.stream = null;
  state.photoData = null;
  $('#camera-preview').hidden = true;
  $('#camera-video').hidden = false;
  $('#capture-button').disabled = false;
  $('#save-photo-button').disabled = true;
  $('#camera-message').textContent = '允许相机权限即可拍照，也可以直接关闭跳过。';
  $('#camera-dialog').showModal();
  if (!navigator.mediaDevices?.getUserMedia) {
    $('#camera-message').textContent = '当前浏览器不能使用相机，你可以直接跳过继续游戏。';
    $('#capture-button').disabled = true;
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    if (requestId !== state.cameraRequestId || !$('#camera-dialog').open) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    state.stream = stream;
    $('#camera-video').srcObject = state.stream;
    player.cameraReady = true;
  } catch (error) {
    if (requestId !== state.cameraRequestId || !$('#camera-dialog').open) return;
    $('#camera-message').textContent = '没有获得相机权限也没关系，关闭窗口后可以继续传手机。';
    $('#capture-button').disabled = true;
  }
}

function stopCamera() {
  state.cameraRequestId += 1;
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  $('#camera-video').srcObject = null;
}

function capturePhoto() {
  const video = $('#camera-video');
  const canvas = $('#camera-canvas');
  if (!video.videoWidth) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  state.photoData = canvas.toDataURL('image/jpeg', 0.78);
  $('#camera-preview').src = state.photoData;
  $('#camera-preview').hidden = false;
  video.hidden = true;
  $('#save-photo-button').disabled = false;
  $('#capture-button').textContent = '重拍';
}

function savePhoto() {
  state.players[state.currentPlayer].avatar = state.photoData;
  closeDialog($('#camera-dialog'));
  toast(`${state.players[state.currentPlayer].number} 号头像已保存`);
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
  if (dialog.id === 'camera-dialog') stopCamera();
}

function clearPeek() {
  window.clearTimeout(state.peekTimer);
  state.peekTimer = null;
  state.selectedPlayer = null;
  if ($('#play-screen').classList.contains('active')) renderPlayers();
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const adjust = event.target.closest('[data-adjust]');
    if (adjust) {
      const delta = Number(adjust.dataset.delta);
      if (adjust.dataset.adjust === 'players') {
        const next = state.playerCount + delta;
        if (next >= 3 && next <= 12 && next > state.undercoverCount + state.blankCount) state.playerCount = next;
      } else {
        const next = state.undercoverCount + delta;
        if (next >= 1 && next <= 3 && next + state.blankCount < state.playerCount) state.undercoverCount = next;
      }
      updateCounts();
      return;
    }
    const rootCheck = event.target.closest('[data-root]');
    if (rootCheck) {
      const root = state.categories.find((category) => category.id === rootCheck.dataset.root);
      state.categories.filter((category) => category.parentId === root.id).forEach((leaf) => rootCheck.checked ? state.selected.add(leaf.id) : state.selected.delete(leaf.id));
      renderCategories(); updateCounts(); return;
    }
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const root = state.categories.find((category) => category.id === toggle.dataset.toggle);
      root.open = !root.open; renderCategories(); return;
    }
    const leaf = event.target.closest('[data-leaf]');
    if (leaf) {
      leaf.checked ? state.selected.add(leaf.dataset.leaf) : state.selected.delete(leaf.dataset.leaf);
      renderCategories(); updateCounts(); return;
    }
    const playerCard = event.target.closest('[data-player]');
    if (playerCard) {
      state.selectedPlayer = state.selectedPlayer === Number(playerCard.dataset.player) ? null : Number(playerCard.dataset.player);
      renderPlayers();
    }
  });

  $('#category-search').addEventListener('input', renderCategories);
  $('#category-toggle').addEventListener('click', (event) => {
    const controls = $('#category-controls');
    const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
    event.currentTarget.setAttribute('aria-expanded', String(!expanded));
    event.currentTarget.innerHTML = expanded ? '展开 <span>⌄</span>' : '收起 <span>⌃</span>';
    controls.hidden = expanded;
  });
  $('#clear-search').addEventListener('click', () => { $('#category-search').value = ''; renderCategories(); });
  $('#select-all').addEventListener('click', () => { state.categories.filter((category) => category.parentId).forEach((leaf) => state.selected.add(leaf.id)); renderCategories(); updateCounts(); });
  $('#clear-all').addEventListener('click', () => { state.selected.clear(); renderCategories(); updateCounts(); });
  $('#blank-toggle').addEventListener('change', (event) => {
    const next = event.target.checked ? 1 : 0;
    if (state.undercoverCount + next >= state.playerCount) { event.target.checked = false; toast('至少要留一位平民'); return; }
    state.blankCount = next; updateCounts();
  });
  $('#start-button').addEventListener('click', startGame);
  $$('[data-restart]').forEach((button) => button.addEventListener('click', () => {
    const selectedPairs = state.pairs.filter((pair) => state.selected.has(pair.categoryId));
    if (selectedPairs.length === 0) {
      toast('词库为空，请回到设置页选择主题词库');
      return;
    }
    if (selectedPairs.length === 1 && selectedPairs[0].id === state.currentPairId) {
      toast('当前只选了一组词，请展开词库多选主题后再换词');
      return;
    }
    if ($('#camera-dialog').open) closeDialog($('#camera-dialog'));
    if ($('#peek-dialog').open) closeDialog($('#peek-dialog'));
    state.selectedPlayer = null;
    state.photoData = null;
    if (!startGame({ avoidCurrentPair: true })) return;
    toast('当前游戏已结束，已更换词语');
  }));
  $('#secret-card').addEventListener('click', revealCurrentWord);
  $('#seen-button').addEventListener('click', confirmSeen);
  $('#camera-button').addEventListener('click', openCamera);
  $('#forget-button').addEventListener('click', peekSelectedWord);
  $('#eliminate-button').addEventListener('click', eliminateSelected);
  $('#finish-button').addEventListener('click', manualEnd);
  $('#new-game-button').addEventListener('click', () => setScreen('setup-screen', 0));
  $('#capture-button').addEventListener('click', capturePhoto);
  $('#save-photo-button').addEventListener('click', savePhoto);
  $$('[data-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  $$('.peek-dialog,.camera-dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); }));
  $('#camera-dialog').addEventListener('close', stopCamera);
  $('#peek-dialog').addEventListener('close', clearPeek);
}

bindEvents();
loadData();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Offline cache unavailable:', error)));
}
