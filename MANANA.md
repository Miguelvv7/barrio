# Barrio — guía para Miguel (léeme primero)

Esto es lo que te he dejado montado esta noche, lo que está probado, lo que **no** he podido probar, y los pasos exactos para mañana.

---

## 1. Qué hay hecho

| Parte | Estado |
|---|---|
| Servidor MCP multi-negocio (`/api/mcp/<negocio>`), Streamable HTTP, spec 2025-11-25 | ✅ hecho y probado |
| 6 herramientas: info, servicios/carta, alérgenos, disponibilidad, reservar, cancelar | ✅ |
| Datos reales de La Familia (servicios, precios, horario) y El Rancho (34 platos, precios, sin gluten) | ✅ sacados de sus webs |
| Base de datos Supabase con bloqueo anti-doble-reserva | ✅ probada en Postgres real |
| Panel del dueño: agenda, editar servicios/carta, horario con turno partido, ajustes | ✅ |
| Modo solo lectura para visitantes (los jueces no pueden romper la demo) + login del dueño | ✅ |
| Cualquiera puede crear su propio negocio de prueba y editarlo | ✅ |
| Simulador de Alexa+ por voz (`/try/<negocio>`), inglés y español | ✅ hecho · ⚠️ ver punto 2 |
| README en inglés, licencia MIT, borradores de friction log, feedback, texto de Devpost y guion del vídeo | ✅ en `docs/` |

### Pruebas que he pasado (modo tester)

- **120 tests automáticos**, todos en verde.
- **100 clientes a la vez pidiendo la misma hora:** en la peluquería entra 1 y los otros 99 reciben horas alternativas. En el restaurante entran exactamente 8 (las mesas). Probado en memoria, en Postgres real con 100 conexiones, y por HTTP contra el servidor de producción.
- **3.000 peticiones con basura** (inyecciones SQL, HTML, emojis, números gigantes, tipos erróneos, "ignora tus instrucciones"…): ni un solo error 500.
- **Carga:** 2.000 llamadas con 100 clientes simultáneos → 0 errores, ~340 ms de media.
- **Navegador real:** crear negocio, editar precios, reservas que chocan, cancelar, intentar saltarse el modo solo lectura manipulando la página o la cookie (bloqueado), login, logout, móvil a 375 px sin scroll lateral.

### Bugs que encontré y arreglé

1. "5:30pm" (sin espacio) se interpretaba como **las 5:30 de la mañana**. Un cliente pediría por la tarde y le reservaría de madrugada.
2. Si el cliente decía "corte peinado" no encontraba "Corte y Peinado (sin barba)".
3. Un cuerpo `[]` se aceptaba como válido en vez de dar error.
4. En el móvil el panel se salía por los lados (hasta 600 px).
5. El límite de 3 reservas por teléfono se podía saltar mandando muchas a la vez. Ahora lo comprueba la base de datos de forma atómica.

---

## 2. Lo que NO he podido probar (sé honesto con esto)

1. **La llamada real a Claude del simulador.** No tengo tu API key aquí. El circuito completo está probado con un "Claude falso" que sigue un guion, pero la primera vez que lo uses con la key real, pruébalo tú: pide precio, pide hora, reserva.
2. **Conectarlo a un Alexa+ de verdad.** La página de recursos del hackathon no explica cómo se conecta Alexa+ a un servidor MCP. Por eso existe el simulador, que las bases permiten expresamente. Si en el Discord o en las office hours explican cómo conectarlo de verdad, es un plus enorme: pregunta.
3. **Tu Supabase y tu Vercel reales.** He probado el SQL en Postgres 16 y la conexión con el mismo servidor API que usa Supabase (PostgREST), pero no en tus cuentas.

---

## 3. Antes de nada: dos permisos que tienes que pedir

- **Al peluquero y al dueño de El Rancho:** que te dejen usar el nombre del negocio y sus datos en una demo pública y en un vídeo de YouTube. Amazon puede promocionar el proyecto durante 3 años. Un "sí" por WhatsApp vale, pero pídelo.
- **El Rancho no publica su horario.** He puesto uno provisional (martes a domingo, 13:00–16:30 y 20:00–23:30, lunes cerrado). Pregúntale el real y cámbialo en el panel → *Opening hours*.

> Ojo: las reservas de Barrio **no llegan** a la web real de reservas de La Familia. Por eso las páginas `/try` muestran "Demo: las reservas hechas aquí no llegan al negocio real". Déjalo así salvo que el negocio lo vaya a usar de verdad.

---

## 4. Pasos para mañana (en este orden)

### Paso 1 — Arrancarlo en tu Mac (10 min)

Descomprime el zip que te he enviado, abre la Terminal en esa carpeta y:

```bash
npm install
npm run dev
```

Abre http://localhost:3000. Funciona sin configurar nada (usa datos en memoria). Mira el panel de los dos negocios y prueba el MCP.

Para el simulador de voz, crea un archivo `.env.local` con:

```
ANTHROPIC_API_KEY=tu-key
```

La key la sacas en https://console.anthropic.com → API Keys. Cada conversación cuesta céntimos (usa el modelo Haiku).

### Paso 2 — Subirlo a GitHub (5 min)

1. En GitHub: **New repository** → nombre `barrio` → **Public** → **NO marques** README, .gitignore ni licencia (ya vienen en el proyecto, y si los marcas el push falla).
2. En la Terminal, dentro de la carpeta:

```bash
git remote add origin https://github.com/Miguelvv7/barrio.git
git push -u origin main
```

3. Comprueba que en la columna derecha del repo ("About") sale **MIT license**. Eso es lo que pide el mini challenge de Open Source.

Los commits ya van firmados como Miguelvv7.

### Paso 3 — Supabase (10 min)

1. https://supabase.com → New project (región: West EU / Irlanda).
2. **SQL Editor** → pega todo el contenido de `supabase/migrations/0001_barrio.sql` → Run.
3. **Project Settings → API**: copia la *Project URL* y la clave **service_role** (la secreta, no la anon).
4. Añádelas a tu `.env.local`:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

5. Carga los dos negocios: `npm run seed`

### Paso 4 — Vercel (10 min)

1. https://vercel.com → Add New → Project → importa `Miguelvv7/barrio`.
2. En **Environment Variables** pon:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | la de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | la service_role |
| `BARRIO_ADMIN_PASSWORD` | una contraseña tuya para el panel |
| `BARRIO_SECRET` | en la Terminal: `openssl rand -hex 32` y pega el resultado |
| `ANTHROPIC_API_KEY` | tu key |

3. Deploy. Tus URLs MCP quedan en `https://<tu-proyecto>.vercel.app/api/mcp/la-familia` y `/api/mcp/el-rancho`.

### Paso 5 — Comprobarlo desplegado (5 min)

```bash
npm run load-test -- https://<tu-proyecto>.vercel.app la-familia
```

Tiene que salir `errors 0` y `1 booked, 99 refused`. Después entra en el panel con tu contraseña y **cancela las reservas de prueba** que crea el test.

---

## 5. Lo que queda hasta el 23

| Día | Qué |
|---|---|
| 13–14 | Pasos 1 a 5. Permisos de los negocios. Horario real de El Rancho |
| 14–16 | Usarlo mucho tú mismo con el simulador. Lo que suene raro, me lo dices y lo afinamos |
| 16 | Preguntar en el Discord cómo conectar un MCP a Alexa+ de verdad |
| 17–19 | Pulir lo que haya salido, revisar el friction log con tus palabras |
| 20 | Ensayar el vídeo con el guion de `docs/VIDEO_SCRIPT.md` |
| 21 | **Grabar el vídeo** (un día en que "mañana" sea laborable, que la peluquería cierra sábado y domingo) |
| 22 | Rellenar Devpost con `docs/DEVPOST_SUBMISSION.md` |
| 23 | **Entregar por la mañana.** Cierra a las 21:00 hora española |

Y no apagues Vercel ni Supabase hasta diciembre: los jueces prueban del 9 al 20 de noviembre.

---

## 6. Mapa del código (para que lo puedas explicar)

Los jueces pueden preguntarte. Esto es lo que hace cada pieza:

| Archivo | Qué hace |
|---|---|
| `src/app/api/mcp/[slug]/route.ts` | La URL pública del servidor MCP |
| `src/lib/mcp/handler.ts` | Seguridad HTTP: Origin, tamaño, métodos, JSON válido |
| `src/lib/mcp/server.ts` | Define las herramientas que ve Alexa+ y sus descripciones |
| `src/lib/booking-service.ts` | La lógica de negocio: reservar, cancelar, disponibilidad, alérgenos |
| `src/lib/availability.ts` | Las cuentas: qué horas están libres según horario y capacidad |
| `src/lib/time.ts` | Entiende "mañana", "viernes", "5:30pm" |
| `src/lib/store/` | Dónde se guardan los datos: memoria (local) o Supabase (producción) |
| `supabase/migrations/0001_barrio.sql` | Tablas + la función que impide dobles reservas |
| `src/lib/assistant.ts` | El "Alexa+ simulado": Claude usando solo las herramientas MCP |
| `src/app/dashboard/` | El panel del dueño |
| `src/app/try/` | La página del simulador de voz |
| `tests/` | Las pruebas automáticas |

La idea clave para contarla: **el asistente no sabe nada del negocio. Todo lo que dice sale de una llamada MCP**, y en el simulador se ve cada llamada debajo de cada respuesta.

---

## 7. Comandos útiles

```bash
npm run dev          # arrancar en local
npm test             # las pruebas (114; +6 si configuras una base de datos de test)
npm run typecheck    # comprobar tipos
npm run lint         # comprobar estilo
npm run seed         # cargar La Familia y El Rancho en Supabase
npm run load-test -- <url> la-familia   # prueba de carga
```
