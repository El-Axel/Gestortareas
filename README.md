# Claqueta

Tu mesa de trabajo como editor de video freelance: la cola de videos (pendiente → en proceso → en revisión → entregado), las fechas de entrega y el calendario de grabaciones, conectado con Google Calendar para verlo todo en el celular.

Es un sitio estático (HTML, CSS y JavaScript sin compilar). No necesita `npm install` ni servidor propio.

## Qué hace

- **Hoy**: línea de tiempo de las próximas tres semanas con el cabezal en "ahora", lo próximo por entregar ordenado por urgencia, agenda de la semana y cuánto tienes por cobrar.
- **Videos**: tablero por estados con arrastrar y soltar (o vista de lista). Cada video guarda cliente, tipo, fecha y hora de entrega, prioridad, pasos (corte, color, audio…), valor y si ya te pagaron, enlaces al material y a la entrega, y notas.
- **Calendario**: vista de mes y de agenda. Grabaciones, eventos y reuniones; las entregas aparecen solas. Se puede arrastrar una ficha a otro día para reprogramar.
- **Google Calendar** (opcional): lo que creas aquí aparece en tu calendario de Google, y lo que agendas desde el celular aparece aquí. Las entregas se envían como eventos «Entrega: …».
- **Entre dispositivos** (opcional): una copia de tus datos se guarda en una carpeta privada de la app en tu Google Drive, para ver el mismo tablero en el computador y en el celular.
- Tema oscuro y claro, atajos de teclado (`N` nuevo video, `E` nuevo evento, `1`–`4` secciones, `/` buscar), copia de seguridad en un archivo.

## Abrirla en tu computador

Los navegadores no cargan módulos de JavaScript desde un archivo suelto, así que **no sirve hacer doble clic en `index.html`**. Hay que servir la carpeta:

1. Abre la carpeta en Visual Studio Code.
2. Instala la extensión **Live Server** (Ritwick Dey).
3. Clic derecho sobre `index.html` → **Open with Live Server**. Se abre en `http://127.0.0.1:5500`.

Si prefieres la terminal: `npx serve .` o `python -m http.server 5500`.

## Publicarla en Netlify

1. Sube la carpeta a un repositorio de GitHub (el contenido de esta carpeta debe quedar en la raíz del repositorio).
2. En Netlify: **Add new site → Import an existing project** y elige el repositorio.
3. Deja el comando de build vacío y el directorio de publicación en `.` (el archivo `netlify.toml` ya lo indica).
4. Publica. Cada `git push` vuelve a desplegar el sitio.

## Conectar Google Calendar

Google exige que cada app tenga su propio **ID de cliente de OAuth**. Se crea una vez, es gratis y no es un dato secreto.

1. Entra a <https://console.cloud.google.com/> y crea un proyecto (por ejemplo «Claqueta»).
2. **APIs y servicios → Biblioteca**: busca y habilita **Google Calendar API** y **Google Drive API**.
3. **APIs y servicios → Pantalla de consentimiento de OAuth** → «Comenzar»:
   - Nombre de la app y tu correo de asistencia.
   - Público: **Externo**.
   - Tu correo de contacto → Crear.
4. En la pestaña **Público**, sección «Usuarios de prueba», añade tu propio correo de Gmail.
5. En la pestaña **Clientes → Crear cliente**:
   - Tipo de aplicación: **Aplicación web**.
   - En **Orígenes autorizados de JavaScript** añade, sin barra al final:
     - la dirección de tu sitio, por ejemplo `https://tu-sitio.netlify.app`
     - `http://127.0.0.1:5500` y `http://localhost:5500` si la vas a usar en local con Live Server
   - No hace falta ningún «URI de redireccionamiento».
6. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`) y pégalo en `config.js`:

   ```js
   export const GOOGLE_CLIENT_ID = '1234567890-abc.apps.googleusercontent.com';
   ```

   Haz commit y push. (También puedes pegarlo en **Ajustes** dentro de la app, pero eso solo lo recuerda ese navegador.)
7. En la app: **Ajustes → Conectar con Google**. Repite ese clic en el celular.

La pantalla de Ajustes muestra el origen exacto que debes añadir en el paso 5, con un botón para copiarlo.

### Cosas que conviene saber

- **La sesión dura cerca de una hora.** Una web sin servidor no recibe de Google una sesión permanente. Cuando caduca, la app muestra «Reconectar Google»; es un clic y no vuelve a pedir permisos. Mientras tanto todo sigue funcionando y los cambios se envían al reconectar.
- **Modo de prueba.** Mientras la app de Google Cloud esté «En prueba», solo entran los usuarios de prueba que añadiste, y Google puede volver a pedirte el consentimiento cada cierto tiempo (alrededor de una semana). Si eso molesta, en la pestaña **Público** puedes pulsar «Publicar app»: seguirá siendo solo tuya, pero al conectar verás un aviso de «Google no ha verificado esta app» que se salta con «Configuración avanzada → Ir a Claqueta».
- **Permisos que pide.** Ver y editar eventos de tus calendarios, ver la lista de calendarios y usar su carpeta privada de datos en Drive (no ve tus otros archivos). El permiso de Drive se puede apagar en Ajustes antes de conectar.
- **Si ves `redirect_uri_mismatch` u `origin_mismatch`**: el origen del paso 5 no coincide exactamente con la dirección desde la que abres la app (ojo con `http`/`https`, el puerto y la barra final). Los cambios en Google Cloud pueden tardar unos minutos.
- **Recordatorios en el celular**: los envía la app de Google Calendar con tus avisos predeterminados.

## Dónde se guardan los datos

En el almacenamiento local del navegador (`localStorage`). Si conectas Google con la sincronización entre dispositivos activada, además en tu Drive. No hay servidor ni base de datos de terceros.

Desde **Ajustes → Tus datos** puedes descargar una copia (`.json`) y restaurarla. Haz una de vez en cuando si no usas la sincronización: borrar los datos del navegador borra el tablero.

## Estructura

```
index.html            estructura de la página
config.js             tu ID de cliente de Google
netlify.toml          configuración de despliegue
css/base.css          colores, tipografías y piezas pequeñas (aquí se cambia el look)
css/ui.css            navegación, panel lateral, ajustes
css/views.css         tablero, calendario, portada
js/app.js             arranque, rutas, atajos
js/store.js           datos y guardado
js/model.js           reglas: estados, fechas, cálculos
js/views/             una pantalla por archivo + paneles de video y evento
js/ui/                iconos, arrastre, animaciones, avisos
js/google/            inicio de sesión, Calendar, Drive y sincronización
fonts/, assets/       tipografías (Onest, Big Shoulders Display, licencia OFL) e iconos
```

### Personalizar

- **Nombre**: busca «Claqueta» en `index.html`, `manifest.webmanifest` y `js/app.js`.
- **Colores**: variables al inicio de `css/base.css` (`--accent` es el ámbar).
- **Estados del tablero**: `STATUSES` en `js/model.js` y sus colores `--c-…` en `css/base.css`.
- **Pasos por defecto y moneda**: en Ajustes, sin tocar código.
