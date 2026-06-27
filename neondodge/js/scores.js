// =============================================================
// scores.js · Guardado de partidas y leaderboard global
// =============================================================

const Scores = (() => {
  let _client = null;

  function init(client) {
    _client = client;
  }

  // Guarda una partida y actualiza personal best si corresponde
  async function saveRun(userId, score, timeMs) {
    if (!userId) return { error: { message: 'No hay sesión activa.' } };

    score = Math.round(score);
    timeMs = Math.round(timeMs);

    // Insertar en historial
    const { error: insertError } = await _client.from('scores').insert({
      user_id: userId,
      score,
      time_ms: timeMs,
    });
    if (insertError) return { error: insertError };

    // Leer personal best actual
    const { data: pb } = await _client
      .from('personal_bests')
      .select('best_score, best_time_ms, total_games')
      .eq('user_id', userId)
      .maybeSingle();

    const isNewRecord = !pb || score > pb.best_score;

    // Actualizar personal best
    const { error: pbError } = await _client.from('personal_bests').upsert({
      user_id: userId,
      best_score: isNewRecord ? score : pb.best_score,
      best_time_ms: isNewRecord ? timeMs : pb.best_time_ms,
      total_games: (pb?.total_games ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (pbError) return { error: pbError };
    return { isNewRecord };
  }

  // Leaderboard global: top scores por usuario (su mejor partida)
  async function getLeaderboard(limit = CONFIG.LEADERBOARD_LIMIT) {
    const { data, error } = await _client
      .from('personal_bests')
      .select('best_score, best_time_ms, user_id, profiles(username)')
      .order('best_score', { ascending: false })
      .limit(limit);

    if (error) return { error };
    return { data };
  }

  // Personal best de un usuario concreto
  async function getPersonalBest(userId) {
    if (!userId) return { data: null };
    const { data, error } = await _client
      .from('personal_bests')
      .select('best_score, best_time_ms, total_games')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return { error };
    return { data };
  }

  // Posición del usuario en el ranking global (1-indexed)
  async function getUserRank(userId, userBestScore) {
    if (!userId || userBestScore == null) return { data: null };
    const { count, error } = await _client
      .from('personal_bests')
      .select('user_id', { count: 'exact', head: true })
      .gt('best_score', userBestScore);

    if (error) return { error };
    return { data: count + 1 };
  }

  return { init, saveRun, getLeaderboard, getPersonalBest, getUserRank };
})();
