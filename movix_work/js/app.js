(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const $all = selector => [...document.querySelectorAll(selector)];

  const KEYS = {
    list: 'movix-watchlist-v2',
    progress: 'movix-progress-v1',
    profile: 'movix-preview-profile-v1',
    history: 'movix-history-v1'
  };

  const auth = window.MOVIX_AUTH || {
    ready: false,
    client: null,
    loadUserState: async () => ({ profile: null, isAdmin: false }),
    checkIsAdmin: async () => false
  };

  const client = auth.client;

  let movies = Array.isArray(window.MOVIX_MOVIES) ? window.MOVIX_MOVIES : [];
  let pendingEmail = '';
  let resendTimer = null;
  let resendSeconds = 0;
  let currentPage = 'home';
  let activeGenre = 'All';
  let searchTerm = '';
  let currentMovie = null;
  let currentVideo = null;
  let currentSeason = 0;
  let currentEpisode = 0;
  let profile = null;
  let hlsInstance = null;
  let isAdmin = false;
  let adminItems = [];
  let editingItem = null;
  let adminType = 'movies';

  let watchlist = readArray(KEYS.list);
  let progress = readObject(KEYS.progress);
  let history = readArray(KEYS.history);

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('MOVIX local storage:', error);
    }
  }

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function normal(value) {
    return String(value ?? '').toLowerCase().trim();
  }

  function getId(movie) {
    return String(movie.id);
  }

  function getMovie(id) {
    return movies.find(movie => getId(movie) === String(id));
  }

  function imageOf(movie) {
    return movie.image || movie.poster || movie.thumbnail || '';
  }

  function videoOf(movie) {
    return movie.videoUrl || movie.video_url ||
      movie.streamUrl || movie.stream_url || '';
  }

  function subtitleOf(movie) {
    return movie.subtitleUrl || movie.subtitle_url || '';
  }

  function watched(movie) {
    return Number(progress[getId(movie)]?.percent || 0);
  }

  function updateMessage(message) {
    const element = $('loginMessage');
    if (element) element.textContent = message;
  }

  function setProfile(data) {
    profile = data || null;

    const name = profile?.display_name ||
      localStorage.getItem(KEYS.profile) || 'MOVIX Member';

    if ($('profileButton')) {
      $('profileButton').textContent =
        name.trim().charAt(0).toUpperCase() || 'M';
    }
  }

  // STYLES

  function addStyles() {
    if ($('movix-runtime-styles')) return;

    const style = document.createElement('style');
    style.id = 'movix-runtime-styles';

    style.textContent = `
      .movix-hero {
        position:relative; min-height:420px; display:flex;
        align-items:center; padding:45px; margin-bottom:35px;
        overflow:hidden; border-radius:14px;
        background:linear-gradient(90deg,#080d18 5%,#080d18dd 45%,transparent 100%),linear-gradient(0deg,#080d18 0%,transparent 65%);
        background-size:cover; background-position:center;
      }
      .movix-hero-copy { max-width:570px; position:relative; z-index:2; }
      .movix-hero h1 { font-size:clamp(38px,6vw,72px); line-height:.95; margin:15px 0; }
      .movix-hero p { color:#d0d8e5; line-height:1.7; max-width:520px; }
      .movix-hero-actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:22px; }
      .movix-secondary {
        padding:13px 20px; border:1px solid #617087; border-radius:7px;
        background:#273449; color:white; font-weight:800;
      }
      .movix-rail { margin:30px 0 38px; }
      .movix-rail-heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:15px; }
      .movix-rail-heading h2 { margin:0; font-size:20px; }
      .movix-rail-track {
        display:grid; grid-auto-flow:column; grid-auto-columns:minmax(145px,17%);
        gap:15px; overflow-x:auto; padding:5px 3px 17px;
        scroll-snap-type:x mandatory; scrollbar-width:thin;
      }
      .movix-rail-track .movie-card { scroll-snap-align:start; }
      .movie-card { cursor:pointer; }
      .poster-button { aspect-ratio:2/3; }
      .poster-button .poster {
        display:block; width:100%; height:100%; object-fit:cover;
        background:#111c2e;
      }
      .movie-info strong { display:block; font-size:13px; }
      .movie-info small { display:block; margin-top:6px; color:#9aa9bf; font-size:10px; }
      .movix-progress { height:4px; margin-top:10px; background:#46536a; border-radius:10px; overflow:hidden; }
      .movix-progress span { display:block; height:100%; background:#e50935; }
      .movix-row-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
      .movix-small-button {
        border:1px solid #394a63; background:#17253b; color:white;
        border-radius:6px; padding:8px 10px; font-size:11px;
      }
      .movix-small-button:hover { border-color:#e50935; }
      .movix-search-results { margin-top:20px; }
      .movix-player-wrap { background:#000; border-radius:10px; overflow:hidden; }
      .movix-video { display:block; width:100%; max-height:72vh; aspect-ratio:16/9; object-fit:contain; background:#000; }
      .movix-player-placeholder { min-height:300px; display:grid; place-content:center; text-align:center; padding:25px; color:#ddd; }
      .movix-player-controls { display:flex; flex-wrap:wrap; gap:9px; align-items:center; margin:14px 0; }
      .movix-player-controls button,.movix-settings select {
        padding:10px 14px; border:1px solid #394a63; border-radius:7px;
        color:white; background:#17253b; font-weight:700;
      }
      .movix-settings { display:none; flex-wrap:wrap; gap:15px; align-items:center; padding:15px; margin-bottom:20px; background:#111c2e; border:1px solid #293951; border-radius:9px; }
      .movix-settings.open { display:flex; }
      .movix-settings label { display:flex; align-items:center; gap:8px; color:#ccd5e2; }
      .movix-related { margin-top:35px; }
      .movix-related-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(145px,1fr)); gap:15px; }
      .movix-episode-list { display:grid; gap:10px; margin:20px 0; }
      .movix-episode { display:flex; align-items:center; gap:15px; padding:12px; background:#17253b; border:1px solid #293951; border-radius:8px; color:white; text-align:left; }
      .movix-episode-number { font-size:20px; color:#ff3159; }
      .movix-empty { padding:30px; color:#9aa9bf; text-align:center; }
      .movix-filter-row { display:flex; gap:8px; flex-wrap:wrap; margin:20px 0; }
      .movix-filter-row button { border:1px solid #34455e; border-radius:20px; padding:8px 14px; background:#17253b; color:white; }
      .movix-filter-row button.active { background:#e50935; border-color:#e50935; }
      .movix-device-hint { color:#8190a7; font-size:11px; margin-top:12px; }

      /* ADMIN DASHBOARD */
      .admin-wrap { max-width:1100px; }
      .admin-top {
        display:flex; align-items:center; justify-content:space-between;
        gap:15px; flex-wrap:wrap; margin:25px 0;
      }
      .admin-tabs { display:flex; gap:10px; flex-wrap:wrap; }
      .admin-tabs button,.admin-action {
        background:#17253b; color:white; border:1px solid #34455e;
        border-radius:7px; padding:11px 16px; cursor:pointer;
      }
      .admin-tabs button.active { background:#e50935; border-color:#e50935; }
      .admin-add {
        background:#e50935; border:0; border-radius:7px;
        padding:12px 18px; color:white; font-weight:800; cursor:pointer;
      }
      .admin-table-wrap { overflow-x:auto; border:1px solid #293951; border-radius:10px; }
      .admin-table { width:100%; border-collapse:collapse; min-width:650px; }
      .admin-table th,.admin-table td {
        text-align:left; padding:14px; border-bottom:1px solid #293951;
      }
      .admin-table th { background:#111c2e; color:#aab8ca; font-size:12px; }
      .admin-table td { color:#e5eaf1; font-size:13px; }
      .admin-table tr:last-child td { border-bottom:0; }
      .admin-poster { width:42px; height:58px; object-fit:cover; border-radius:5px; }
      .admin-edit { background:#263b59; }
      .admin-delete { background:#6d1d2c; }
      .admin-form {
        margin:25px 0; padding:22px; background:#111c2e;
        border:1px solid #293951; border-radius:10px;
      }
      .admin-form h2 { margin-top:0; }
      .admin-form-grid {
        display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px;
      }
      .admin-field { display:flex; flex-direction:column; gap:7px; }
      .admin-field.full { grid-column:1/-1; }
      .admin-field label { color:#aebbd0; font-size:12px; font-weight:700; }
      .admin-field input,.admin-field textarea,.admin-field select {
        width:100%; padding:12px; border:1px solid #34455e;
        border-radius:7px; background:#080f1c; color:white;
      }
      .admin-field textarea { min-height:100px; resize:vertical; }
      .admin-form-actions { display:flex; gap:10px; margin-top:18px; }
      .admin-status { margin:12px 0; color:#b9c6d8; font-size:13px; }
      .admin-note { color:#8798af; font-size:12px; line-height:1.6; margin-top:15px; }
      @media(max-width:900px) {
        .movix-rail-track { grid-auto-columns:minmax(135px,23%); }
        .movix-hero { min-height:350px; padding:30px; }
      }
      @media(max-width:650px) {
        .movix-hero { min-height:330px; padding:22px; }
        .movix-rail-track { grid-auto-columns:minmax(125px,38%); }
        .movix-hero h1 { font-size:42px; }
        .movix-player-controls button { flex:1 1 42%; }
        .movix-related-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .admin-form-grid { grid-template-columns:1fr; }
        .admin-field.full { grid-column:auto; }
      }
      @media(min-width:1500px) {
        .page-content { max-width:1900px; margin:auto; }
        .movix-hero { min-height:550px; }
        .movix-rail-track { grid-auto-columns:minmax(180px,14%); }
      }
      @media(hover:none) { .poster-play { opacity:1; } }
    `;

    document.head.appendChild(style);
  }

  // AUTHENTICATION

  function stopCountdown() {
    clearInterval(resendTimer);
    resendTimer = null;
    resendSeconds = 0;
  }

  function startCountdown() {
    stopCountdown();
    resendSeconds = 30;

    const button = $('resendOtpButton');
    button.disabled = true;

    const tick = () => {
      button.textContent = resendSeconds > 0
        ? `Resend code in ${resendSeconds}s`
        : 'Resend code';
      button.disabled = resendSeconds > 0;
    };

    tick();

    resendTimer = setInterval(() => {
      resendSeconds--;
      tick();
      if (resendSeconds <= 0) stopCountdown();
    }, 1000);
  }

  function resetOtp() {
    stopCountdown();
    pendingEmail = '';
    $('email').readOnly = false;
    $('otp').value = '';
    $('otpGroup').classList.add('hidden');
    $('demoOtp').classList.add('hidden');
    $('resendOtpButton').disabled = true;
    $('resendOtpButton').textContent = 'Resend code in 30s';
    $('loginButton').textContent = 'Continue';
    $('loginButton').disabled = false;
  }

  async function requestOtp() {
    const email = $('email').value.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      updateMessage('Enter a valid email address.');
      $('email').focus();
      return;
    }

    if (!auth.ready || !client) {
      updateMessage('Supabase email login is not configured.');
      return;
    }

    $('loginButton').disabled = true;
    updateMessage('Sending verification code...');

    try {
      const { error } = await client.auth.signInWithOtp({ email });
      if (error) throw error;

      pendingEmail = email;
      $('otpSentTo').textContent = `Verification code sent to ${email}.`;
      $('otpGroup').classList.remove('hidden');
      $('email').readOnly = true;
      $('loginButton').textContent = 'Verify & Enter';
      $('otp').value = '';
      $('otp').focus();
      updateMessage('Enter the 6-digit code sent to your email.');
      startCountdown();
    } catch (error) {
      updateMessage(error.message || 'Unable to send verification code.');
    } finally {
      $('loginButton').disabled = false;
    }
  }

  async function enterWebsite() {
    $('loginScreen').classList.add('hidden');
    $('site').classList.remove('hidden');

    if (auth.ready && typeof auth.loadUserState === 'function') {
      try {
        const state = await auth.loadUserState();
        setProfile(state.profile);
        isAdmin = state.isAdmin === true;
      } catch (error) {
        console.warn('Profile load:', error);
        setProfile(null);
        isAdmin = false;
      }
    } else {
      setProfile({
        display_name: localStorage.getItem(KEYS.profile) || 'MOVIX Member'
      });
      isAdmin = false;
    }

    const adminNav = $('adminNavigation');
    if (adminNav) adminNav.classList.toggle('hidden', !isAdmin);

    renderPage('home');
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();

    if ($('otpGroup').classList.contains('hidden')) {
      await requestOtp();
      return;
    }

    const token = $('otp').value.replace(/\D/g, '');

    if (!/^\d{6}$/.test(token)) {
      updateMessage('Enter the 6-digit verification code.');
      $('otp').focus();
      return;
    }

    $('loginButton').disabled = true;
    updateMessage('Verifying code...');

    try {
      const { error } = await client.auth.verifyOtp({
        email: pendingEmail || $('email').value.trim().toLowerCase(),
        token,
        type: 'email'
      });

      if (error) throw error;
      stopCountdown();
      await enterWebsite();
    } catch (error) {
      updateMessage(error.message || 'Verification failed.');
      $('otp').focus();
    } finally {
      $('loginButton').disabled = false;
    }
  });

  $('otp').addEventListener('input', () => {
    $('otp').value = $('otp').value.replace(/\D/g, '').slice(0, 6);
  });

  $('changeNumberButton').addEventListener('click', () => {
    resetOtp();
    updateMessage('Enter your email address.');
    $('email').focus();
  });

  $('resendOtpButton').addEventListener('click', requestOtp);

  if (auth.ready && client) {
    updateMessage('Enter your email to receive a verification code.');

    client.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Session error:', error);
        return;
      }
      if (data.session) enterWebsite();
    });
  } else {
    updateMessage('Email login is not configured yet.');
  }

  // CATALOGUE AND WATCH DATA

  function updateProgress(movie, percent, seconds, duration) {
    const id = getId(movie);

    progress[id] = {
      percent: Math.max(0, Math.min(99, Number(percent) || 0)),
      seconds: Number(seconds) || 0,
      duration: Number(duration) || 0,
      updated: Date.now()
    };

    history = [id, ...history.filter(item => item !== id)].slice(0, 100);
    save(KEYS.progress, progress);
    save(KEYS.history, history);
    updateContinueRail();
  }

  function addToList(id) {
    const key = String(id);
    watchlist = watchlist.includes(key)
      ? watchlist.filter(item => item !== key)
      : [...watchlist, key];
    save(KEYS.list, watchlist);
  }

  function imageMarkup(movie) {
    const src = imageOf(movie);
    return src
      ? `<img class="poster" src="${safe(src)}" alt="${safe(movie.title)}" loading="lazy">`
      : `<div class="poster movix-no-poster">${safe(movie.title)}</div>`;
  }

  function card(movie) {
    const id = getId(movie);
    const percent = watched(movie);
    const saved = watchlist.includes(id);

    return `
      <article class="movie-card" data-card-id="${safe(id)}">
        <button class="poster-button" data-details="${safe(id)}" aria-label="Open ${safe(movie.title)}">
          ${imageMarkup(movie)}
          <span class="poster-play">MORE INFO</span>
        </button>
        <div class="movie-info">
          <strong>${safe(movie.title)}</strong>
          <small>${safe(movie.year || '')} · ${safe(movie.genre || '')} · ${safe(movie.type || '')}</small>
          ${percent > 0 ? `<div class="movix-progress"><span style="width:${percent}%"></span></div>` : ''}
          <div class="movix-row-actions">
            <button class="movix-small-button" data-details="${safe(id)}">Play / Details</button>
            <button class="movix-small-button" data-toggle-list="${safe(id)}">${saved ? '✓ Saved' : '+ My List'}</button>
          </div>
        </div>
      </article>`;
  }

  function empty(message) {
    return `<div class="movix-empty">${safe(message)}</div>`;
  }

  function rail(title, items, id) {
    if (!items.length) return '';
    return `
      <section class="movix-rail" id="${safe(id || '')}">
        <div class="movix-rail-heading"><h2>${safe(title)}</h2></div>
        <div class="movix-rail-track">${items.map(card).join('')}</div>
      </section>`;
  }

  function movieMatches(movie, query) {
    const searchable = [
      movie.title, movie.genre, movie.year, movie.type,
      movie.description, ...(movie.cast || [])
    ].join(' ');
    return normal(searchable).includes(normal(query));
  }

  function filtered(items) {
    return items.filter(movie =>
      (activeGenre === 'All' || movie.genre === activeGenre) &&
      (!searchTerm || movieMatches(movie, searchTerm))
    );
  }

  function pageHeader(kicker, title, description) {
    return `
      <div class="page-kicker">${safe(kicker)}</div>
      <h1 class="page-title">${safe(title)}</h1>
      <p class="page-description">${safe(description)}</p>`;
  }

  function searchBox() {
    return `
      <div class="catalogue-search">
        <input id="catalogueSearch" type="search" placeholder="Search movies, series, genres..." value="${safe(searchTerm)}" aria-label="Search catalogue">
        <span>SEARCH</span>
      </div>`;
  }

  function genresFor(items) {
    return ['All', ...new Set(items.map(item => item.genre).filter(Boolean))];
  }

  function cataloguePage(type) {
    const items = movies.filter(movie => movie.type === type);
    const genres = genresFor(items);

    return `
      ${pageHeader('THE MOVIX COLLECTION', type === 'Movie' ? 'MOVIES' : 'SERIES',
        type === 'Movie' ? 'Find your next favourite movie.' : 'Explore stories made to keep you watching.')}
      ${searchBox()}
      <div class="movix-filter-row">
        ${genres.map(genre => `<button data-genre="${safe(genre)}" class="${activeGenre === genre ? 'active' : ''}">${safe(genre)}</button>`).join('')}
      </div>
      <div id="catalogue" class="movie-grid">
        ${filtered(items).map(card).join('') || empty('No titles found.')}
      </div>`;
  }

  function renderHome() {
    const featured = movies.find(movie => movie.featured) || movies[0];
    const trending = movies.filter(movie => movie.trending).concat(movies.filter(movie => !movie.trending)).slice(0, 14);
    const continueItems = movies.filter(movie => watched(movie) > 0);
    const popular = movies.filter(movie => movie.popular).concat(movies).slice(0, 14);
    const newItems = movies.filter(movie => movie.isNew || movie.newRelease).slice(0, 14);
    const series = movies.filter(movie => movie.type === 'Series').slice(0, 14);
    const movieItems = movies.filter(movie => movie.type === 'Movie').slice(0, 14);
    const savedItems = movies.filter(movie => watchlist.includes(getId(movie)));

    let hero = '';

    if (featured) {
      const background = imageOf(featured);
      hero = `
        <section class="movix-hero" style="${background ? `background-image:linear-gradient(90deg,#080d18 5%,#080d18dd 45%,transparent 100%),url('${safe(background)}')` : ''}">
          <div class="movix-hero-copy">
            <div class="page-kicker">MOVIX FEATURED TITLE</div>
            <h1>${safe(featured.title)}</h1>
            <p>${safe(featured.description || 'Discover your next unforgettable story.')}</p>
            <div class="movix-hero-actions">
              <button class="button button-primary" data-details="${safe(getId(featured))}">Play / More Info</button>
              <button class="movix-secondary" data-page="movies">Explore Movies</button>
            </div>
          </div>
        </section>`;
    }

    return `
      ${hero}
      ${searchBox()}
      <div id="homeSearchResults"></div>
      ${rail('Trending Now', trending, 'trendingRail')}
      ${rail('Continue Watching', continueItems, 'continueRail')}
      ${rail('Popular Movies', popular, 'popularRail')}
      ${rail('New Releases', newItems, 'newRail')}
      ${rail('Series', series, 'seriesRail')}
      ${rail('Movies', movieItems, 'moviesRail')}
      ${rail('My List', savedItems, 'myListRail')}
      ${!movies.length ? empty('Your catalogue is empty. Add authorised catalogue titles to MOVIX.') : ''}
    `;
  }

  function updateContinueRail() {
    if (currentPage !== 'home') return;

    const railElement = $('continueRail');
    const items = movies.filter(movie => watched(movie) > 0);

    if (!items.length) {
      railElement?.remove();
      return;
    }

    if (railElement) {
      railElement.outerHTML = rail('Continue Watching', items, 'continueRail');
    } else {
      const popular = $('popularRail');
      if (popular) popular.insertAdjacentHTML('beforebegin', rail('Continue Watching', items, 'continueRail'));
    }
  }

  // ADMIN DASHBOARD

  function adminPage() {
    if (!isAdmin) {
      return `${pageHeader('RESTRICTED AREA', 'ACCESS DENIED', 'You do not have administrator permission.')}`;
    }

    return `
      <div class="admin-wrap">
        ${pageHeader('MOVIX MANAGEMENT', 'ADMIN DASHBOARD', 'Manage your movie and series catalogue.')}
        <div class="admin-top">
          <div class="admin-tabs">
            <button data-admin-type="movies" class="${adminType === 'movies' ? 'active' : ''}">Movies</button>
            <button data-admin-type="series" class="${adminType === 'series' ? 'active' : ''}">Series</button>
          </div>
          <button class="admin-add" id="adminAddButton">+ Add ${adminType === 'movies' ? 'Movie' : 'Series'}</button>
        </div>
        <div id="adminFormArea"></div>
        <div id="adminStatus" class="admin-status">Loading catalogue...</div>
        <div id="adminTableArea"></div>
        <p class="admin-note">Note: Video storage and playback connection are separate steps. The video path field stores a storage key, not a public video URL.</p>
      </div>`;
  }

  async function loadAdminItems() {
    if (!isAdmin || !client) return;

    const table = adminType;

    $('adminStatus').textContent = 'Loading...';
    $('adminTableArea').innerHTML = '';

    const { data, error } = await client
      .from(table)
      .select('id,title,description,release_year,language,rating,poster_url,banner_url,is_featured')
      .order('created_at', { ascending: false });

    if (error) {
      $('adminStatus').textContent = `Unable to load ${table}: ${error.message}`;
      return;
    }

    adminItems = data || [];
    $('adminStatus').textContent = `${adminItems.length} ${table} found.`;
    renderAdminTable();
  }

  function renderAdminTable() {
    const target = $('adminTableArea');
    if (!target) return;

    if (!adminItems.length) {
      target.innerHTML = empty('No titles added yet. Use the Add button to create one.');
      return;
    }

    target.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr><th>Poster</th><th>Title</th><th>Year</th><th>Featured</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${adminItems.map(item => `
              <tr>
                <td>${item.poster_url ? `<img class="admin-poster" src="${safe(item.poster_url)}" alt="">` : '—'}</td>
                <td>${safe(item.title)}</td>
                <td>${safe(item.release_year || '—')}</td>
                <td>${item.is_featured ? 'Yes' : 'No'}</td>
                <td>
                  <button class="admin-action admin-edit" data-admin-edit="${safe(item.id)}">Edit</button>
                  <button class="admin-action admin-delete" data-admin-delete="${safe(item.id)}">Delete</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function adminForm(item = null) {
    editingItem = item ? item.id : null;
    const title = item ? item.title : '';
    const description = item ? item.description : '';
    const year = item ? item.release_year : '';
    const language = item ? item.language : '';
    const rating = item ? item.rating : '';
    const poster = item ? item.poster_url : '';
    const banner = item ? item.banner_url : '';
    const featured = item ? item.is_featured : false;

    $('adminFormArea').innerHTML = `
      <form class="admin-form" id="adminItemForm">
        <h2>${item ? 'Edit' : 'Add'} ${adminType === 'movies' ? 'Movie' : 'Series'}</h2>
        <div class="admin-form-grid">
          <div class="admin-field">
            <label for="adminTitle">TITLE *</label>
            <input id="adminTitle" maxlength="180" required value="${safe(title)}">
          </div>
          <div class="admin-field">
            <label for="adminYear">RELEASE YEAR</label>
            <input id="adminYear" type="number" min="1888" max="2100" value="${safe(year)}">
          </div>
          <div class="admin-field">
            <label for="adminLanguage">LANGUAGE</label>
            <input id="adminLanguage" maxlength="60" value="${safe(language)}" placeholder="English">
          </div>
          <div class="admin-field">
            <label for="adminRating">RATING</label>
            <input id="adminRating" type="number" min="0" max="10" step="0.1" value="${safe(rating)}">
          </div>
          <div class="admin-field full">
            <label for="adminPoster">POSTER IMAGE URL</label>
            <input id="adminPoster" type="url" value="${safe(poster)}" placeholder="https://...">
          </div>
          <div class="admin-field full">
            <label for="adminBanner">BANNER IMAGE URL</label>
            <input id="adminBanner" type="url" value="${safe(banner)}" placeholder="https://...">
          </div>
          <div class="admin-field full">
            <label for="adminDescription">DESCRIPTION</label>
            <textarea id="adminDescription">${safe(description)}</textarea>
          </div>
          <div class="admin-field full">
            <label><input id="adminFeatured" type="checkbox" ${featured ? 'checked' : ''}> Show as featured title</label>
          </div>
        </div>
        <div class="admin-form-actions">
          <button class="admin-add" type="submit">${item ? 'Save Changes' : 'Add Title'}</button>
          <button class="admin-action" type="button" id="adminCancelButton">Cancel</button>
        </div>
      </form>`;
  }

  async function saveAdminItem(event) {
    event.preventDefault();

    if (!isAdmin || !client) {
      alert('Admin access is required.');
      return;
    }

    const title = $('adminTitle').value.trim();
    if (!title) {
      alert('Enter a title.');
      return;
    }

    const yearValue = $('adminYear').value;
    const ratingValue = $('adminRating').value;

    const payload = {
      title,
      description: $('adminDescription').value.trim(),
      release_year: yearValue ? Number(yearValue) : null,
      language: $('adminLanguage').value.trim() || null,
      rating: ratingValue ? Number(ratingValue) : null,
      poster_url: $('adminPoster').value.trim() || null,
      banner_url: $('adminBanner').value.trim() || null,
      is_featured: $('adminFeatured').checked
    };

    const submit = $('adminItemForm').querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Saving...';

    try {
      let result;

      if (editingItem) {
        result = await client
          .from(adminType)
          .update(payload)
          .eq('id', editingItem);
      } else {
        result = await client
          .from(adminType)
          .insert(payload);
      }

      if (result.error) throw result.error;

      $('adminFormArea').innerHTML = '';
      editingItem = null;

      await loadAdminItems();
      await loadCatalogue();

      $('adminStatus').textContent = 'Saved successfully.';
    } catch (error) {
      alert(`Could not save title: ${error.message}`);
      submit.disabled = false;
      submit.textContent = editingItem ? 'Save Changes' : 'Add Title';
    }
  }

  async function deleteAdminItem(id) {
    if (!isAdmin || !client) return;

    const item = adminItems.find(entry => String(entry.id) === String(id));
    if (!item) return;

    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;

    $('adminStatus').textContent = 'Deleting...';

    const { error } = await client
      .from(adminType)
      .delete()
      .eq('id', id);

    if (error) {
      $('adminStatus').textContent = `Delete failed: ${error.message}`;
      return;
    }

    $('adminFormArea').innerHTML = '';
    await loadAdminItems();
    await loadCatalogue();
    $('adminStatus').textContent = 'Title deleted.';
  }

  // PAGE RENDERING

  function renderPage(page) {
    if (page === 'admin' && !isAdmin) {
      page = 'home';
      alert('Admin permission required.');
    }

    currentPage = page;
    activeGenre = 'All';
    searchTerm = '';

    $all('.nav-link').forEach(button => {
      const active = button.dataset.page === page;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    $('profileMenu').classList.add('hidden');
    $('profileButton').setAttribute('aria-expanded', 'false');

    const content = $('pageContent');

    if (page === 'home') {
      content.innerHTML = renderHome();
    } else if (page === 'movies') {
      content.innerHTML = cataloguePage('Movie');
    } else if (page === 'series') {
      content.innerHTML = cataloguePage('Series');
    } else if (page === 'continue') {
      const items = movies.filter(movie => watched(movie) > 0);
      content.innerHTML = `
        ${pageHeader('PICK UP WHERE YOU LEFT OFF', 'CONTINUE WATCHING', 'Continue your unfinished stories.')}
        ${items.length ? `<div class="movie-grid">${items.map(card).join('')}</div>` : empty('You have no titles in progress yet.')}`;
    } else if (page === 'mylist') {
      const items = movies.filter(movie => watchlist.includes(getId(movie)));
      content.innerHTML = `
        ${pageHeader('SAVED FOR LATER', 'MY LIST', 'Your personal collection.')}
        ${items.length ? `<div class="movie-grid">${items.map(card).join('')}</div>` : empty('Your My List is empty.')}`;
    } else if (page === 'subscription') {
      content.innerHTML = `
        ${pageHeader('MORE STORIES. MORE CHOICE.', 'SUBSCRIPTION', 'Subscription plans will be connected to secure checkout.')}
        <div class="plans">
          <article class="plan-card"><h2>Monthly</h2><div class="plan-price">₹149</div><p>Monthly plan</p><button class="button button-primary" data-plan="Monthly">Choose Monthly</button></article>
          <article class="plan-card featured"><h2>Yearly</h2><div class="plan-price">₹999</div><p>Yearly plan</p><button class="button button-primary" data-plan="Yearly">Choose Yearly</button></article>
        </div>
        <p class="page-description">Payments are not active until server-side payment verification is implemented.</p>`;
    } else if (page === 'profile') {
      content.innerHTML = `
        ${pageHeader('YOUR ACCOUNT', 'MY PROFILE', 'Manage your MOVIX account.')}
        <section class="profile-card">
          <label for="displayName">DISPLAY NAME</label>
          <input id="displayName" maxlength="40" value="${safe(profile?.display_name || localStorage.getItem(KEYS.profile) || 'MOVIX Member')}">
          <button class="button button-primary" id="saveProfile">Save Profile</button>
        </section>`;
    } else if (page === 'admin') {
      content.innerHTML = adminPage();
      loadAdminItems();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // DETAILS AND PLAYER

  function episodeList(movie) {
    const seasons = movie.seasons || [];
    if (!seasons.length) return '';

    const season = seasons[currentSeason] || seasons[0];
    const episodes = season.episodes || [];

    return `
      <div class="movix-episode-section">
        <h3>Episodes</h3>
        <div class="movix-filter-row">
          ${seasons.map((item, index) => `<button data-season="${index}" class="${index === currentSeason ? 'active' : ''}">Season ${index + 1}</button>`).join('')}
        </div>
        <div class="movix-episode-list">
          ${episodes.map((episode, index) => `
            <button class="movix-episode" data-episode="${index}">
              <span class="movix-episode-number">${index + 1}</span>
              <span><strong>${safe(episode.title || `Episode ${index + 1}`)}</strong><br><small>${safe(episode.description || '')}</small></span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function closeDetails() {
    if (currentVideo) {
      currentVideo.pause();
      currentVideo = null;
    }

    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    $('detailsModal').classList.add('hidden');
    $('detailsModal').setAttribute('aria-hidden', 'true');
  }

  function showDetails(id) {
    const movie = getMovie(id);
    if (!movie) return;

    if (currentVideo) {
      currentVideo.pause();
      currentVideo = null;
    }

    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    currentMovie = movie;
    currentSeason = 0;
    currentEpisode = 0;

    const panel = $('movixPlayerPanel');
    const videoUrl = videoOf(movie);
    const subtitleUrl = subtitleOf(movie);

    $('detailsTitle').textContent = movie.title;
    $('detailsMeta').textContent = `${movie.year || ''} · ${movie.genre || ''} · ${movie.type || ''}`;
    $('detailsDescription').textContent = movie.description || 'Discover this MOVIX title.';

    panel.innerHTML = `
      <div class="movix-player-wrap movix-fullscreen" id="movixPlayerWrap">
        ${videoUrl
          ? `<video class="movix-video" id="movixVideo" controls playsinline preload="metadata" poster="${safe(imageOf(movie))}">
              <source src="${safe(videoUrl)}">
              ${subtitleUrl ? `<track kind="subtitles" src="${safe(subtitleUrl)}" srclang="en" label="English" default>` : ''}
            </video>`
          : `<div class="movix-player-placeholder"><h2>MOVIX PLAYER</h2><p>No authorised video source is connected to this title yet.</p><p class="movix-device-hint">Add a licensed video source to enable playback.</p></div>`}
      </div>
      <div class="movix-player-controls">
        <button id="movixPlayButton" type="button">Play / Pause</button>
        <button id="movixBackButton" type="button">-10 sec</button>
        <button id="movixForwardButton" type="button">+10 sec</button>
        <button id="movixFullscreenButton" type="button">Fullscreen</button>
        <button id="movixSettingsButton" type="button">Settings</button>
        <button id="movixSubtitleButton" type="button">Subtitles</button>
      </div>
      <div class="movix-settings" id="movixSettings">
        <label>Speed
          <select id="movixSpeed">
            <option value="0.5">0.5x</option><option value="0.75">0.75x</option>
            <option value="1" selected>1x Normal</option><option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option><option value="1.75">1.75x</option><option value="2">2x</option>
          </select>
        </label>
        <label>Quality <select id="movixQuality"><option value="auto">Auto / Source</option></select></label>
        <label>Volume <input id="movixVolume" type="range" min="0" max="1" step="0.05" value="1"></label>
      </div>
      ${episodeList(movie)}
      <section class="movix-related">
        <h2>More Like This</h2>
        <div class="movix-related-grid">
          ${movies.filter(item => getId(item) !== getId(movie) && (item.genre === movie.genre || item.type === movie.type)).slice(0, 12).map(card).join('') || empty('More titles coming soon.')}
        </div>
      </section>`;

    $('detailsModal').classList.remove('hidden');
    $('detailsModal').setAttribute('aria-hidden', 'false');

    currentVideo = $('movixVideo');

    if (currentVideo) {
      const saved = progress[getId(movie)];

      if (saved?.seconds > 0) {
        currentVideo.addEventListener('loadedmetadata', () => {
          currentVideo.currentTime = Math.min(saved.seconds, Math.max(0, currentVideo.duration - 2));
        }, { once: true });
      }

      currentVideo.addEventListener('timeupdate', () => {
        if (!currentVideo.duration || !Number.isFinite(currentVideo.duration)) return;
        updateProgress(movie, currentVideo.currentTime / currentVideo.duration * 100, currentVideo.currentTime, currentVideo.duration);
      });

      currentVideo.addEventListener('ended', () => {
        updateProgress(movie, 0, 0, currentVideo.duration);
        playNextEpisode();
      });
    }

    $('movixPlayButton').onclick = () => {
      if (!currentVideo) return;
      if (currentVideo.paused) currentVideo.play().catch(console.error);
      else currentVideo.pause();
    };

    $('movixBackButton').onclick = () => {
      if (currentVideo) currentVideo.currentTime = Math.max(0, currentVideo.currentTime - 10);
    };

    $('movixForwardButton').onclick = () => {
      if (currentVideo) currentVideo.currentTime = Math.min(currentVideo.duration || Infinity, currentVideo.currentTime + 10);
    };

    $('movixFullscreenButton').onclick = async () => {
      const wrap = $('movixPlayerWrap');
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (wrap.requestFullscreen) await wrap.requestFullscreen();
      } catch (error) {
        console.warn('Fullscreen:', error);
      }
    };

    $('movixSettingsButton').onclick = () => $('movixSettings').classList.toggle('open');

    $('movixSpeed').onchange = event => {
      if (currentVideo) currentVideo.playbackRate = Number(event.target.value);
    };

    $('movixVolume').oninput = event => {
      if (currentVideo) currentVideo.volume = Number(event.target.value);
    };

    $('movixSubtitleButton').onclick = () => {
      if (!currentVideo || !currentVideo.textTracks.length) {
        alert('Subtitles are not available for this title.');
        return;
      }
      const track = currentVideo.textTracks[0];
      track.mode = track.mode === 'showing' ? 'hidden' : 'showing';
    };
  }

  function playNextEpisode() {
    if (!currentMovie?.seasons?.length) return;
    const episodes = currentMovie.seasons[currentSeason]?.episodes || [];

    if (currentEpisode + 1 < episodes.length) {
      currentEpisode++;
      playEpisode(currentEpisode);
    } else if (currentSeason + 1 < currentMovie.seasons.length) {
      currentSeason++;
      currentEpisode = 0;
      playEpisode(0);
    }
  }

  function playEpisode(index) {
    const season = currentMovie?.seasons?.[currentSeason];
    const episode = season?.episodes?.[index];
    if (!episode) return;

    currentEpisode = index;
    const url = episode.videoUrl || episode.video_url || episode.streamUrl;

    if (!url) {
      alert('This episode has no authorised video source yet.');
      return;
    }

    const video = document.createElement('video');
    video.id = 'movixVideo';
    video.className = 'movix-video';
    video.controls = true;
    video.playsInline = true;
    video.src = url;

    $('movixPlayerWrap').innerHTML = '';
    $('movixPlayerWrap').appendChild(video);

    currentVideo = video;
    video.play().catch(() => {});
  }

  // SEARCH

  function showSearchResults(query) {
    const results = movies.filter(movie => movieMatches(movie, query));
    const target = $('homeSearchResults');

    if (target) {
      target.innerHTML = query
        ? `<section class="movix-search-results"><h2>Search Results</h2><div class="movie-grid">${results.map(card).join('') || empty('No matching titles.')}</div></section>`
        : '';
      return;
    }

    const catalogue = $('catalogue');
    if (catalogue) {
      const type = currentPage === 'series' ? 'Series' : 'Movie';
      catalogue.innerHTML = filtered(movies.filter(movie => movie.type === type)).map(card).join('') || empty('No matching titles.');
    }
  }

  // CLICK ACTIONS

  document.addEventListener('click', event => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      renderPage(pageButton.dataset.page);
      return;
    }

    const adminTypeButton = event.target.closest('[data-admin-type]');
    if (adminTypeButton && isAdmin) {
      adminType = adminTypeButton.dataset.adminType;
      editingItem = null;
      renderPage('admin');
      return;
    }

    if (event.target.closest('#adminAddButton')) {
      if (isAdmin) adminForm();
      return;
    }

    const editButton = event.target.closest('[data-admin-edit]');
    if (editButton && isAdmin) {
      const item = adminItems.find(entry => String(entry.id) === editButton.dataset.adminEdit);
      if (item) adminForm(item);
      return;
    }

    const deleteButton = event.target.closest('[data-admin-delete]');
    if (deleteButton && isAdmin) {
      deleteAdminItem(deleteButton.dataset.adminDelete);
      return;
    }

    if (event.target.closest('#adminCancelButton')) {
      $('adminFormArea').innerHTML = '';
      editingItem = null;
      return;
    }

    const detailsButton = event.target.closest('[data-details]');
    if (detailsButton) {
      showDetails(detailsButton.dataset.details);
      return;
    }

    const toggleButton = event.target.closest('[data-toggle-list]');
    if (toggleButton) {
      const id = toggleButton.dataset.toggleList;
      addToList(id);
      renderPage(currentPage);

      if (currentMovie && getId(currentMovie) === String(id) && !$('detailsModal').classList.contains('hidden')) {
        showDetails(id);
      }
      return;
    }

    const genreButton = event.target.closest('[data-genre]');
    if (genreButton) {
      activeGenre = genreButton.dataset.genre;
      $all('[data-genre]').forEach(button => button.classList.toggle('active', button.dataset.genre === activeGenre));
      showSearchResults(searchTerm);
      return;
    }

    const seasonButton = event.target.closest('[data-season]');
    if (seasonButton) {
      currentSeason = Number(seasonButton.dataset.season);
      showDetails(getId(currentMovie));
      return;
    }

    const episodeButton = event.target.closest('[data-episode]');
    if (episodeButton) {
      playEpisode(Number(episodeButton.dataset.episode));
      return;
    }

    const planButton = event.target.closest('[data-plan]');
    if (planButton) {
      alert('Secure checkout is not active yet. No payment has been taken.');
      return;
    }

    if (event.target === $('detailsModal')) {
      closeDetails();
      return;
    }

    if (event.target.id === 'saveProfile') {
      const name = $('displayName').value.trim();
      if (!name) {
        alert('Enter a display name.');
        return;
      }
      localStorage.setItem(KEYS.profile, name);
      setProfile({ ...profile, display_name: name });
      alert('Profile saved on this device.');
    }
  });

  document.addEventListener('submit', event => {
    if (event.target.id === 'adminItemForm') {
      saveAdminItem(event);
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'catalogueSearch') {
      searchTerm = event.target.value;
      showSearchResults(searchTerm);
    }
  });

  // PROFILE AND LOGOUT

  $('profileButton').addEventListener('click', () => {
    const menu = $('profileMenu');
    const opening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !opening);
    $('profileButton').setAttribute('aria-expanded', String(opening));
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.profile-wrap')) {
      $('profileMenu').classList.add('hidden');
      $('profileButton').setAttribute('aria-expanded', 'false');
    }
  });

  $('logoutButton').addEventListener('click', async () => {
    $('profileMenu').classList.add('hidden');
    $('site').classList.add('hidden');

    if (client) {
      const { error } = await client.auth.signOut();
      if (error) console.error('Logout error:', error);
    }

    isAdmin = false;
    const adminNav = $('adminNavigation');
    if (adminNav) adminNav.classList.add('hidden');

    setProfile(null);
    $('loginScreen').classList.remove('hidden');
    resetOtp();
    $('email').value = '';
    updateMessage('You have been logged out.');
  });

  $('detailsClose').addEventListener('click', closeDetails);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!$('detailsModal').classList.contains('hidden')) closeDetails();
      $('profileMenu').classList.add('hidden');
      $('profileButton').setAttribute('aria-expanded', 'false');
    }

    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const active = document.activeElement;
      if (active && active.matches('button, input, select, a')) return;

      const controls = $all('.nav-link, .poster-button, .movix-player-controls button, .movix-small-button')
        .filter(element => element.getClientRects().length);

      const index = controls.indexOf(active);
      if (index < 0 || !controls.length) return;

      event.preventDefault();

      const next = event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % controls.length
        : (index - 1 + controls.length) % controls.length;

      controls[next].focus();
    }
  });

  // LOAD CATALOGUE

  async function loadCatalogue() {
    if (typeof window.MOVIX_LOAD_CATALOGUE !== 'function') return;

    try {
      await window.MOVIX_LOAD_CATALOGUE();

      if (Array.isArray(window.MOVIX_MOVIES)) {
        movies = window.MOVIX_MOVIES;
      }

      console.log('MOVIX catalogue loaded.');

      if (!$('site').classList.contains('hidden') && currentPage !== 'admin') {
        renderPage(currentPage);
      }
    } catch (error) {
      console.error('MOVIX catalogue error:', error);
    }
  }

  // STARTUP

  addStyles();
  loadCatalogue();

})();