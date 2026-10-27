'use strict';

/**
 * Normaliza las respuestas de TMDB a un contrato pequeño y estable.
 * Así el frontend no depende de campos internos de TMDB y el JSON viaja más liviano.
 */

const IMAGE_BASE = 'https://image.tmdb.org/t/p';

function imageUrl(path, size = 'w500') {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

function mapMovie(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id,
    title: raw.title || raw.name || 'Sin título',
    originalTitle: raw.original_title || raw.original_name || null,
    year: raw.release_date ? String(raw.release_date).slice(0, 4) : null,
    releaseDate: raw.release_date || null,
    overview: raw.overview || '',
    posterUrl: imageUrl(raw.poster_path, 'w500'),
    backdropUrl: imageUrl(raw.backdrop_path, 'w780'),
    rating: typeof raw.vote_average === 'number' ? Math.round(raw.vote_average * 10) / 10 : 0,
    votes: raw.vote_count || 0,
  };
}

function mapMovieList(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return {
    page: Number(payload?.page) || 1,
    totalPages: Math.min(Number(payload?.total_pages) || 1, 500),
    totalResults: Number(payload?.total_results) || 0,
    movies: results.map(mapMovie).filter(Boolean),
  };
}

function mapMovieDetail(raw) {
  const base = mapMovie(raw);
  if (!base) return null;

  const crew = Array.isArray(raw.credits?.crew) ? raw.credits.crew : [];
  const cast = Array.isArray(raw.credits?.cast) ? raw.credits.cast : [];

  return {
    ...base,
    tagline: raw.tagline || '',
    runtime: Number(raw.runtime) || 0,
    status: raw.status || '',
    genres: Array.isArray(raw.genres) ? raw.genres.map((genre) => genre.name) : [],
    director: crew.find((person) => person.job === 'Director')?.name || null,
    cast: cast.slice(0, 6).map((person) => ({
      name: person.name,
      character: person.character || '',
    })),
  };
}

module.exports = {
  IMAGE_BASE,
  imageUrl,
  mapMovie,
  mapMovieList,
  mapMovieDetail,
};
