# Barrio — guía para Miguel (léeme primero)

Qué está hecho, qué está probado, qué **no** he podido probar y los pasos exactos, en orden.

---

## 1. Qué hay hecho

### Lo básico (primera noche)
- Un servidor MCP para cada negocio (`/api/mcp/la-familia`, `/api/mcp/el-rancho`) con sus herramientas: info, servicios (peluquería) o carta y platos (restaurante), disponibilidad, reservar y cancelar (5 en la peluquería, 6 en el restaurante, 8 en el directorio).
- Datos reales de La Familia y El Rancho, sacados de sus webs.
- Panel del dueño: agenda, servicios o carta, horario con turno partido y ajustes. Los visitantes solo pueden mirar.
- Simulador de Alexa+ por voz (`/try/<negocio>`) en inglés y en español.

### Mejoras para ganar (segunda ronda)
| Mejora | Por qué puntúa |
|---|---|
| **Construido según la documentación oficial "Alexa+ MCP Toolkit"** de Amazon | Técnica. No sale en la página del hackathon; la encontré buscando. La lista de requisitos y cómo los cumple Barrio está en `alexa/README.md` |
| **Tarjetas en el Echo Show** (MCP Apps), según la guía de diseño de Amazon: lienzo de 768×480, modo claro y oscuro, tocar una hora la reserva | Diseño. Se ven en `/try/el-rancho/screens` sin necesidad de clave de API |
| **Modo directorio**: una sola add-on "Barrio" para todos los negocios (`/api/mcp`) | Impacto e idea. Ninguna peluquería va a certificar su propia add-on |
| **"Haz una foto a tu carta"**: el dueño sube la foto y elige qué publicar | Impacto. Es el momento estrella del vídeo |
| **Reservas en el calendario del iPhone** del dueño | Impacto. Sin apps nuevas |
| **Emails de confirmación** con enlace para cancelar, y aviso al dueño | Lo pide la guía de Amazon |
| Alias en inglés ("beard trim" → Arreglo de barba) | Alexa+ funciona en inglés (solo EE. UU.) |
| Respuesta en ~5–10 ms + caché + región fijada | Alexa+ pide respuestas rápidas (los 500 ms son para otro tipo de add-on; para MCP sugiere unos pocos segundos) |
| OAuth 2.1 opcional con los metadatos que pide Amazon | Para registrarlo como servidor privado |
| Kit de publicación: iconos en los 6 tamaños, logos, carrusel, banner, privacidad, condiciones y la ficha de tienda con los límites comprobados | Si te dan acceso al toolkit, publicar es copiar y pegar |
| Borrado de reservas a los 12 meses | Lo que promete la página de privacidad es verdad |
| Integración continua en GitHub (pruebas + base de datos real + navegador) | Credibilidad para el mini challenge de Open Source |

### Pruebas
- **251 tests automáticos** (240 corren siempre y 11 necesitan una base de datos de prueba), **20 comprobaciones de Postgres** y **64 comprobaciones de navegador**. Todo en verde.
- 100 personas pidiendo la misma hora: entra 1 y las otras 99 reciben horas alternativas. Probado en memoria, en Postgres real con 100 conexiones y por HTTP.
- 3.000 peticiones con basura y ni un solo error del servidor.
- Las tarjetas del Echo Show, probadas con el **host oficial** de MCP Apps (el mismo tipo de componente que usaría Alexa+).
- Validado con el **MCP Inspector oficial**.
- Tres rondas de revisión. Todo lo encontrado está arreglado y tiene su test. Lo más gordo de la tercera:
  - "Snap your menu" no habría funcionado nunca con Claude de verdad (el modelo rechazaba la forma de pedirle el JSON).
  - Cualquiera podía crear un negocio de prueba llamado "La Familia" y quedarse las reservas de la de verdad desde el directorio.
  - "tacos with guacamole" respondía "sin gluten: sí" hablando del guacamole.
  - El dueño de la peluquería no podía guardar sus ajustes, y al guardar un servicio se borraban sus nombres en inglés.

---

## 2. Lo que NO he podido probar (sé honesto con esto)

1. **Claude de verdad** en el simulador y en la importación de fotos: aquí no tengo tu clave de API. Está probado con un "Claude falso" que ahora responde igual que el real (bloques de pensamiento, cortes, JSON estructurado), pero la primera vez haz tú una reserva y una importación de prueba.
2. **Alexa+ de verdad.** El toolkit de Amazon pide una cuenta de desarrollador de EE. UU., Node 24 y un registro privado de paquetes de AWS. **Pregunta en el Discord del hackathon si dan acceso.** Si lo consigues, los pasos están en `alexa/README.md` y la ficha ya está escrita.
3. **Tus cuentas reales** de Supabase, Vercel y Resend.

---

## 3. Antes de nada

- **Permiso del peluquero y del dueño de El Rancho** para usar sus nombres y datos en una demo pública y en YouTube. Amazon puede promocionar el proyecto durante 3 años.
- **Horario real de El Rancho.** No lo publican y he puesto uno provisional (martes a domingo, 13:00–16:30 y 20:00–23:30). Cámbialo en el panel → *Opening hours*.
- **Límite de gasto en Anthropic**: console.anthropic.com → Billing → Limits, por ejemplo 10 € al mes.

> Las reservas de Barrio **no llegan** a la web de reservas real de La Familia. Las páginas `/try` lo avisan.

---

## 4. Pasos (en este orden)

### Paso 1 — Arrancarlo en tu Mac (10 min)
```bash
npm install
npm run dev
```
Abre http://localhost:3000. Crea un archivo `.env.local` con `ANTHROPIC_API_KEY=tu-clave` para activar el simulador y la importación por foto.

### Paso 2 — GitHub (5 min)
El repo `Miguelvv7/barrio` ya existe, pero es **privado**.
1. Fusiona la pull request con todos los arreglos (botón **Merge pull request** → **Confirm merge**) cuando esté en verde.
2. Hazlo **público**: Settings → abajo del todo → Change visibility → Public. Lo piden Devpost y el mini challenge de Open Source.
3. En la página del repo, rueda dentada de **About**: pon una descripción ("Your neighbourhood on Alexa+: an MCP server for small local businesses"), la web desplegada y temas (`alexa`, `mcp`, `model-context-protocol`, `nextjs`). Comprueba que sale **MIT license**.
4. En la pestaña **Actions** la integración continua tiene que salir en verde.

### Paso 3 — Supabase (10 min)
1. supabase.com → New project. **Región: East US (North Virginia)**. Ojo, no Irlanda: Alexa+ llama desde EE. UU. y Vercel está configurado en la misma zona (`iad1`).
2. **SQL Editor** → pega `supabase/migrations/0001_barrio.sql` → Run.
3. **Project Settings → API**: copia la *Project URL* y la clave **service_role**.
4. Añádelas a `.env.local` (`SUPABASE_URL=`, `SUPABASE_SERVICE_ROLE_KEY=`) y carga los negocios con `npm run seed`.

### Paso 4 — Vercel (10 min)
Importa el repo y pon estas variables:

| Variable | Valor |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | las de Supabase (**obligatorias**: sin ellas producción no arranca, para no perder reservas) |
| `BARRIO_ADMIN_PASSWORD` | tu contraseña del panel (**obligatoria**: sin ella nadie puede editar) |
| `BARRIO_SECRET` | en la Terminal: `openssl rand -hex 32` (**obligatoria**: sin ella la web de producción no arranca, a propósito) |
| `CRON_SECRET` | otro `openssl rand -hex 32` (para el borrado automático) |
| `ANTHROPIC_API_KEY` | tu clave |
| `BARRIO_PUBLIC_URL` | `https://<tu-proyecto>.vercel.app` (cuando lo sepas; redeploy) |
| `RESEND_API_KEY`, `BARRIO_EMAIL_FROM` | opcional, para los emails (ya usas Resend en La Familia) |
| `BARRIO_CONTACT_EMAIL` | **recomendada**: el email que sale en Privacidad y Condiciones (Amazon pide un contacto para borrar datos; sin ella sale el enlace al repo) |

### Paso 5 — Comprobarlo desplegado (5 min)
```bash
npm run load-test -- https://<tu-proyecto>.vercel.app la-familia
```
Tiene que salir `OK` en la latencia y `errors 0`. El test cancela solo las reservas de prueba que crea (te dice cuántas); si quieres que no cree ninguna, añade `--no-race` al final. Mira también `/try/el-rancho/screens`.

Después, en el README, cambia la línea `TODO(Miguel)` del principio por la URL desplegada y el enlace al vídeo.

### Paso 6 — Lo que solo puedes hacer tú
- Suscribe el calendario: en el panel de La Familia → *Subscribe on this device* (desde el iPhone).
- Pon tu email en *Settings → Email me new bookings* (solo funciona con tu sesión de admin; los negocios que crea cualquier visitante no envían emails).
- Prueba "Snap your menu" con una foto real de la lista de precios de la peluquería.

---

## 5. Hasta el 23

| Día | Qué |
|---|---|
| 13–14 | Pasos 1–6, permisos, horario de El Rancho, pregunta en Discord por el acceso a Alexa+ |
| 15–17 | Úsalo mucho con el simulador; lo que suene raro, me lo dices y lo afinamos |
| 18–19 | Lee el friction log y el feedback (`docs/`) y reescríbelos con tus palabras |
| 20 | Ensaya el vídeo con `docs/VIDEO_SCRIPT.md` |
| 21 | **Graba el vídeo** (un día en que "mañana" sea de lunes a jueves) |
| 22 | Devpost con `docs/DEVPOST_SUBMISSION.md` y las imágenes de `docs/gallery/` y `public/alexa/` |
| 23 | **Entrega por la mañana.** Cierra a las 21:00 hora española |

No apagues nada hasta diciembre: los jueces prueban del 9 al 20 de noviembre.

---

## 6. Mapa del código (para poder explicarlo)

| Archivo | Qué hace |
|---|---|
| `src/app/api/mcp/route.ts` | El servidor directorio (todos los negocios) |
| `src/app/api/mcp/[slug]/route.ts` | El servidor de un negocio |
| `src/lib/mcp/handler.ts` | Seguridad HTTP, OAuth y protocolo |
| `src/lib/mcp/server.ts` / `directory.ts` | Las herramientas que ve Alexa+ |
| `src/lib/mcp/schemas.ts` | Qué datos devuelve cada herramienta (`outputSchema`) |
| `src/mcp-app/` | La tarjeta del Echo Show (~20 KB) |
| `src/app/try/[slug]/EchoShow.tsx` | El "host" que la pinta, como haría Alexa+ |
| `src/lib/booking-service.ts` | Reservar, cancelar, disponibilidad, alérgenos |
| `src/lib/availability.ts` | Qué horas están libres |
| `src/lib/importer.ts` | Leer la foto de la carta |
| `src/lib/ics.ts` | El calendario del iPhone |
| `src/lib/notify.ts` | Los emails |
| `src/lib/oauth/` | OAuth para Alexa+ |
| `supabase/migrations/0001_barrio.sql` | Tablas + la función que impide dobles reservas |
| `scripts/brand/build-assets.ts` | Genera todos los iconos e imágenes |
| `alexa/` | Kit de publicación en Alexa+ |

La idea clave para contarlo: **el asistente no sabe nada del negocio; todo sale de una llamada MCP**. Y una sola add-on sirve para todos los negocios del barrio.

---

## 7. Comandos útiles

```bash
npm run dev            # arrancar en local
npm test               # pruebas (240; +11 con base de datos de prueba)
npm run test:e2e       # pruebas en navegador (instrucciones en e2e/run.mjs)
npm run test:sql       # base de datos con 100 reservas simultáneas (Postgres de prueba)
npm run seed           # cargar La Familia y El Rancho en Supabase
npm run build:assets   # regenerar iconos e imágenes
npm run load-test -- <url> la-familia   # añade --no-race para no crear reservas
node alexa/listing.mjs https://<tu-url>   # ficha de tienda de Alexa+
```
