// =============================================================
// auth.js · Login, registro, sesión con Supabase
// =============================================================

const Auth = (() => {
  let _client = null;
  let _currentUser = null;
  let _onChangeCallbacks = [];

  function init(client) {
    _client = client;

    _client.auth.onAuthStateChange(async (event, session) => {
      _currentUser = session?.user ?? null;
      _onChangeCallbacks.forEach(cb => cb(_currentUser));
    });
  }

  function onUserChange(callback) {
    _onChangeCallbacks.push(callback);
  }

  async function getSession() {
    const { data } = await _client.auth.getSession();
    _currentUser = data.session?.user ?? null;
    return _currentUser;
  }

  async function register(email, password, username) {
    // Comprobar si el username ya existe
    const { data: existing } = await _client
      .from('profiles')
      .select('username')
      .eq('username', username)
      .maybeSingle();

    if (existing) return { error: { message: 'Ese nombre de usuario ya está en uso.' } };

    const { data, error } = await _client.auth.signUp({ email, password });
    if (error) return { error };

    // Crear perfil público
    const { error: profileError } = await _client.from('profiles').insert({
      id: data.user.id,
      username,
    });

    if (profileError) return { error: profileError };
    return { data };
  }

  async function login(email, password) {
    const { data, error } = await _client.auth.signInWithPassword({ email, password });
    if (error) return { error };
    return { data };
  }

  async function logout() {
    await _client.auth.signOut();
    _currentUser = null;
  }

  function currentUser() {
    return _currentUser;
  }

  return { init, onUserChange, getSession, register, login, logout, currentUser };
})();
