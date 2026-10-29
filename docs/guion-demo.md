# Guion para la demostración (3 minutos)

Objetivo: mostrar que la app funciona, que maneja errores y que puedes explicar el código.

## Antes de grabar

1. `npm install` (solo la primera vez).
2. `.env` con `TMDB_API_KEY` válida.
3. `npm start` y abrir <http://localhost:3000>.
4. Tener abierta una pestaña con el repositorio en GitHub.
5. Cerrar pestañas y notificaciones que no se vayan a usar.

## 0:00 – 0:20 · Presentación

> "Hola, soy Ruben Lira. Presento CineBusca, una app web que consume la API de TMDB para
> buscar películas. Está hecha con Node y Express en el backend y HTML, CSS y JavaScript
> en el frontend, sin frameworks."

## 0:20 – 0:45 · Cómo funciona

> "El navegador nunca ve la clave de TMDB. El frontend llama a mi propia API en `/api/*`,
> y el servidor es el que agrega la autenticación. Además normaliza la respuesta de TMDB,
> la guarda en caché cinco minutos y traduce los errores a códigos claros."

Mostrar en el README la tabla de endpoints. Señalar `.env.example` y decir que `.env` está
en `.gitignore`.

## 0:45 – 1:40 · Demostración

1. Abrir la app: se ven las películas populares.
2. Buscar "matrix": la cuadrícula se actualiza sola.
3. Abrir una película: sinopsis, géneros, dirección, reparto y duración.
4. Cerrar con `Esc`.
5. Buscar algo que no exista (por ejemplo "asdfgh"): mostrar el estado vacío.
6. **Error de red:** abrir DevTools → Network → "Offline", buscar de nuevo y mostrar el
   mensaje de error y el botón "Reintentar". Volver a "Online" y reintentar.

> "El manejo de errores distingue sin conexión, timeout, límite de peticiones y clave
> inválida. Cada uno tiene su mensaje y, cuando tiene sentido, un botón para reintentar."

## 1:40 – 2:30 · Una parte del código

Abrir `server.js` en la ruta de búsqueda y explicar en voz alta:

- Se valida `q` y `page` **antes** de llamar a TMDB.
- Se usa una clave de caché `search:<consulta>:<página>`.
- `mapMovieList` convierte la respuesta de TMDB al contrato propio (`title`, `year`,
  `posterUrl`, `rating`).
- Cualquier error cae en el manejador central y se devuelve como
  `{ error: { code, message } }`.

Opcional: mostrar `lib/tmdb.js` y explicar `AbortSignal.timeout(8000)` y el caso `429`.

## 2:30 – 3:00 · Cierre

> "El proyecto tiene 19 pruebas automatizadas con `node:test` que cubren los errores
> principales. El código y la bitácora están en el repositorio. Gracias."

## Frases de respaldo si algo falla

- Si no hay internet: "La app está mostrando justamente el estado de error de red que
  implementé; el mensaje viene del código que acabo de mostrar."
- Si TMDB no responde: "La API tiene un timeout de 8 segundos y luego muestra el error;
  podemos reintentar."
- Si la clave falla: "Este es el caso `AUTH`: la app detecta que la clave no es válida y lo
  indica sin romperse."

## Errores que se pueden provocar a propósito

| Qué hacer                              | Qué debería verse                          |
| -------------------------------------- | ------------------------------------------ |
| DevTools → Network → Offline           | Aviso "Sin conexión" + error con reintento |
| Poner una clave falsa en `.env`        | "La clave de TMDB no es válida"            |
| Buscar `asdfgh`                        | Estado vacío con sugerencia                |
| Abrir `/api/movies/abc` en el navegador | JSON `400 INVALID_ID`                     |
| Abrir `/api/no-existe`                  | JSON `404 NOT_FOUND`                       |
