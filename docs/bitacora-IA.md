# Bitácora de programación con IA

**Proyecto:** CineBusca — buscador de películas con la API de TMDB
**Autor:** Ruben Jesus Lira Polanco
**Fecha:** octubre de 2026
**Herramienta de IA:** agente Big Pickle en OpenCode (con acceso al repositorio local)

Esta bitácora registra los prompts reales que usé durante el desarrollo, qué respondió la IA,
si funcionó a la primera y qué tuve que corregir.

---

## 1. Prompts y resultados

### Prompt 1

> "Necesito una aplicación web pequeña que consuma una API externa para una tarea. ¿Qué API gratuita me recomiendas para un buscador de películas y cómo estructuro el proyecto con Node y Express?"

**Respuesta de la IA:** propuso TMDB por su plan gratuito para uso educativo, explicó la
diferencia entre la API Key v3 y el Read Access Token v4, y armó esta estructura:
`server.js`, `lib/` (cliente y mappers), `public/` (frontend), `test/` y `docs/`.

**¿Funcionó a la primera?** Sí, la estructura quedó bien. **Ajuste:** descarté la propuesta
inicial de usar React porque la tarea no lo exige y quería poder explicar cada línea.

### Prompt 2

> "Genera el backend en Express que consulte TMDB sin exponer la clave en el navegador, con .env y .gitignore, y que devuelva errores claros si falta la clave o si TMDB falla."

**Respuesta de la IA:** creó `lib/tmdb.js` con un cliente que inyecta la autenticación,
`AbortSignal.timeout(8000)` y una clase `TmdbError` con códigos propios; `server.js` con
las rutas `/api/movies/*`, caché de 5 minutos y un manejador central de errores.

**¿Funcionó a la primera?** Sí. **Ajuste:** agregué `TMDB_READ_TOKEN` como alternativa a
`TMDB_API_KEY`, porque el token v4 viaja en la cabecera `Authorization` y no en la URL,
que es más seguro.

### Prompt 3

> "Haz el frontend en HTML, CSS y JavaScript puro: buscador, cuadrícula de pósters responsive y un modal con el detalle de la película. Sin frameworks y sin claves en el cliente."

**Respuesta de la IA:** generó `index.html`, `styles.css` y `app.js` con búsqueda con
*debounce* de 500 ms, esqueletos de carga y un `<dialog>` nativo para el detalle.

**¿Funcionó a la primera?** No del todo: el botón "Cargar más" aparecía aunque el JS lo
marcara como oculto (ver sección 2). **Ajuste:** agregué la regla `[hidden] { display: none !important; }`
y volví a probar.

### Prompt 4

> "¿Cómo manejo en el frontend los errores 429, 401 y los timeouts para que el usuario vea mensajes distintos y pueda reintentar?"

**Respuesta de la IA:** propuso un mapa de códigos (`RATE_LIMIT`, `AUTH`, `TIMEOUT`,
`OFFLINE`...) a títulos y mensajes, un `ApiError` propio y un botón "Reintentar" que
repite la última petición guardada.

**¿Funcionó a la primera?** Sí para los mensajes. **Ajuste:** cuando TMDB manda
`Retry-After`, el texto ahora indica cuántos segundos esperar. Lo probé simulando un
`429` con un `fetch` falso desde la consola del navegador.

### Prompt 5

> "Escríbeme pruebas con node:test para el cliente de TMDB y para los endpoints, incluyendo el caso en que no hay clave configurada."

**Respuesta de la IA:** creó 19 pruebas: URL y parámetros, token v4, `429` + `Retry-After`,
`401`, timeout, fallo de red, JSON inválido, contrato de datos, caché, validación de
`page`/`q`/`id` y rutas inexistentes.

**¿Funcionó a la primera?** Casi: una prueba de caché con `ttlMs: 0` podía pasar o fallar
según el milisegundo en que corriera. **Ajuste:** cambié el TTL a `-1` para forzar la
expiración y que la prueba sea determinista.

### Prompt 6

> "Revisa el código y dime qué problemas de seguridad o accesibilidad tiene antes de subirlo a GitHub."

**Respuesta de la IA:** añadió cabeceras de seguridad y una CSP que solo permite imágenes
de `image.tmdb.org`; confirmó que los datos de la API se insertan con `textContent` y no
con `innerHTML`; agregó `aria-live`, enlace "saltar al contenido" y foco visible.

**¿Funcionó a la primera?** Sí. **Ajuste:** tuve que verificar a mano que la CSP no bloqueara
el CSS ni el JS (ambos son archivos locales, así que no hay estilos ni scripts inline).

---

## 2. Error de la IA que detecté

**El botón "Cargar más" no se ocultaba.**

El JavaScript hacía lo correcto:

```js
elements.loadMore.hidden = !hasResults || state.page >= state.totalPages;
```

Pero el CSS de la IA tenía:

```css
.btn {
  display: inline-flex;
  /* ... */
}
```

El atributo `hidden` aplica `display: none` desde la hoja del navegador, y **cualquier regla
de autor con `display` la sobrescribe**. Resultado: el botón seguía visible, aunque en el DOM
tuviera `hidden="true"`, y al pulsarlo se pedía una página que no existía.

**Cómo lo resolví:** agregué una regla explícita y la puse antes que el resto de estilos:

```css
[hidden] {
  display: none !important;
}
```

Después lo comprobé en el navegador: con una búsqueda de un solo resultado, el botón ya no
aparece. Es un error silencioso porque el HTML se ve "correcto"; solo se detecta probando la
interfaz, no leyendo el código.

**Segundo error, menor:** el contador decía "1 resultados" y "1 películas cargadas". Lo vi al
probar la búsqueda "dune" y agregué una función `plural()` para singular/plural.

---

## 3. Qué aprendí y qué haría distinto

- **Probar siempre en el navegador, no solo leer el código.** Los dos errores anteriores
  compilaban y pasaban las pruebas del backend, pero se veían al usar la app.
- **Pedir los casos de error desde el principio.** Cuando el prompt decía "maneja errores"
  sin detallar, la IA resolvía solo el caso feliz. Al enumerar "sin conexión, 429, 401,
  timeout y respuesta vacía", el resultado fue mucho más completo.
- **Fijar restricciones explícitas.** "Sin frameworks", "sin claves en el cliente" y
  "explícame cada archivo" evitaron propuestas que no podía defender en la demo.
- **No aceptar la primera respuesta.** La IA acierta en la estructura, pero los detalles
  (CSS, plurales, condiciones de carrera) hay que revisarlos.
- **La clave nunca se toca en el chat.** Usé `.env` desde el primer momento y verifiqué con
  `git status` que el archivo no estuviera en el repositorio.

Para la próxima vez pediría desde el inicio el **contrato de la API** (qué campos devuelve
cada endpoint), escribiría las pruebas antes del frontend y separaría los prompts por
archivo, para que cada respuesta sea más fácil de revisar.
