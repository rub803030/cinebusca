'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, parsePage, createCache } = require('../server');
const { TmdbError } = require('../lib/tmdb');

const POPULAR_PAYLOAD = {
  page: 1,
  total_pages: 3,
  total_results: 60,
  results: [
    {
      id: 603,
      title: 'Matrix',
      release_date: '1999-03-30',
      overview: 'Un hacker descubre la verdad.',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      vote_average: 8.221,
      vote_count: 24000,
      original_title: 'The Matrix',
    },
    null,
  ],
};

const DETAIL_PAYLOAD = {
  id: 603,
  title: 'Matrix',
  release_date: '1999-03-30',
  runtime: 136,
  genres: [{ id: 1, name: 'Acción' }],
  tagline: 'La realidad es una ilusión.',
  credits: {
    crew: [{ job: 'Director', name: 'Lana Wachowski' }],
    cast: [{ name: 'Keanu Reeves', character: 'Neo' }],
  },
};

function fakeClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    configured: true,
    async get(path, params) {
      calls.push({ path, params });
      if (path === '/movie/popular') return POPULAR_PAYLOAD;
      if (path === '/search/movie') return { ...POPULAR_PAYLOAD, page: 2 };
      if (path.startsWith('/movie/')) return DETAIL_PAYLOAD;
      throw new TmdbError('NOT_FOUND', 'No encontrado', 404);
    },
    ...overrides,
  };
}

async function startServer(client) {
  const app = createApp({ client });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
    async getJson(path) {
      const response = await fetch(`${baseUrl}${path}`);
      const body = await response.json();
      return { response, body };
    },
  };
}

test('parsePage valida el rango permitido por TMDB', () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage('2'), 2);
  assert.equal(parsePage('0'), null);
  assert.equal(parsePage('501'), null);
  assert.equal(parsePage('abc'), null);
  assert.equal(parsePage('1.5'), null);
});

test('la caché respeta el TTL y el tamaño máximo', () => {
  const cache = createCache({ ttlMs: -1, maxEntries: 2 });
  cache.set('a', 1);
  assert.equal(cache.size, 1);
  assert.equal(cache.get('a'), undefined); // TTL 0: ya expiró

  const cache2 = createCache({ maxEntries: 2 });
  cache2.set('a', 1);
  cache2.set('b', 2);
  cache2.set('c', 3);
  assert.equal(cache2.size, 2);
  assert.equal(cache2.get('a'), undefined); // se descartó la entrada más antigua
  assert.equal(cache2.get('c'), 3);
});

test('GET /api/movies/popular devuelve el contrato normalizado', async () => {
  const server = await startServer(fakeClient());
  try {
    const { response, body } = await server.getJson('/api/movies/popular');

    assert.equal(response.status, 200);
    assert.equal(body.page, 1);
    assert.equal(body.totalPages, 3);
    assert.equal(body.movies.length, 1); // el elemento null se descarta
    assert.deepEqual(body.movies[0], {
      id: 603,
      title: 'Matrix',
      originalTitle: 'The Matrix',
      year: '1999',
      releaseDate: '1999-03-30',
      overview: 'Un hacker descubre la verdad.',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w780/backdrop.jpg',
      rating: 8.2,
      votes: 24000,
    });
  } finally {
    await server.close();
  }
});

test('la segunda petición idéntica se sirve desde la caché', async () => {
  const client = fakeClient();
  const server = await startServer(client);
  try {
    await server.getJson('/api/movies/popular');
    await server.getJson('/api/movies/popular');
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].params.language, 'es-ES');
  } finally {
    await server.close();
  }
});

test('GET /api/movies/search exige el parámetro q', async () => {
  const server = await startServer(fakeClient());
  try {
    const { response, body } = await server.getJson('/api/movies/search');
    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'MISSING_QUERY');
  } finally {
    await server.close();
  }
});

test('GET /api/movies/search recorta espacios y busca', async () => {
  const client = fakeClient();
  const server = await startServer(client);
  try {
    const { response, body } = await server.getJson('/api/movies/search?q=%20matrix%20');
    assert.equal(response.status, 200);
    assert.equal(body.query, 'matrix');
    assert.equal(client.calls[0].params.query, 'matrix');
  } finally {
    await server.close();
  }
});

test('GET /api/movies/:id devuelve el detalle con dirección y reparto', async () => {
  const server = await startServer(fakeClient());
  try {
    const { response, body } = await server.getJson('/api/movies/603');
    assert.equal(response.status, 200);
    assert.equal(body.runtime, 136);
    assert.equal(body.director, 'Lana Wachowski');
    assert.deepEqual(body.genres, ['Acción']);
    assert.deepEqual(body.cast, [{ name: 'Keanu Reeves', character: 'Neo' }]);
  } finally {
    await server.close();
  }
});

test('GET /api/movies/:id rechaza identificadores inválidos', async () => {
  const server = await startServer(fakeClient());
  try {
    const { response, body } = await server.getJson('/api/movies/abc');
    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_ID');
  } finally {
    await server.close();
  }
});

test('un error de TMDB se traduce a nuestro JSON de error', async () => {
  const client = fakeClient({
    async get() {
      throw new TmdbError('RATE_LIMIT', 'Demasiadas peticiones', 429, 15);
    },
  });
  const server = await startServer(client);
  try {
    const response = await fetch(`${server.baseUrl}/api/movies/popular`);
    const body = await response.json();
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '15');
    assert.equal(body.error.code, 'RATE_LIMIT');
    assert.equal(body.error.retryAfter, 15);
  } finally {
    await server.close();
  }
});

test('una ruta /api desconocida responde 404 en JSON', async () => {
  const server = await startServer(fakeClient());
  try {
    const { response, body } = await server.getJson('/api/no-existe');
    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  } finally {
    await server.close();
  }
});

test('sin clave configurada la API responde 503 NOT_CONFIGURED', async () => {
  const client = fakeClient({
    configured: false,
    async get() {
      throw new TmdbError('NOT_CONFIGURED', 'Falta la clave', 503);
    },
  });
  const server = await startServer(client);
  try {
    const status = await server.getJson('/api/status');
    assert.equal(status.body.configured, false);

    const { response, body } = await server.getJson('/api/movies/popular');
    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'NOT_CONFIGURED');
  } finally {
    await server.close();
  }
});
