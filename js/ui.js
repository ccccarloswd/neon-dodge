// =============================================================
// ui.js · Gestión del DOM, pantallas y modales
// =============================================================

const UI = (() => {
  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  function fmt(n) { return String(Math.floor(n)).padStart(6, '0'); }
  function fmtTime(ms) { return (ms / 1000).toFixed(1) + 's'; }
  function $(id) { return document.getElementById(id); }

  // ----------------------------------------------------------
  // HUD (score, tiempo)
  // ----------------------------------------------------------
  function updateHUD(score, elapsedMs) {
    $('hud-score').textContent = fmt(score);
    $('hud-time').textContent = fmtTime(elapsedMs);
  }

  function updateBest(score) {
    $('hud-best').textContent = fmt(score);
  }

  // ----------------------------------------------------------
  // Toast de fase
  // ----------------------------------------------------------
  let toastTimeout = null;
  const phaseMessages = ['', 'Heating up...', 'Danger zone!', 'MAX HELL'];
  const phaseColors = ['', '#ffaa00', '#ff6644', '#ff2244'];

  function showPhaseToast(phase) {
    if (!phaseMessages[phase]) return;
    const el = $('phase-toast');
    el.textContent = phaseMessages[phase];
    el.style.color = phaseColors[phase];
    el.style.textShadow = `0 0 12px ${phaseColors[phase]}99`;
    el.style.opacity = '1';
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  // ----------------------------------------------------------
  // Overlay principal
  // ----------------------------------------------------------
  function showStart() {
    const ov = $('overlay');
    ov.innerHTML = `
      <div class="ov-title">Neon Dodge</div>
      <div class="ov-sub">Move mouse · touch screen</div>
      <div class="ov-sub dim">Dodge everything · survive longer</div>
      <button class="ov-btn" id="play-btn">Play</button>
    `;
    ov.style.display = 'flex';
    return $('play-btn');
  }

  function showDeath(score, timeMs, isNewRecord, onRetry) {
    const ov = $('overlay');
    ov.innerHTML = `
      ${isNewRecord ? '<div class="ov-record">NEW RECORD</div>' : ''}
      <div class="ov-title small">Game Over</div>
      <div class="ov-score">${fmt(score)}</div>
      <div class="ov-sub">${fmtTime(timeMs)}</div>
      <button class="ov-btn" id="retry-btn">Retry</button>
    `;
    ov.style.display = 'flex';
    $('retry-btn').addEventListener('click', onRetry);
  }

  function hideOverlay() {
    $('overlay').style.display = 'none';
  }

  // ----------------------------------------------------------
  // Modal de autenticación (login / registro)
  // ----------------------------------------------------------
  function showAuthModal(onSuccess) {
    const modal = $('auth-modal');
    modal.classList.add('open');
    renderAuthLogin(onSuccess);
  }

  function hideAuthModal() {
    $('auth-modal').classList.remove('open');
    $('auth-modal').innerHTML = '';
  }

  function renderAuthLogin(onSuccess) {
    const modal = $('auth-modal');
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">Sign in</div>
        <div id="auth-error" class="auth-error"></div>
        <input type="email" id="auth-email" placeholder="Email" autocomplete="email"/>
        <input type="password" id="auth-pass" placeholder="Password" autocomplete="current-password"/>
        <button class="ov-btn full" id="auth-submit">Sign in</button>
        <div class="auth-switch">No account? <span class="auth-link" id="go-register">Register</span></div>
        <div class="auth-switch dim"><span class="auth-link" id="go-guest">Continue as guest</span></div>
      </div>
    `;
    $('auth-submit').addEventListener('click', async () => {
      const email = $('auth-email').value.trim();
      const pass = $('auth-pass').value;
      if (!email || !pass) return setAuthError('Fill in all fields.');
      setAuthLoading(true);
      const { error } = await Auth.login(email, pass);
      setAuthLoading(false);
      if (error) return setAuthError(error.message);
      hideAuthModal();
      onSuccess();
    });
    $('go-register').addEventListener('click', () => renderAuthRegister(onSuccess));
    $('go-guest').addEventListener('click', () => { hideAuthModal(); onSuccess(); });
  }

  function renderAuthRegister(onSuccess) {
    const modal = $('auth-modal');
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">Create account</div>
        <div id="auth-error" class="auth-error"></div>
        <input type="text" id="auth-username" placeholder="Username" maxlength="20" autocomplete="username"/>
        <input type="email" id="auth-email" placeholder="Email" autocomplete="email"/>
        <input type="password" id="auth-pass" placeholder="Password (min 6 chars)" autocomplete="new-password"/>
        <button class="ov-btn full" id="auth-submit">Create account</button>
        <div class="auth-switch">Already registered? <span class="auth-link" id="go-login">Sign in</span></div>
      </div>
    `;
    $('auth-submit').addEventListener('click', async () => {
      const username = $('auth-username').value.trim();
      const email = $('auth-email').value.trim();
      const pass = $('auth-pass').value;
      if (!username || !email || !pass) return setAuthError('Fill in all fields.');
      if (pass.length < 6) return setAuthError('Password must be at least 6 characters.');
      setAuthLoading(true);
      const { error } = await Auth.register(email, pass, username);
      setAuthLoading(false);
      if (error) return setAuthError(error.message);
      hideAuthModal();
      onSuccess();
    });
    $('go-login').addEventListener('click', () => renderAuthLogin(onSuccess));
  }

  function setAuthError(msg) {
    const el = $('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function setAuthLoading(loading) {
    const btn = $('auth-submit');
    if (btn) { btn.textContent = loading ? '...' : btn.textContent; btn.disabled = loading; }
  }

  // ----------------------------------------------------------
  // Modal de leaderboard
  // ----------------------------------------------------------
  function showLeaderboard(data, currentUserId, userEntry) {
    const modal = $('lb-modal');
    const listEl = modal.querySelector('#lb-list');

    if (!data || data.length === 0) {
      listEl.innerHTML = '<div class="lb-empty">No scores yet. Be the first!</div>';
      modal.classList.add('open');
      return;
    }

    const top10 = data.map((row, i) => lbRowHTML(i + 1, row, row.user_id === currentUserId)).join('');

    // ¿Está el usuario dentro del top 10 ya mostrado?
    const userInTop = data.some(row => row.user_id === currentUserId);

    let youRowHTML = '';
    if (currentUserId && userEntry && !userInTop) {
      youRowHTML = `
        <div class="lb-divider"></div>
        ${lbRowHTML(userEntry.rank, userEntry, true)}
      `;
    }

    listEl.innerHTML = top10 + youRowHTML;
    modal.classList.add('open');
  }

  function lbRowHTML(rank, row, isYou) {
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    return `
      <div class="lb-row ${isYou ? 'lb-you' : ''}">
        <span class="lb-rank">${medals[rank] ?? `#${rank}`}</span>
        <span class="lb-name">${row.profiles?.username ?? '???'}</span>
        <span class="lb-score">${fmt(row.best_score)}</span>
        <span class="lb-time">${fmtTime(row.best_time_ms)}</span>
      </div>`;
  }

  function hideLeaderboard() {
    $('lb-modal').classList.remove('open');
  }

  // ----------------------------------------------------------
  // Header de usuario (login/logout en navbar)
  // ----------------------------------------------------------
  function renderUserHeader(user, username, onLoginClick, onLogoutClick) {
    const el = $('user-area');
    if (user) {
      el.innerHTML = `
        <span class="user-name">${username ?? 'Player'}</span>
        <button class="user-btn" id="logout-btn">Log out</button>
      `;
      $('logout-btn').addEventListener('click', onLogoutClick);
    } else {
      el.innerHTML = `<button class="user-btn" id="login-header-btn">Sign in</button>`;
      $('login-header-btn').addEventListener('click', onLoginClick);
    }
  }

  return {
    updateHUD, updateBest,
    showPhaseToast,
    showStart, showDeath, hideOverlay,
    showAuthModal, hideAuthModal,
    showLeaderboard, hideLeaderboard,
    renderUserHeader,
    fmt, fmtTime,
  };
})();
