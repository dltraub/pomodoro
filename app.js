(() => {
  const $ = (id) => document.getElementById(id);
  const DEFAULTS = {
    focusMin: 25, breakMin: 5,
    sound: true, notify: false, autoBreak: false, autoFocus: false,
    scene: 'miner', appearance: 'system', font: 'pixel',
  };

  // ---------- persistence ----------
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const settings = { ...DEFAULTS, ...load('pomo.settings', {}) };
  if (!Scenes.list.includes(settings.scene)) settings.scene = DEFAULTS.scene;
  const FONTS = ['pixel', 'rounded', 'clean'];
  if (!FONTS.includes(settings.font)) settings.font = DEFAULTS.font;

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function getStats() {
    const s = load('pomo.stats', null);
    return s && s.date === todayKey() ? s : { date: todayKey(), count: 0, minutes: 0 };
  }
  const setStats = (s) => save('pomo.stats', s);

  // ---------- appearance ----------
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () =>
    settings.appearance === 'system' ? (darkQuery.matches ? 'dark' : 'light') : settings.appearance;
  const THEME_ICONS = {
    light: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  };
  function applyTheme() {
    const t = currentTheme();
    document.documentElement.dataset.theme = t;
    document.documentElement.dataset.scene = settings.scene;
    document.documentElement.dataset.font = settings.font;
    $('themeToggle').innerHTML = THEME_ICONS[t];
    $('themeToggle').title = `Appearance: ${settings.appearance}`;
  }
  darkQuery.addEventListener('change', () => { if (settings.appearance === 'system') applyTheme(); });

  // ---------- timer state ----------
  let mode = 'focus';
  let running = false;
  let endAt = 0;          // timestamp when the running timer finishes
  let remaining = 0;      // ms left while paused
  let tick = null;

  const durationMs = (m) => (m === 'focus' ? settings.focusMin : settings.breakMin) * 60000;
  const fmt = (ms) => {
    const t = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };
  const left = () => (running ? endAt - Date.now() : remaining);
  const progress = () => Math.min(1, Math.max(0, 1 - left() / durationMs(mode)));

  function renderProgress() {
    const pct = progress() * 100;
    $('progressFill').style.width = `${pct.toFixed(2)}%`;
    $('progressKnob').style.left = `${pct.toFixed(2)}%`;
    $('progress').setAttribute('aria-valuenow', Math.round(pct));
  }
  function statsSentence(s) {
    if (s.count === 0) return 'No sessions finished yet today.';
    return `${s.count} session${s.count === 1 ? '' : 's'} finished today, ${s.minutes} minute${s.minutes === 1 ? '' : 's'} of focus.`;
  }
  function render() {
    const t = fmt(left());
    $('time').innerHTML = [...t].map((ch) => `<span class="${ch === ':' ? 'c' : 'd'}">${ch}</span>`).join('');
    $('time').setAttribute('aria-label', t);
    document.title = `${t} ${mode === 'focus' ? 'Focus' : 'Break'}`;
    document.body.dataset.mode = mode;
    document.querySelectorAll('.modes .mode').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
      b.setAttribute('aria-selected', b.dataset.mode === mode);
    });
    $('start').textContent = running ? 'Pause' : 'Start';
    $('start').classList.toggle('running', running);
    renderProgress();
    $('stats').textContent = statsSentence(getStats());
  }

  // Move the timer to a given progress (0..1). Used by dragging the progress bar.
  let dragging = false;
  function seek(p) {
    const rem = durationMs(mode) * (1 - Math.min(1, Math.max(0, p)));
    if (running) endAt = Date.now() + rem; else remaining = rem;
    render();
  }

  function start() {
    if (running) return;
    ensureAudio();
    running = true;
    endAt = Date.now() + remaining;
    tick = setInterval(onTick, 250);
    render();
  }
  function pause() {
    if (!running) return;
    remaining = Math.max(0, endAt - Date.now());
    running = false;
    clearInterval(tick);
    render();
  }
  const toggle = () => (running ? pause() : start());
  function setMode(m, autostart = false) {
    if (running) { running = false; clearInterval(tick); }
    mode = m;
    remaining = durationMs(m);
    render();
    if (autostart) start();
  }
  function onTick() {
    if (endAt - Date.now() <= 0 && !dragging) complete();
    else render();
  }
  function complete() {
    clearInterval(tick);
    running = false;
    const finished = mode;
    if (finished === 'focus') {
      const s = getStats();
      s.count += 1;
      s.minutes += settings.focusMin;
      setStats(s);
    }
    if (settings.sound) chime(finished === 'focus' ? 'focusDone' : 'breakDone');
    if (settings.notify) notify(finished === 'focus' ? 'Focus session done. Time for a break!' : 'Break is over. Back to focus!');
    const next = finished === 'focus' ? 'break' : 'focus';
    setMode(next, next === 'break' ? settings.autoBreak : settings.autoFocus);
  }

  // ---------- pixel scene loop ----------
  const canvas = $('scene');
  const ctx = canvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let rafId = null;
  function drawScene(now) {
    Scenes.render(ctx, {
      scene: settings.scene,
      mode,
      running,
      progress: progress(),
      theme: currentTheme(),
      time: reduceMotion.matches ? 0 : now / 1000,
    });
    if (running) renderProgress();
    rafId = requestAnimationFrame(drawScene);
  }
  const startLoop = () => { if (rafId == null) rafId = requestAnimationFrame(drawScene); };
  const stopLoop = () => { if (rafId != null) cancelAnimationFrame(rafId); rafId = null; };

  // ---------- sound (Web Audio, no files) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  // Focus done → slow, soft, falling notes ("wind down").
  // Break done → quick, bright, rising notes played twice ("back to it").
  const SOUNDS = {
    focusDone: { type: 'triangle', notes: [783.99, 659.25, 523.25, 392.0], gap: 0.36, len: 1.3, vol: 0.28 },
    breakDone: { type: 'sine', notes: [523.25, 783.99, 1046.5, 0, 523.25, 783.99, 1046.5], gap: 0.12, len: 0.35, vol: 0.32 },
  };
  function chime(kind) {
    ensureAudio();
    if (!audioCtx) return;
    const snd = SOUNDS[kind];
    const now = audioCtx.currentTime + 0.02;
    snd.notes.forEach((freq, i) => {
      if (!freq) return; // rest
      const at = now + i * snd.gap;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = snd.type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(snd.vol, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + snd.len);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(at);
      osc.stop(at + snd.len + 0.05);
    });
  }

  // ---------- notifications ----------
  function notify(body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification('Pomodoro', { body }); } catch {}
  }
  function updateNotifHint() {
    let hint = '';
    if (!('Notification' in window)) hint = 'not supported in this browser';
    else if (settings.notify && Notification.permission === 'denied') hint = 'blocked by the browser, allow it in site settings';
    else if (settings.notify && Notification.permission === 'default') hint = 'waiting for permission';
    $('notifHint').textContent = hint;
  }

  // ---------- settings UI ----------
  const TOGGLES = ['sound', 'notify', 'autoBreak', 'autoFocus'];
  function fillSettings() {
    $('focusMin').value = settings.focusMin;
    $('breakMin').value = settings.breakMin;
    TOGGLES.forEach((k) => ($(k).checked = settings[k]));
    document.querySelectorAll('#sceneSeg .seg').forEach((b) => b.classList.toggle('active', b.dataset.value === settings.scene));
    document.querySelectorAll('#appearanceSeg .seg').forEach((b) => b.classList.toggle('active', b.dataset.value === settings.appearance));
    document.querySelectorAll('#fontSeg .seg').forEach((b) => b.classList.toggle('active', b.dataset.value === settings.font));
    updateNotifHint();
  }
  function clampInt(v, min, max, fallback) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min ? Math.min(n, max) : fallback;
  }
  function applySettings() {
    // Timer untouched (full length, not running)? Then apply the new length immediately.
    const wasFresh = !running && remaining === durationMs(mode);
    settings.focusMin = clampInt($('focusMin').value, 1, 180, settings.focusMin);
    settings.breakMin = clampInt($('breakMin').value, 1, 60, settings.breakMin);
    TOGGLES.forEach((k) => (settings[k] = $(k).checked));
    save('pomo.settings', settings);
    if (wasFresh) remaining = durationMs(mode);
    applyTheme();
    fillSettings();
    render();
  }

  $('notify').addEventListener('change', async () => {
    if ($('notify').checked && 'Notification' in window && Notification.permission === 'default') {
      applySettings();
      try { await Notification.requestPermission(); } catch {}
    }
    applySettings();
  });
  ['sound', 'autoBreak', 'autoFocus', 'focusMin', 'breakMin'].forEach((k) => $(k).addEventListener('change', applySettings));
  document.querySelectorAll('#sceneSeg .seg').forEach((b) => (b.onclick = () => { settings.scene = b.dataset.value; applySettings(); }));
  document.querySelectorAll('#appearanceSeg .seg').forEach((b) => (b.onclick = () => { settings.appearance = b.dataset.value; applySettings(); }));
  document.querySelectorAll('#fontSeg .seg').forEach((b) => (b.onclick = () => { settings.font = b.dataset.value; applySettings(); }));
  $('themeToggle').onclick = () => {
    settings.appearance = currentTheme() === 'dark' ? 'light' : 'dark';
    applySettings();
  };

  const isOpen = () => $('settings').classList.contains('open');
  const openSettings = () => { fillSettings(); $('settings').classList.add('open'); };
  const closeSettings = () => { applySettings(); $('settings').classList.remove('open'); };
  $('openSettings').onclick = openSettings;
  $('closeSettings').onclick = closeSettings;
  $('closeX').onclick = closeSettings;
  $('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });

  $('hearFocus').onclick = () => chime('focusDone');
  $('hearBreak').onclick = () => chime('breakDone');

  // ---------- draggable progress bar ----------
  const bar = $('progress');
  const seekToPointer = (e) => {
    const r = bar.getBoundingClientRect();
    seek((e.clientX - r.left) / r.width);
  };
  bar.addEventListener('pointerdown', (e) => {
    dragging = true;
    bar.classList.add('dragging');
    bar.setPointerCapture(e.pointerId);
    seekToPointer(e);
  });
  bar.addEventListener('pointermove', (e) => { if (dragging) seekToPointer(e); });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove('dragging');
    if (running) onTick();
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
  bar.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[e.key];
    if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    seek(e.key === 'Home' ? 0 : e.key === 'End' ? 1 : progress() + step);
  });

  // ---------- controls ----------
  $('start').onclick = toggle;
  $('skip').onclick = () => setMode(mode === 'focus' ? 'break' : 'focus'); // skipped focus doesn't count
  $('reset').onclick = () => setMode(mode);
  document.querySelectorAll('.modes .mode').forEach((b) => (b.onclick = () => {
    if (b.dataset.mode === mode) return;
    if (running && !confirm('The timer is running. Switch anyway?')) return;
    setMode(b.dataset.mode);
  }));
  $('resetStats').onclick = () => {
    if (confirm("Reset today's pomodoro count and focused minutes?")) { setStats({ date: todayKey(), count: 0, minutes: 0 }); render(); }
  };
  document.addEventListener('keydown', (e) => {
    if (isOpen()) { if (e.key === 'Escape') closeSettings(); return; }
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); toggle(); }
  });

  // Pause drawing while hidden; re-sync when visible again (also picks up a new day's stats).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopLoop(); return; }
    running ? onTick() : render();
    startLoop();
  });

  applyTheme();
  setMode('focus');
  startLoop();
})();
