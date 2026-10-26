'use strict';

/**
 * Cliente mínimo para la API de TMDB (The Movie Database).
 *
 * La clave vive SOLO aquí, en el servidor. El navegador nunca la recibe:
 * el frontend habla con /api/* y este módulo agrega la autenticación.
 */

const DEFAULT_BASE_URL = 'https://api.themoviedb.org/3';
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Error con un código propio para que el frontend pueda reaccionar
 * de forma distinta según el problema (sin conexión, límite, clave inválida...).
 */
class TmdbError extends Error {
  /**
   * @param {string} code Código interno: NOT_CONFIGURED | TIMEOUT | NETWORK | RATE_LIMIT | AUTH | UPSTREAM | BAD_RESPONSE | EMPTY_RESPONSE
   * @param {string} message Mensaje en español para mostrar al usuario.
   * @param {number} status Código HTTP que devolverá nuestra propia API.
   * @param {number|null} retryAfter Segundos de espera si TMDB aplicó un límite.
   */
  constructor(code, message, status, retryAfter = null) {
    super(message);
    this.name = 'TmdbError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function createTmdbClient({
  apiKey,
  readToken,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const configured = Boolean(apiKey || readToken);

  /**
   * Hace una petición GET a TMDB y devuelve el JSON ya validado.
   *
   * @param {string} pathname Ruta relativa, por ejemplo '/movie/popular'.
   * @param {Record<string, string|number|undefined>} params Query string.
   * @returns {Promise<Record<string, unknown>>}
   */
  async function get(pathname, params = {}) {
    if (!configured) {
      throw new TmdbError(
        'NOT_CONFIGURED',
        'Falta la clave de TMDB. Crea un archivo .env con TMDB_API_KEY antes de iniciar la app.',
        503,
      );
    }

    const url = new URL(`${baseUrl}${pathname}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    const headers = { accept: 'application/json' };
    if (readToken) {
      // Token de lectura v4 (recomendado): va en la cabecera, no en la URL.
      headers.authorization = `Bearer ${readToken}`;
    } else {
      // Clave v3: TMDB la espera en la query string.
      url.searchParams.set('api_key', apiKey);
    }

    let response;
    try {
      response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new TmdbError(
          'TIMEOUT',
          'TMDB tardó demasiado en responder. Revisa tu conexión e inténtalo de nuevo.',
          504,
        );
      }
      throw new TmdbError(
        'NETWORK',
        'No se pudo conectar con TMDB. Verifica tu conexión a internet.',
        503,
      );
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new TmdbError(
        'RATE_LIMIT',
        'Se alcanzó el límite de peticiones a TMDB. Espera unos segundos y vuelve a intentar.',
        429,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new TmdbError(
        'AUTH',
        'La clave de TMDB no es válida o no tiene permisos. Revisa el archivo .env.',
        502,
      );
    }

    if (!response.ok) {
      throw new TmdbError(
        'UPSTREAM',
        `TMDB respondió con un error (${response.status}). Inténtalo más tarde.`,
        502,
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new TmdbError(
        'BAD_RESPONSE',
        'TMDB devolvió una respuesta que no se pudo interpretar.',
        502,
      );
    }

    // Una respuesta vacía es un caso real: la tratamos como error explícito
    // para que la interfaz no se quede "cargando" para siempre.
    if (!data || typeof data !== 'object') {
      throw new TmdbError('EMPTY_RESPONSE', 'TMDB devolvió una respuesta vacía.', 502);
    }

    return data;
  }

  return { get, configured };
}

module.exports = {
  TmdbError,
  createTmdbClient,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
};
