# Barrio — guía para Miguel (léeme primero)

Qué está hecho, qué está probado, qué **no** he podido probar y los pasos exactos, en orden.

---

## 1. Qué hay hecho

### Lo básico (primera noche)
- Un servidor MCP para cada negocio (`/api/mcp/la-familia`, `/api/mcp/el-rancho`) con 6 herramientas: info, servicios o carta, alérgenos, disponibilidad, reservar y cancelar.
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
| Respuesta en ~5 ms + caché + región fijada | Amazon exige menos de 500 ms |
| OAuth 2.1 opcional con los metadatos que pide Amazon | Para registrarlo como servidor privado |
| Kit de publicación: iconos en los 6 tamaños, logos, carrusel, banner, privacidad, condiciones y la ficha de tienda con los límites comprobados | Si te dan acceso al toolkit, publicar es copiar y pegar |
| Borrado de reservas a los 12 meses | Lo que promete la página de privacidad es verdad |
| Integración continua en GitHub (pruebas + base de datos real + navegador) | Credibilidad para el mini challenge de Open Source |

### Pruebas
- **191 tests automáticos** (182 corren siempre y 9 necesitan una base de datos de prueba) y **61 comprobaciones de navegador**. Todo en verde.
- 100 personas pidiendo la misma hora: entra 1 y las otras 99 reciben horas alternativas. Probado en memoria, en Postgres real con 100 conexiones y por HTTP.
- 3.000 peticiones con basura y ni un solo error del servidor.
- Las tarjetas del Echo Show, probadas con el **host oficial** de MCP Apps (el mismo tipo de componente que usaría Alexa+).
- Validado con el **MCP Inspector oficial**.
- Dos revisiones independientes (22 fallos en total). Todo está arreglado y tiene su test. El más gordo de la segunda: alguien podía crear un negocio de prueba y usar Barrio para mandar emails masivos. Ahora los negocios de prueba no envían emails y solo tú puedes activar los avisos.

---

## 2. Lo que NO he podido probar (sé honesto con esto)

1. **Claude de verdad** en el simulador y en la importación de fotos: aquí no tengo tu clave de API. Está probado con un "Claude falso", pero la primera vez haz tú una reserva y una importación de prueba.
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
1. **New repository** → nombre `barrio` → **Public** → **no marques** README, .gitignore ni licencia.
2. En la Terminal, dentro de la carpeta:
```bash
git remote add origin https://github.com/Miguelvv7/barrio.git
git push -u origin main
```
3. Comprueba que en "About" sale **MIT license** y que en la pestaña **Actions** la integración continua sale en verde (tarda unos 5 minutos).

### Paso 3 — Supabase (10 min)
1. supabase.com → New project. **Región: East US (North Virginia)**. Ojo, no Irlanda: Alexa+ llama desde EE. UU. y hay que bajar de 500 ms.
2. **SQL Editor** → pega `supabase/migrations/0001_barrio.sql` → Run.
3. **Project Settings → API**: copia la *Project URL* y la clave **service_role**.
4. Añádelas a `.env.local` (`SUPABASE_URL=`, `SUPABASE_SERVICE_ROLE_KEY=`) y carga los negocios con `npm run seed`.

### Paso 4 — Vercel (10 min)
Importa el repo y pon estas variables:

| Variable | Valor |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | las de Supabase |
| `BARRIO_ADMIN_PASSWORD` | tu contraseña del panel (**obligatoria**: sin ella nadie puede editar) |
| `BARRIO_SECRET` | en la Terminal: `openssl rand -hex 32` |
| `CRON_SECRET` | otro `openssl rand -hex 32` (para el borrado automático) |
| `ANTHROPIC_API_KEY` | tu clave |
| `BARRIO_PUBLIC_URL` | `https://<tu-proyecto>.vercel.app` (cuando lo sepas; redeploy) |
| `RESEND_API_KEY`, `BARRIO_EMAIL_FROM` | opcional, para los emails (ya usas Resend en La Familia) |
| `BARRIO_CONTACT_EMAIL` | opcional, el email que sale en Privacidad y Condiciones |

### Paso 5 — Comprobarlo desplegado (5 min)
```bash
npm run load-test -- https://<tu-proyecto>.vercel.app la-familia
```
Tiene que salir `OK` en la latencia y `errors 0`. Después **cancela desde el panel las reservas de prueba** que crea el test. Mira también `/try/el-rancho/screens`.

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
| `src/mcp-app/` | La tarjeta del Echo Show (14 KB) |
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
npm test               # pruebas (182; +9 con base de datos de prueba)
npm run test:e2e       # pruebas en navegador (instrucciones en e2e/run.mjs)
npm run test:sql       # base de datos con 100 reservas simultáneas (Postgres de prueba)
npm run seed           # cargar La Familia y El Rancho en Supabase
npm run build:assets   # regenerar iconos e imágenes
npm run load-test -- <url> la-familia
node alexa/listing.mjs https://<tu-url>   # ficha de tienda de Alexa+
```
