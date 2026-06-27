// =============================================================
// config.js · Constantes y configuración central
// =============================================================

const CONFIG = {
  SUPABASE_URL: 'https://sjntbzemskwgfwlplkxe.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqbnRiemVtc2t3Z2Z3bHBsa3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMTg1NTQsImV4cCI6MjA5Nzg5NDU1NH0.zlYGp5qCoC3ykpWVhyB1C_RabyU-D9umiIRJpmyBMuY',

  CANVAS: { W: 560, H: 400 },

  DIFFICULTY: {
    MAX_MS: 30000,          // tiempo hasta dificultad máxima
    SCORE_RATE_MIN: 10,     // pts/s al inicio
    SCORE_RATE_MAX: 100,    // pts/s en máximo
  },

  PLAYER: {
    RADIUS: 9,
    LERP: 0.13,
    TRAIL_LENGTH: 28,
  },

  TOP_SCORES_LIMIT: 5,      // cuántos scores locales guardar
  LEADERBOARD_LIMIT: 10,    // cuántos scores globales mostrar
};
