# Checklist de entrega

Estado del proyecto frente a lo que pide la actividad.

## 1. Evidencia de GitHub Pro

- [ ] Activar **GitHub Student Developer Pack** en <https://education.github.com/pack>.
- [ ] Esperar la aprobación (puede tardar días; si sigue en revisión, guardar la captura del estado).
- [ ] Verificar que el plan figure como **Pro** en <https://github.com/settings/billing>.
- [ ] Captura de pantalla donde se vea la cuenta y el plan **GitHub Pro** activo.
- [ ] Enlace al perfil: `https://github.com/TU_USUARIO`.

> Si la solicitud sigue en revisión, se entrega la captura del estado y se avisa al docente.

## 2. Repositorio de la aplicación

- [x] Crear el repositorio público en GitHub.
- [x] Subir el proyecto (`main` con 9 commits).
- [x] Verificar que **no** aparezca el archivo `.env` ni ninguna clave.
- [x] Verificar que el historial tenga varios commits (no uno solo).
- [x] Enlace al repositorio: <https://github.com/rub803030/cinebusca>

Para futuros cambios:

```powershell
cd "C:\Users\rubnl\Documents\Default Project\cinebusca"
git add .
git commit -m "descripcion del cambio"
git push
```

## 3. README.md

- [x] Instrucciones de instalación y ejecución.
- [x] Variables de entorno (`.env.example`).
- [x] Declaración de herramientas de IA y para qué se usó cada una.
- [x] Qué parte se hizo sin ayuda de IA.
- [ ] Completar la URL real del video en la sección **Demo**.
## 4. Bitácora de programación con IA

- [x] Documento en `docs/bitacora-IA.md` (dentro del repositorio, como permite la consigna).
- [x] Al menos 5 prompts con respuesta, resultado y ajustes.
- [x] Un error de la IA detectado y cómo se resolvió.
- [x] Aprendizajes y qué haría distinto.
- [ ] **Revisar que los prompts coincidan con tu historial real** y ajustar lo que haga falta.
- [ ] Exportar a PDF si el docente lo pide (abrir el `.md` y "Guardar como PDF", o usar
      `npx marked docs/bitacora-IA.md -o bitacora.pdf`).

## 5. Demostración (3 minutos)

- [x] Guion en `docs/guion-demo.md`.
- [ ] Grabar el video o preparar la demo en clase.
- [ ] Explicar cómo funciona la app y una parte del código (por ejemplo `/api/movies/search`).
- [ ] Subir el video (YouTube no listado, Drive, etc.) y pegar el enlace en el README.

## Antes de entregar

```powershell
# 1. Las pruebas deben pasar
npm test

# 2. No debe haber secretos en el repo
git status
git ls-files | Select-String ".env"

# 3. La app debe arrancar con tu .env
npm start
```

Revisar también:

- [ ] La app responde bien con una búsqueda sin resultados (estado vacío).
- [ ] La app muestra un mensaje claro si se corta internet.
- [ ] La app muestra un mensaje claro si la clave es inválida.
- [ ] El detalle de una película abre y cierra con `Esc` y con el botón ✕.
- [ ] Se puede usar con teclado (Tab, Enter, Esc).

## Datos que debes personalizar

| Archivo / lugar            | Qué cambiar                                         |
| -------------------------- | --------------------------------------------------- |
| `README.md`                | Enlace del video de la demo                         |
| `docs/bitacora-IA.md`      | Confirmar prompts y fechas                          |
| `package.json`             | Nada: autor y repositorio ya están configurados     |
| `docs/entrega.md`          | Marcar las casillas al terminar                     |
