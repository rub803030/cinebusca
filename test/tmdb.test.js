'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTmdbClient, TmdbError } = require('../lib/tmdb');

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('sin clave configurada lanza NOT_CONFIGURED antes de tocar la red', async () => {
  let called = false;
  const client = createTmdbClient({
    fetchImpl: async () => {
      called = true;
      return jsonResponse({});
    },
  });

  assert.equal(client.configured, false);
  await assert.rejects(client.get('/movie/popular'), (error) => {
    assert.ok(error instanceof TmdbError);
    assert.equal(error.code, 'NOT_CONFIGURED');
    assert.equal(error.status, 503);
    return true;
  });
  assert.equal(called, false);
});

test('con TMDB_API_KEY agrega api_key y los parámetros a la URL', async () => {
  let receivedUrl;
  const client = createTmdbClient({
    apiKey: 'clave-de-prueba',
    fetchImpl: async (url) => {
      receivedUrl = url;
      return jsonResponse({ page: 1, results: [] });
    },
  });

  const data = await client.get('/movie/popular', { page: 2, language: 'es-ES', empty: undefined });

  assert.equal(data.page, 1);
  assert.equal(receivedUrl.pathname, '/3/movie/popular');
  assert.equal(receivedUrl.searchParams.get('page'), '2');
  assert.equal(receivedUrl.searchParams.get('language'), 'es-ES');
  assert.equal(receivedUrl.searchParams.get('api_key'), 'clave-de-prueba');
  assert.equal(receivedUrl.searchParams.has('empty'), false);
});

test('con TMDB_READ_TOKEN usa la cabecera Authorization y no expone la clave en la URL', async () => {
  let received;
  const client = createTmdbClient({
    readToken: 'token-v4',
    fetchImpl: async (url, options) => {
      received = { url, options };
      return jsonResponse({ page: 1, results: [] });
    },
  });

  await client.get('/movie/603');

  assert.equal(received.options.headers.authorization, 'Bearer token-v4');
  assert.equal(received.url.searchParams.has('api_key'), false);
});

test('un 429 se convierte en RATE_LIMIT con retryAfter', async () => {
  const client = createTmdbClient({
    apiKey: 'x',
    fetchImpl: async () => jsonResponse({}, { status: 429, headers: { 'retry-after': '7' } }),
  });

  await assert.rejects(client.get('/movie/popular'), (error) => {
    assert.equal(error.code, 'RATE_LIMIT');
    assert.equal(error.status, 429);
    assert.equal(error.retryAfter, 7);
    return true;
  });
});

test('un 401 se convierte en AUTH con estado 502', async () => {
  const client = createTmdbClient({
    apiKey: 'invalida',
    fetchImpl: async () => jsonResponse({ status_message: 'Invalid API key' }, { status: 401 }),
  });

  await assert.rejects(client.get('/movie/popular'), (error) => {
    assert.equal(error.code, 'AUTH');
    assert.equal(error.status, 502);
    return true;
  });
});

test('un fallo de red se convierte en NETWORK', async () => {
  const client = createTmdbClient({
    apiKey: 'x',
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });

  await assert.rejects(client.get('/movie/popular'), (error) => {
    assert.equal(error.code, 'NETWORK');
    assert.equal(error.status, 503);
    return true;
  });
});

test('un timeout se convierte en TIMEOUT', async () => {
  const client = createTmdbClient({
    apiKey: 'x',
    fetchImpl: async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    },
  });

  await assert.rejects(client.get('/movie/popular'), (error) => {
    assert.equal(error.code, 'TIMEOUT');
    assert.equal(error.status, 504);
    return true;
  });
});

test('una respuesta que no es JSON se convierte en BAD_RESPONSE', async () => {
  const client = createTmdbClient({
    apiKey: 'x',
    fetchImpl: async () => new Response('<html>error</html>', { status: 200 }),
  });

  await assert.rejects(client.get('/movie/popular'), (error) => {
    assert.equal(error.code, 'BAD_RESPONSE');
    return true;
  });
});
