'use strict';

require('dotenv').config();

const path = require('node:path');
const express = require('express');
const { createTmdbClient, TmdbError } = require('./lib/tmdb');
const { mapMovieList, mapMovieDetail } = require('./lib/mappers');

const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const CACHE_MAX_ENTRIES = 200;
const TMDB_LANGUAGE = process.env.TMDB_LANGUAGE || 'es-ES';

/**
 * Caché en memoria muy simple: evita repetir la misma petición a TMDB
 * (por ejemplo al volver a una búsqueda) y ayuda a no gastar el límite.
 */
function createCache({ ttlMs = CACHE_TTL_MS, maxEntries = CACHE_MAX_ENTRIES } = {}) {
  const store = new Map();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return undefined;
      }
      // Reinsertamos para conservar el orden de uso (LRU aproximado).
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      if (store.size >= maxEntries) {
        const oldestKey = store.keys().next().value;
        store.delete(oldestKey);
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    get size() {
      return store.size;
    },
  };
}

function parsePage(value) {
  if (value === undefined) return 1;
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > 500) return null;
  return page;
}

function createApp({ client, cache = createCache() } = {}) {
  const tmdb =
    client ||
    createTmdbClient({
      apiKey: process.env.TMDB_API_KEY,
      readToken: process.env.TMDB_READ_TOKEN,
    });

  const app = express();
  app.disable('x-powered-by');

  // Cabeceras de seguridad. La CSP permite imágenes de TMDB y nada de scripts inline.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' https://image.tmdb.org data:",
        "style-src 'self'",
        "script-src 'self'",
        "connect-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
    next();
  });

  /**
   * Envuelve una petición a TMDB con caché y traducción de errores.
   * @param {string} cacheKey
   * @param {() => Promise<object>} loader
   */
  async function cached(cacheKey, loader) {
    const cachedValue = cache.get(cacheKey);
    if (cachedValue !== undefined) return cachedValue;
    const value = await loader();
    cache.set(cacheKey, value);
    return value;
  }

  /** GET /api/status -> el frontend sabe si hay clave configurada. */
  app.get('/api/status', (req, res) => {
    res.json({
      service: 'cinebusca',
      configured: tmdb.configured,
      language: TMDB_LANGUAGE,
    });
  });

  /** GET /api/movies/popular?page=1 */
  app.get('/api/movies/popular', async (req, res, next) => {
    try {
      const page = parsePage(req.query.page);
      if (page === null) {
        return res.status(400).json({
          error: { code: 'INVALID_PAGE', message: 'La página debe ser un número entre 1 y 500.' },
        });
      }

      const data = await cached(`popular:${page}`, () =>
        tmdb.get('/movie/popular', { page, language: TMDB_LANGUAGE }),
      );

      res.json(mapMovieList(data));
    } catch (error) {
      next(error);
    }
  });

  /** GET /api/movies/search?q=matrix&page=1 */
  app.get('/api/movies/search', async (req, res, next) => {
    try {
      const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (rawQuery.length === 0) {
        return res.status(400).json({
          error: { code: 'MISSING_QUERY', message: 'Escribe el título de una película para buscar.' },
        });
      }
      if (rawQuery.length > 100) {
        return res.status(400).json({
          error: { code: 'QUERY_TOO_LONG', message: 'La búsqueda no puede superar los 100 caracteres.' },
        });
      }

      const page = parsePage(req.query.page);
      if (page === null) {
        return res.status(400).json({
          error: { code: 'INVALID_PAGE', message: 'La página debe ser un número entre 1 y 500.' },
        });
      }

      const data = await cached(`search:${rawQuery.toLowerCase()}:${page}`, () =>
        tmdb.get('/search/movie', {
          query: rawQuery,
          page,
          language: TMDB_LANGUAGE,
          include_adult: 'false',
        }),
      );

      res.json({ ...mapMovieList(data), query: rawQuery });
    } catch (error) {
      next(error);
    }
  });

  /** GET /api/movies/:id -> detalle con reparto y dirección. */
  app.get('/api/movies/:id', async (req, res, next) => {
    try {
      if (!/^\d{1,10}$/.test(req.params.id)) {
        return res.status(400).json({
          error: { code: 'INVALID_ID', message: 'El identificador de la película no es válido.' },
        });
      }

      const id = Number(req.params.id);
      const data = await cached(`movie:${id}`, () =>
        tmdb.get(`/movie/${id}`, { language: TMDB_LANGUAGE, append_to_response: 'credits' }),
      );

      const movie = mapMovieDetail(data);
      if (!movie) {
        return res.status(502).json({
          error: { code: 'BAD_RESPONSE', message: 'TMDB devolvió datos incompletos para esta película.' },
        });
      }

      res.json(movie);
    } catch (error) {
      next(error);
    }
  });

  // Archivos estáticos del frontend.
  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: '1h',
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );

  // 404: JSON para la API, página simple para el resto.
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Ese recurso de la API no existe.' },
      });
    }
    res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'), (error) => {
      if (error) res.status(404).type('text').send('404 - No encontrado');
    });
  });

  // Manejador central de errores: cualquier fallo termina en un JSON claro.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error instanceof TmdbError) {
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      return res.status(error.status).json({
        error: { code: error.code, message: error.message, retryAfter: error.retryAfter },
      });
    }

    console.error('[cinebusca] Error inesperado:', error);
    res.status(500).json({
      error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado en el servidor.' },
    });
  });

  return app;
}

function start() {
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();

  const server = app.listen(port, () => {
    console.log(`CineBusca disponible en http://localhost:${port}`);
    if (!process.env.TMDB_API_KEY && !process.env.TMDB_READ_TOKEN) {
      console.warn('Aviso: no hay TMDB_API_KEY en .env. La interfaz mostrará el modo configuración.');
    }
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
}

if (require.main === module) {
  start();
}

module.exports = { createApp, createCache, parsePage };
