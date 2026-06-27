// =============================================================
// main.js · Orquestador: conecta Game, Auth, Scores y UI
// =============================================================

(async () => {
  // ----------------------------------------------------------
  // 1. Inicializar Supabase
  // ----------------------------------------------------------
  const supabase = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY
  );

  Auth.init(supabase);
  Scores.init(supabase);

  // ----------------------------------------------------------
  // 2. Estado local de sesión y best score
  // ----------------------------------------------------------
  let localBest = 0;
  let localTopScores = [];
  let currentUsername = null;

  async function refreshUserData(user) {
    if (!user) { currentUsername = null; return; }
    const { data: pb } = await Scores.getPersonalBest(user.id);
    if (pb) {
      localBest = pb.best_score;
      UI.updateBest(localBest);
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();
    currentUsername = profile?.username ?? null;
  }

  // ----------------------------------------------------------
  // 3. Reaccionar a cambios de sesión
  // ----------------------------------------------------------
  Auth.onUserChange(async (user) => {
    await refreshUserData(user);
    UI.renderUserHeader(
      user, currentUsername,
      () => UI.showAuthModal(async () => {
        await refreshUserData(Auth.currentUser());
        UI.renderUserHeader(Auth.currentUser(), currentUsername,
          () => UI.showAuthModal(() => {}),
          async () => { await Auth.logout(); UI.renderUserHeader(null, null, () => UI.showAuthModal(() => {}), () => {}); }
        );
      }),
      async () => {
        await Auth.logout();
        localBest = 0;
        UI.updateBest(0);
        renderHeader();
      }
    );
  });

  function renderHeader() {
    UI.renderUserHeader(
      Auth.currentUser(), currentUsername,
      () => UI.showAuthModal(async () => {
        await refreshUserData(Auth.currentUser());
        renderHeader();
      }),
      async () => {
        await Auth.logout();
        localBest = 0;
        UI.updateBest(0);
        renderHeader();
      }
    );
  }

  // Sesión inicial
  await Auth.getSession();
  await refreshUserData(Auth.currentUser());
  renderHeader();

  // ----------------------------------------------------------
  // 4. Inicializar juego y HUD
  // ----------------------------------------------------------
  const canvas = document.getElementById('gameCanvas');
  Game.init(canvas);
  UI.updateBest(localBest);

  // Tick de HUD cada frame mientras se juega
  let hudInterval = null;
  function startHUDTick() {
    hudInterval = setInterval(() => {
      const { score, elapsedMs } = Game.getState();
      UI.updateHUD(score, elapsedMs);
    }, 33);
  }
  function stopHUDTick() {
    if (hudInterval) { clearInterval(hudInterval); hudInterval = null; }
  }

  // ----------------------------------------------------------
  // 5. Callbacks del juego
  // ----------------------------------------------------------
  Game.onPhase((phase) => {
    UI.showPhaseToast(phase);
    NeonMusic.setPhase(phase);
  });

  Game.onDeath(async ({ score, timeMs }) => {
    stopHUDTick();
    NeonMusic.stop();
    UI.updateHUD(score, timeMs);

    let isNewRecord = false;
    const user = Auth.currentUser();

    if (user) {
      const result = await Scores.saveRun(user.id, score, timeMs);
      isNewRecord = result.isNewRecord ?? false;
      if (score > localBest) { localBest = score; UI.updateBest(localBest); }
    } else {
      localTopScores.push({ score, timeMs });
      localTopScores.sort((a, b) => b.score - a.score);
      localTopScores = localTopScores.slice(0, CONFIG.TOP_SCORES_LIMIT);
      if (score > localBest) { localBest = score; UI.updateBest(localBest); }
    }

    setTimeout(() => {
      UI.showDeath(score, timeMs, isNewRecord, startGame);
    }, 150);
  });

  // ----------------------------------------------------------
  // 6. Leaderboard global
  // ----------------------------------------------------------
  document.getElementById('lb-btn').addEventListener('click', async () => {
    const { data } = await Scores.getLeaderboard();
    UI.showLeaderboard(data, Auth.currentUser()?.id);
  });
  document.getElementById('lb-close').addEventListener('click', UI.hideLeaderboard);

  // ----------------------------------------------------------
  // 7. Flujo de inicio de partida
  // ----------------------------------------------------------
  function startGame() {
    UI.hideOverlay();
    startHUDTick();
    Game.start();
    NeonMusic.start();
  }

  const playBtn = UI.showStart();
  playBtn.addEventListener('click', startGame);

  // ----------------------------------------------------------
  // 8. Controles de música
  // ----------------------------------------------------------
  const musicToggle = document.getElementById('music-toggle');
  const musicVolume = document.getElementById('music-volume');
  const iconOn      = document.getElementById('music-icon-on');
  const iconOff     = document.getElementById('music-icon-off');
  let musicMuted    = false;

  musicToggle.addEventListener('click', () => {
    musicMuted = !musicMuted;
    iconOn.style.display  = musicMuted ? 'none'  : '';
    iconOff.style.display = musicMuted ? ''      : 'none';
    musicToggle.classList.toggle('muted', musicMuted);
    musicMuted ? NeonMusic.mute() : NeonMusic.unmute();
  });

  musicVolume.addEventListener('input', () => {
    const val = musicVolume.value / 100;
    NeonMusic.setVolume(val);
    // Si estaba muteado y mueven el slider, desmuteamos
    if (musicMuted) {
      musicMuted = false;
      iconOn.style.display  = '';
      iconOff.style.display = 'none';
      musicToggle.classList.remove('muted');
    }
  });

})();
