# CineBusca 🎬

Aplicación web pequeña que consume la API de **TMDB (The Movie Database)** para buscar
películas, ver las más populares y consultar el detalle de cada una (sinopsis, reparto,
dirección, duración y puntuación).

La clave de la API vive **solo en el servidor**: el navegador habla con una API propia
(`/api/*`) que agrega la autenticación, normaliza los datos y traduce los errores.

> Proyecto académico. Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.

---

## Características

- Búsqueda por título con resultados en vivo (debounce de 500 ms) y paginación.
- Cuadrícula responsive de pósters con puntuación y año.
- Modal de detalle con sinopsis en español, géneros, dirección, reparto y duración.
- **Manejo de errores explícito**: sin conexión, timeout, respuesta vacía, clave inválida,
  límite de peticiones (`429`) y errores de TMDB. Cada uno con su propio mensaje y botón de reintento.
- Estado vacío cuando una búsqueda no tiene resultados.
- Caché en memoria de 5 minutos para no repetir peticiones idénticas.
- Accesibilidad: navegación por teclado, `aria-live` para estados, modal nativo `<dialog>`,
  enlace "saltar al contenido" y foco visible.
- Pruebas automatizadas con el runner nativo de Node (`node:test`).

## Demo

- Repositorio: <https://github.com/rub803030/cinebusca>
- Perfil: <https://github.com/rub803030>
- Video de la demostración (máx. 3 min): _pendiente de agregar el enlace_

## Tecnologías

| Capa      | Tecnología                                  |
| --------- | ------------------------------------------- |
| Backend   | Node.js 18+, Express 4, dotenv              |
| Frontend  | HTML5, CSS3, JavaScript moderno (sin frameworks) |
| Datos     | API de TMDB v3                              |
| Pruebas   | `node:test` + `node:assert`                 |

## Requisitos

- Node.js 18 o superior (probado con Node 22+).
- Una clave **gratuita** de TMDB.

## Instalación y ejecución

### 1. Obtener la clave de TMDB

1. Crea una cuenta en <https://www.themoviedb.org/signup>.
2. Entra a **Configuración → API** (<https://www.themoviedb.org/settings/api>).
3. Solicita una clave para uso personal/educativo.
4. Copia la **API Key (v3 auth)** o el **Read Access Token (v4)**.

### 2. Clonar e instalar

```bash
git clone https://github.com/rub803030/cinebusca.git
cd cinebusca
npm install
```

En Windows PowerShell, `cd cinebusca` funciona igual.

### 3. Configurar las variables de entorno

Copia el archivo de ejemplo y completa tu clave:

```bash
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Edita `.env`:

```env
TMDB_API_KEY=tu_clave_aqui
```

O bien, si usas el token v4 (recomendado, viaja en cabecera y no en la URL):

```env
TMDB_READ_TOKEN=tu_token_v4_aqui
```

> El archivo `.env` está en `.gitignore`: **nunca** se sube al repositorio.

### 4. Ejecutar

```bash
npm start
```

Abre <http://localhost:3000>. Para desarrollo con recarga automática:

```bash
npm run dev
```

Si falta la clave, la app **no se rompe**: muestra un aviso de configuración y la API
responde `503 NOT_CONFIGURED` con un mensaje claro.

## Variables de entorno

| Variable          | Obligatoria | Descripción                                              |
| ----------------- | ----------- | -------------------------------------------------------- |
| `TMDB_API_KEY`    | Sí\*        | API Key v3 de TMDB.                                      |
| `TMDB_READ_TOKEN` | Sí\*        | Token de lectura v4. Tiene prioridad sobre `TMDB_API_KEY`. |
| `PORT`            | No          | Puerto del servidor. Por defecto `3000`.                 |
| `TMDB_LANGUAGE`   | No          | Idioma de los datos. Por defecto `es-ES`.                |

\* Basta con una de las dos credenciales.

## Scripts

| Comando         | Descripción                            |
| --------------- | -------------------------------------- |
| `npm start`     | Inicia el servidor.                    |
| `npm run dev`   | Inicia con recarga automática.         |
| `npm test`      | Ejecuta las pruebas (`node --test`).   |

## Estructura del proyecto

```text
cinebusca/
├── server.js              # Express: rutas /api, caché, seguridad y manejo de errores
├── lib/
│   ├── tmdb.js            # Cliente de TMDB: autenticación, timeout y errores propios
│   └── mappers.js         # Normaliza la respuesta de TMDB a un contrato estable
├── public/
│   ├── index.html         # Interfaz
│   ├── styles.css         # Tema oscuro responsive
│   ├── app.js             # Lógica del frontend (fetch, estados, modal)
│   ├── 404.html
│   └── favicon.svg
├── test/
│   ├── tmdb.test.js       # Pruebas del cliente (429, 401, timeout, red, JSON inválido)
│   └── server.test.js     # Pruebas de endpoints, caché y códigos de error
├── docs/
│   ├── bitacora-IA.md     # Bitácora de programación con IA
│   └── entrega.md         # Checklist de entregables
├── .env.example
├── .gitignore
└── package.json
```

## API interna

| Método | Ruta                        | Descripción                                  |
| ------ | --------------------------- | -------------------------------------------- |
| GET    | `/api/status`               | Indica si hay credenciales configuradas.     |
| GET    | `/api/movies/popular`       | Películas populares. Acepta `?page=1..500`.  |
| GET    | `/api/movies/search?q=...`  | Busca por título. Acepta `q` y `page`.       |
| GET    | `/api/movies/:id`           | Detalle con reparto, dirección y géneros.    |

Ejemplo de respuesta de `/api/movies/popular`:

```json
{
  "page": 1,
  "totalPages": 500,
  "totalResults": 10000,
  "movies": [
    {
      "id": 603,
      "title": "Matrix",
      "year": "1999",
      "posterUrl": "https://image.tmdb.org/t/p/w500/....jpg",
      "rating": 8.2,
      "votes": 26450
    }
  ]
}
```

## Manejo de errores

Cada fallo se traduce a un código estable que el frontend convierte en un mensaje distinto:

| Código           | HTTP | Cuándo ocurre                             | Qué ve el usuario                         |
| ---------------- | ---- | ----------------------------------------- | ----------------------------------------- |
| `NOT_CONFIGURED` | 503  | No hay clave en `.env`                    | Aviso para configurar `.env`              |
| `AUTH`           | 502  | TMDB rechaza la clave (401/403)           | "La clave de TMDB no es válida"           |
| `RATE_LIMIT`     | 429  | TMDB devuelve 429                         | Mensaje + segundos de espera y reintento  |
| `NETWORK`        | 503  | Falla la conexión con TMDB                | "Sin conexión a TMDB" + reintento         |
| `TIMEOUT`        | 504  | TMDB tarda más de 8 s                     | "La conexión está muy lenta" + reintento  |
| `BAD_RESPONSE`   | 502  | TMDB responde algo que no es JSON         | "Respuesta inesperada" + reintento        |
| `EMPTY_RESPONSE` | 502  | TMDB responde vacío                       | "Respuesta vacía" + reintento             |
| `MISSING_QUERY`  | 400  | Búsqueda sin `q`                          | "Falta la búsqueda"                       |
| `INVALID_ID`     | 400  | `:id` no numérico                         | "Identificador no válido"                 |
| `NOT_FOUND`      | 404  | Ruta `/api/*` inexistente                 | JSON de error                             |

Además, el frontend:

- Detecta `navigator.onLine` y muestra un aviso de "sin conexión".
- Ignora respuestas de búsquedas antiguas (usa un `requestId`) y cancela la anterior.
- Aplica un timeout de 10 s a sus propias peticiones.

## Pruebas

```bash
npm test
```

Cubren, entre otras cosas: falta de configuración, construcción de la URL, uso del token v4,
`429` con `Retry-After`, `401`, timeout, fallo de red, JSON inválido, contrato de datos,
caché, validación de parámetros y rutas inexistentes.

Resultado esperado: **19 pruebas aprobadas**.

## Seguridad

- La clave de TMDB **nunca** llega al navegador: solo el servidor la usa.
- `.env` está en `.gitignore`; el repo incluye únicamente `.env.example`.
- Cabeceras de seguridad y CSP que solo permiten imágenes de `image.tmdb.org`.
- Los datos de la API se insertan con `textContent`/`createElement`, no con `innerHTML`.
- Validación de `page`, `q` e `id` antes de llamar a TMDB.
- Límite de peticiones propio del lado de TMDB mitigado con caché de 5 minutos.

## Declaración de uso de IA

En cumplimiento con la actividad, se declara el uso de herramientas de IA:

| Herramienta | Para qué se usó |
| ----------- | --------------- |
| **Big Pickle (agente de OpenCode)** | Generar el andamiaje del proyecto, el backend en Express, el cliente de TMDB, el frontend (HTML/CSS/JS), las pruebas automatizadas y esta documentación. También para revisar el manejo de errores y la accesibilidad. |
| **Documentación oficial de TMDB y de Express** | Verificar el formato de autenticación (v3/v4), los códigos de error y la atribución requerida. |

Partes hechas sin ayuda de IA:

- La elección del tema (películas), del stack (Node + Express + JS puro) y del alcance de la app.
- La creación de la cuenta de TMDB y la obtención de la clave (uso de variables de entorno).
- La revisión línea por línea del código, la ejecución de las pruebas y las correcciones
  anotadas en la bitácora.
- La grabación de la demostración y la verificación del repositorio antes de entregar.

La bitácora completa, con los prompts y los errores encontrados, está en
[`docs/bitacora-IA.md`](docs/bitacora-IA.md).

## Autor

**Ruben Jesus Lira Polanco** · [github.com/rub803030](https://github.com/rub803030)

## Créditos

- Datos e imágenes: [TMDB](https://www.themoviedb.org/).
- Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.
