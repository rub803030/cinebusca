/**
 * CineBusca · Lógica del frontend
 *
 * Todo pasa por /api/*: el navegador nunca ve la clave de TMDB.
 * Los datos se insertan con textContent / createElement para evitar inyección de HTML.
 */

const elements = {
  form: document.getElementById('search-form'),
  input: document.getElementById('search-input'),
  searchButton: document.getElementById('search-button'),
  grid: document.getElementById('grid'),
  resultsTitle: document.getElementById('results-title'),
  resultsMeta: document.getElementById('results-meta'),
  hero: document.getElementById('hero'),
  errorBox: document.getElementById('error-box'),
  errorTitle: document.getElementById('error-title'),
  errorMessage: document.getElementById('error-message'),
  retryButton: document.getElementById('retry-button'),
  emptyState: document.getElementById('empty-state'),
  emptyMessage: document.getElementById('empty-message'),
  loadMore: document.getElementById('load-more'),
  statusText: document.getElementById('status-text'),
  offlineBanner: document.getElementById('offline-banner'),
  setupBanner: document.getElementById('setup-banner'),
  dialog: document.getElementById('detail-dialog'),
  detailContent: document.getElementById('detail-content'),
  detailClose: document.getElementById('detail-close'),
};

const state = {
  query: '',
  page: 1,
  totalPages: 1,
  totalResults: 0,
  movies: [],
  loading: false,
  requestId: 0,
  controller: null,
  lastRequest: { page: 1, append: false },
  details: new Map(),
};

let detailRequest = 0;

const VOTE_FORMAT = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });

/** Error con datos útiles para decidir qué mensaje mostrar. */
class ApiError extends Error {
  constructor(message, { code = 'UNKNOWN', status = 0, retryAfter = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/* ------------------------------ Utilidades DOM ---------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatRuntime(minutes) {
  if (!minutes) return 'Duración no disponible';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
}

function plural(count, singular, pluralForm) {
  return `${count.toLocaleString('es')} ${count === 1 ? singular : pluralForm}`;
}

/* --------------------------------- Red ----------------------------------- */

/**
 * Petición a nuestra propia API con tiempo máximo de espera.
 * Si el servidor responde con error, lanza ApiError con el código recibido.
 */
async function apiFetch(path, { signal } = {}) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 10000);
  const forwardAbort = () => timeoutController.abort();
  if (signal) signal.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(path, {
      headers: { accept: 'application/json' },
      signal: timeoutController.signal,
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(body?.error?.message || `El servidor respondió con un error (${response.status}).`, {
        code: body?.error?.code || 'HTTP_ERROR',
        status: response.status,
        retryAfter: body?.error?.retryAfter ?? null,
      });
    }

    if (!body) {
      throw new ApiError('El servidor devolvió una respuesta vacía.', { code: 'EMPTY_RESPONSE' });
    }

    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError' && signal?.aborted) throw error; // cancelada por el usuario
    if (error.name === 'AbortError') {
      throw new ApiError('La petición tardó demasiado. Revisa tu conexión e inténtalo de nuevo.', {
        code: 'TIMEOUT',
      });
    }
    throw new ApiError('No se pudo conectar con el servidor. ¿Sigue en ejecución?', { code: 'OFFLINE' });
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', forwardAbort);
  }
}

/* -------------------------------- Tarjetas -------------------------------- */

function createPoster(movie, className = 'poster') {
  const holder = el('div', className);

  if (movie.posterUrl) {
    const img = el('img');
    img.src = movie.posterUrl;
    img.alt = `Póster de ${movie.title}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener(
      'error',
      () => {
        holder.replaceChildren(createPosterFallback(movie));
      },
      { once: true },
    );
    holder.append(img);
  } else {
    holder.append(createPosterFallback(movie));
  }

  return holder;
}

function createPosterFallback(movie) {
  const fallback = el('div', 'poster-fallback');
  fallback.append(el('span', null, movie.title));
  return fallback;
}

function createCard(movie) {
  const card = el('button', 'card');
  card.type = 'button';
  card.setAttribute('aria-label', `Ver detalles de ${movie.title}`);

  const poster = createPoster(movie);
  if (movie.rating > 0) {
    poster.append(el('span', 'rating', `★ ${movie.rating.toFixed(1)}`));
  }

  const meta = [movie.year, movie.votes ? `${VOTE_FORMAT.format(movie.votes)} votos` : null]
    .filter(Boolean)
    .join(' · ');

  card.append(poster, el('h3', 'card-title', movie.title), el('p', 'card-meta', meta || 'Sin datos'));
  card.addEventListener('click', () => openDetail(movie.id));
  return card;
}

/* ------------------------------- Esqueletos ------------------------------- */

function createSkeleton() {
  const card = el('div', 'skeleton-card');
  card.setAttribute('aria-hidden', 'true');
  const poster = el('div', 'poster');
  card.append(poster, el('div', 'skeleton-line'), el('div', 'skeleton-line short'));
  return card;
}

function renderSkeletons(count, append) {
  const skeletons = Array.from({ length: count }, createSkeleton);
  if (append) {
    elements.grid.append(...skeletons);
  } else {
    elements.grid.replaceChildren(...skeletons);
  }
}

/* -------------------------------- Estado UI ------------------------------- */

function setBusy(isBusy) {
  elements.grid.setAttribute('aria-busy', String(isBusy));
  elements.loadMore.disabled = isBusy;
}

function clearError() {
  elements.errorBox.hidden = true;
}

const ERROR_COPY = {
  NOT_CONFIGURED: { title: 'Falta la clave de TMDB', retry: false },
  AUTH: { title: 'La clave de TMDB no es válida', retry: false },
  RATE_LIMIT: { title: 'Límite de peticiones alcanzado', retry: true },
  TIMEOUT: { title: 'La conexión está muy lenta', retry: true },
  OFFLINE: { title: 'Sin conexión con el servidor', retry: true },
  NETWORK: { title: 'Sin conexión a TMDB', retry: true },
  MISSING_QUERY: { title: 'Falta la búsqueda', retry: false },
  EMPTY_RESPONSE: { title: 'Respuesta vacía', retry: true },
  BAD_RESPONSE: { title: 'Respuesta inesperada', retry: true },
  UPSTREAM: { title: 'TMDB no está disponible', retry: true },
};

function showError(error) {
  const copy = ERROR_COPY[error.code] || { title: 'Algo salió mal', retry: true };

  let message = error.message;
  if (error.code === 'RATE_LIMIT' && error.retryAfter) {
    message += ` TMDB pide esperar ${error.retryAfter} segundos.`;
  }

  elements.errorTitle.textContent = copy.title;
  elements.errorMessage.textContent = message;
  elements.retryButton.hidden = !copy.retry;
  elements.errorBox.dataset.code = error.code || 'UNKNOWN';
  elements.errorBox.hidden = false;
  elements.statusText.textContent = '';
}

function updateControls() {
  const hasResults = state.movies.length > 0;
  elements.loadMore.hidden = !hasResults || state.page >= state.totalPages;
  elements.emptyState.hidden = state.movies.length > 0 || elements.errorBox.hidden === false;
  elements.hero.hidden = state.query.length > 0;
}

function render() {
  elements.grid.replaceChildren(...state.movies.map(createCard));
  elements.resultsTitle.textContent = state.query ? `Resultados para “${state.query}”` : 'Películas populares';

  if (state.movies.length > 0) {
    const total = state.totalResults ? plural(state.totalResults, 'resultado', 'resultados') : '';
    elements.resultsMeta.textContent = [total, `página ${state.page} de ${state.totalPages}`]
      .filter(Boolean)
      .join(' · ');
    elements.statusText.textContent = plural(state.movies.length, 'película cargada', 'películas cargadas');
  } else {
    elements.resultsMeta.textContent = '';
    elements.statusText.textContent = '';
  }

  if (!state.query) {
    elements.emptyMessage.textContent = 'No hay películas para mostrar en este momento.';
  } else {
    elements.emptyMessage.textContent = 'Prueba con otro título o revisa la ortografía.';
  }

  updateControls();
}

/* ------------------------------- Carga datos ------------------------------ */

async function load(page = 1, { append = false } = {}) {
  const requestId = ++state.requestId;
  state.controller?.abort();
  state.controller = new AbortController();
  state.lastRequest = { page, append };
  state.loading = true;

  clearError();
  renderSkeletons(append ? 6 : 12, append);
  setBusy(true);
  elements.statusText.textContent = state.query ? `Buscando “${state.query}”…` : 'Cargando películas populares…';

  const path = state.query
    ? `/api/movies/search?q=${encodeURIComponent(state.query)}&page=${page}`
    : `/api/movies/popular?page=${page}`;

  try {
    const data = await apiFetch(path, { signal: state.controller.signal });
    if (requestId !== state.requestId) return;

    state.movies = append ? [...state.movies, ...data.movies] : data.movies;
    state.page = data.page;
    state.totalPages = data.totalPages;
    state.totalResults = data.totalResults;
    render();
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (error.name === 'AbortError') return; // otra búsqueda tomó el control

    elements.grid.replaceChildren(...state.movies.map(createCard));
    showError(error);
    updateControls();
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      setBusy(false);
      updateControls();
    }
  }
}

function submitSearch(rawQuery) {
  const query = rawQuery.trim();
  state.query = query;
  elements.input.value = query;
  clearError();
  load(1);
}

/* -------------------------------- Detalle --------------------------------- */

function renderDetailLoading() {
  const wrapper = el('div', 'detail-loading');
  wrapper.append(el('div', 'skeleton-line'), el('div', 'skeleton-line'), el('div', 'skeleton-line short'));
  elements.detailContent.replaceChildren(wrapper);
}

function renderDetail(movie) {
  const fragment = document.createDocumentFragment();

  const hero = el('div', 'detail-hero');
  if (movie.backdropUrl) {
    const backdrop = el('img', 'detail-backdrop');
    backdrop.src = movie.backdropUrl;
    backdrop.alt = '';
    backdrop.loading = 'lazy';
    backdrop.addEventListener(
      'error',
      () => {
        backdrop.remove();
      },
      { once: true },
    );
    hero.append(backdrop);
  }

  const heading = el('div', 'detail-heading');
  const title = el('h2', null, movie.title);
  title.id = 'detail-title';
  const sub = [movie.year, movie.rating > 0 ? `★ ${movie.rating.toFixed(1)}` : null, formatRuntime(movie.runtime)]
    .filter(Boolean)
    .join(' · ');
  heading.append(title, el('p', 'detail-sub', sub));
  hero.append(heading);

  const body = el('div', 'detail-body');
  body.append(createPoster(movie, 'detail-poster'));

  const info = el('div', 'detail-info');
  info.append(el('h3', null, 'Sinopsis'));
  info.append(el('p', null, movie.overview || 'TMDB no tiene una sinopsis en español para esta película.'));

  if (movie.genres.length > 0) {
    const chips = el('ul', 'chips');
    for (const genre of movie.genres) chips.append(el('li', 'chip', genre));
    info.append(chips);
  }

  const facts = el('div', 'facts');
  const addFact = (label, value) => {
    if (!value) return;
    const item = el('span', null, `${label}: `);
    item.append(el('strong', null, value));
    facts.append(item);
  };
  addFact('Dirección', movie.director);
  addFact('Estreno', movie.releaseDate);
  addFact('Votos', movie.votes ? movie.votes.toLocaleString('es') : null);
  if (facts.childElementCount > 0) info.append(facts);

  if (movie.cast.length > 0) {
    info.append(el('h3', null, 'Reparto'));
    const cast = el('ul', 'cast');
    for (const person of movie.cast) {
      const item = el('li', null, person.name);
      if (person.character) item.append(el('span', null, person.character));
      cast.append(item);
    }
    info.append(cast);
  }

  body.append(info);
  fragment.append(hero, body);
  elements.detailContent.replaceChildren(fragment);
  elements.detailContent.scrollTop = 0;
}

function renderDetailError(error) {
  const wrapper = el('div', 'detail-loading');
  wrapper.append(el('h3', null, 'No se pudo cargar el detalle'), el('p', null, error.message));
  elements.detailContent.replaceChildren(wrapper);
}

async function openDetail(id) {
  elements.dialog.showModal();
  renderDetailLoading();
  const token = ++detailRequest;

  try {
    const cached = state.details.get(id);
    if (cached) {
      renderDetail(cached);
      return;
    }

    const movie = await apiFetch(`/api/movies/${id}`);
    state.details.set(id, movie);
    if (token === detailRequest && elements.dialog.open) renderDetail(movie);
  } catch (error) {
    if (token === detailRequest && elements.dialog.open) renderDetailError(error);
  }
}

/* --------------------------------- Arranque ------------------------------- */

function updateConnectionBanner() {
  const online = navigator.onLine;
  elements.offlineBanner.hidden = online;

  // Al recuperar la conexión, si el último error fue de red, reintentamos solos.
  if (online && !state.loading && elements.errorBox.dataset.code === 'OFFLINE') {
    const { page, append } = state.lastRequest;
    clearError();
    load(page, { append });
  }
}

let searchTimer = null;

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  submitSearch(elements.input.value);
});

elements.input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const value = elements.input.value.trim();

  if (value.length === 0) {
    if (state.query !== '') submitSearch('');
    return;
  }

  if (value.length < 2) return;

  searchTimer = setTimeout(() => {
    if (value !== state.query) submitSearch(value);
  }, 500);
});

elements.loadMore.addEventListener('click', () => load(state.page + 1, { append: true }));

elements.retryButton.addEventListener('click', () => {
  const { page, append } = state.lastRequest;
  load(page, { append });
});

elements.detailClose.addEventListener('click', () => elements.dialog.close());

elements.dialog.addEventListener('click', (event) => {
  // Clic en el fondo (fuera del contenido) cierra el modal.
  if (event.target === elements.dialog) elements.dialog.close();
});

window.addEventListener('online', updateConnectionBanner);
window.addEventListener('offline', updateConnectionBanner);

async function init() {
  updateConnectionBanner();
  renderSkeletons(12, false);

  try {
    const status = await apiFetch('/api/status');
    if (!status.configured) {
      elements.setupBanner.hidden = false;
      elements.statusText.textContent = 'Configura TMDB_API_KEY para empezar.';
      elements.grid.replaceChildren();
      state.movies = [];
      updateControls();
      elements.emptyState.hidden = true;
      return;
    }
  } catch {
    // Si /api/status falla, igual intentamos cargar: el error real se mostrará abajo.
  }

  await load(1);
}

init();
