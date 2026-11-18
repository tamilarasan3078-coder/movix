
(() => {
  'use strict';

  const config = window.MOVIX_SUPABASE_CONFIG || {
    url: '',
    anonKey: ''
  };

  const ready = Boolean(
    config.url &&
    config.anonKey &&
    window.supabase?.createClient
  );

  const client = ready
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

  let cachedProfile = null;
  let cachedIsAdmin = false;

  async function getSession() {
    if (!client) return null;

    const { data, error } = await client.auth.getSession();

    if (error) {
      console.error('MOVIX session error:', error.message);
      return null;
    }

    return data.session;
  }

  async function getProfile(userId) {
    if (!client || !userId) return null;

    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('MOVIX profile error:', error.message);
      return null;
    }

    return data;
  }

  async function checkIsAdmin() {
    if (!client) return false;

    const { data, error } = await client.rpc('is_movix_admin');

    if (error) {
      console.error('MOVIX admin verification error:', error.message);
      return false;
    }

    return data === true;
  }

  async function loadUserState() {
    if (!client) {
      cachedProfile = null;
      cachedIsAdmin = false;
      return { profile: null, isAdmin: false };
    }

    const session = await getSession();

    if (!session) {
      cachedProfile = null;
      cachedIsAdmin = false;
      return { profile: null, isAdmin: false };
    }

    const [profile, isAdmin] = await Promise.all([
      getProfile(session.user.id),
      checkIsAdmin()
    ]);

    cachedProfile = profile;
    cachedIsAdmin = isAdmin;

    return { profile, isAdmin };
  }

  window.MOVIX_AUTH = {
    ready,
    client,
    getSession,
    getProfile,
    checkIsAdmin,
    loadUserState,

    get currentProfile() {
      return cachedProfile;
    },

    get currentIsAdmin() {
      return cachedIsAdmin;
    }
  };

  console.log('MOVIX Supabase Ready:', ready);
})();
