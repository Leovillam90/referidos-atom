# Auditoría antes de producción — Referidos ATOM

Fecha: 27 de noviembre de 2026 · Alcance: seguridad, arquitectura, estabilidad, fluidez y pruebas.
No se cambió la lógica de negocio (bonos, estados ni reglas del programa); las 25 pruebas de reglas
(`tests/bd-reglas.test.ts`) describen el comportamiento actual y pasan.

---

## a) Resumen: ¿está lista para datos reales?

**Sí, con condiciones.**

La base es sólida: Row Level Security en todas las tablas, las reglas del programa se validan en la
base de datos, los soportes están en un bucket privado con links de 60 segundos, no hay secretos en
Git ni en el navegador y `npm audit` no reporta vulnerabilidades.

Encontré y **corregí** un problema crítico de privacidad (un referente podía leer el correo, el
celular y la cuenta Dropi de sus referidos llamando la API directamente) y varios problemas altos y
medios (permiso para editar su propia fila, redirección abierta, sin límite para pedir links de
acceso, sin cabeceras de seguridad, errores con datos personales en los logs, cruces que se podían
pisar y sin registro de ejecuciones).

**Las condiciones** (detalle en la sección g):

1. Publicar este código y **enseguida** ejecutar `supabase/schema.sql` en Supabase (en ese orden).
2. Configurar un SMTP propio en Supabase Auth: el correo incluido en Supabase solo envía unos pocos
   correos por hora y, con usuarios reales, el login dejaría de funcionar.
3. Activar Cloudflare Turnstile (gratis).
4. Decidir el plan de Vercel (Hobby no permite uso comercial) y las copias de seguridad de Supabase
   (el plan gratis no tiene).

---

## b) Hallazgos por gravedad

Leyenda: ✅ corregido en este commit · 📋 requiere una acción o decisión tuya (sección g).

### CRÍTICO

| # | Qué es | Por qué importa | Dónde | Estado |
|---|---|---|---|---|
| C1 | Un referente podía leer **correo, celular, cuenta Dropi e identificadores** de sus referidos. El panel no los mostraba, pero la base sí se los entregaba a cualquiera con sesión que llamara la API de Supabase directamente. Además, el correo de "nuevo referido" al referente usaba el correo del referido cuando no había nombre. | Datos personales de terceros (Ley 1581) expuestos a otra persona. | `supabase/schema.sql` (permisos por columna de `referidos`), `src/lib/sesion.ts`, `src/lib/avisos.ts` | ✅ Se quitaron esas columnas del permiso de lectura. El referente ve el nombre y una pista (`an•••@gmail.com`, columna nueva `correo_oculto`). El super_admin las lee desde el servidor, **después** de verificar su rol (`src/lib/datos-admin.ts`, tipo `ClienteSuperAdmin` que TypeScript no deja falsificar). Probado en `tests/bd-permisos.test.ts`. |

### ALTO

| # | Qué es | Por qué importa | Dónde | Estado |
|---|---|---|---|---|
| A1 | La política "referente edita su perfil" + permiso de UPDATE dejaban que un referente cambiara su nombre, celular y cuenta Dropi **por la API**, sin pasar por las validaciones de la app (la app nunca usaba ese permiso). | Como los identificadores se acumulan, podía "apartar" correos o celulares de otras personas para que no pudieran registrarse como referentes. | `supabase/schema.sql` | ✅ Política y permiso eliminados. Probado. |
| A2 | Pedir el link de acceso (`/ingresar`) no tenía límite propio ni anti-robots. | Alguien podía bombardear correos y agotar el cupo de correos de Supabase Auth, dejando a todos sin poder entrar. | `src/app/(acceso)/acciones.ts` | ✅ Límite de 10 intentos por IP por hora (ingreso y registro de referentes, función `registrar_intento`) y Turnstile también en `/ingresar`. |
| A3 | Supabase Auth probablemente usa su correo incluido (muy pocos correos por hora). | Con usuarios reales, los links de acceso dejarían de llegar. | Panel de Supabase | 📋 Tarea 2. |
| A4 | Turnstile no está configurado en producción (lo avisa `npm run verificar`). | Sin anti-robots, los formularios públicos dependen solo de los límites por hora. | Variables de Vercel | 📋 Tarea 3. |
| A5 | Vercel Hobby es solo para uso **no comercial**. | Un programa de referidos de una empresa es uso comercial: riesgo de suspensión de la cuenta. | Decisión | 📋 Tarea 4. |
| A6 | Supabase gratis no tiene copias de seguridad. | Un error o borrado no se podría deshacer. | Decisión | 📋 Tarea 5. |

### MEDIO

| # | Qué es | Dónde | Estado |
|---|---|---|---|
| M1 | **Redirección abierta** en `/auth/confirm`: `?next=/\sitio-malo.com` pasaba el filtro (el navegador lo trata como `//sitio-malo.com`). Con un link armado por un atacante, la persona podía terminar en otro sitio. | `src/app/auth/confirm/route.ts` → `src/lib/rutas.ts` | ✅ Se arma la dirección completa y se exige el mismo dominio. Probado (unitario y en navegador). |
| M2 | **Sin cabeceras de seguridad** (ni CSP, ni HSTS, ni protección contra iframes). | `next.config.ts` | ✅ Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy y COOP. `/confirmar/…` no envía Referer (lleva un token). Probado. |
| M3 | **Datos personales en los logs**: errores de Supabase y SMTP pueden traer el correo o celular de la persona; el aviso de "SMTP no configurado" escribía el asunto con el nombre del referido. | 35 llamadas a `console.error` en el servidor | ✅ Todo pasa por `logError`/`registrarError` (`src/lib/registro.ts`), que tapa correos, celulares y llaves. Probado. |
| M4 | **Cruces que se podían pisar y sin registro**: el cron y el botón podían correr a la vez; si el cron fallaba, nadie se enteraba. | `src/app/api/cruce/route.ts`, `src/lib/cruce.ts` | ✅ Tabla `ejecuciones_cruce` (inicio, fin, resultado, error) con un solo cruce "en curso" a la vez (índice único + bloqueo). Se ve en `/admin`. Probado. |
| M5 | **Fallas de correo, hoja o anti-robots invisibles** (solo en los logs de Vercel). | `after()` del registro, confirmación y pagos | ✅ Tabla `errores_sistema`, visible en `/admin` (últimos 7 días). El registro de la persona se guarda igual. |
| M6 | **Sin tiempos de espera** al leer la hoja y al enviar correos. Una conexión colgada podía agotar el tiempo de la función. | `src/lib/hoja-afiliados.ts`, `src/lib/correo.ts` | ✅ Hoja: 30 s y 2 reintentos (429/5xx). SMTP: 10 s para conectar, 20 s de inactividad. |
| M7 | **Sin duración máxima** declarada para el cron y el botón de cruce. | `api/cruce`, `admin/page.tsx` | ✅ `maxDuration = 60` (máximo de Hobby sin Fluid Compute). |
| M8 | **Exportación a Excel**: el celular de registros viejos no pasaba por la protección contra fórmulas, ni los textos con espacios antes de `=` o con `＝` ancho. | `src/app/admin/exportar/route.ts` → `src/lib/csv.ts` | ✅ Corregido y probado. |
| M9 | **TRUNCATE** (vacía una tabla saltándose RLS): con los permisos por defecto de Supabase, `authenticated` lo conservaba en las tablas. La API de Supabase no ofrece TRUNCATE, así que no era explotable desde afuera, pero sobraba. | `supabase/schema.sql` | ✅ Se quitan TRUNCATE/REFERENCES/TRIGGER a anon y authenticated, y todo a anon. La prueba simula los permisos por defecto de Supabase. |
| M10 | **Soporte de pago**: el tipo se tomaba de lo que decía el navegador, no del contenido. Solo lo sube el super_admin, así que el riesgo era bajo. | `src/app/admin/acciones.ts` → `src/lib/archivos.ts` | ✅ Se revisa la firma del archivo (JPG/PNG/WEBP/PDF) y que coincida con la extensión; si no, se borra. Nombres de archivo: siempre `<referente>/<uuid>.<ext>` generados por el servidor. |
| M11 | Orden de publicación: el código nuevo y el schema nuevo dependen uno del otro. | — | 📋 Tarea 1 (publicar y enseguida ejecutar el SQL). |

### BAJO

| # | Qué es | Estado |
|---|---|---|
| B1 | 12 funciones SQL sin `search_path` fijo (aviso típico del Advisor de Supabase). | ✅ Corregido (y el generador de patrones de celular, `src/lib/telefono-sql.ts`). |
| B2 | La clave del cron se comparaba con `!==` (en teoría se puede adivinar midiendo tiempos). | ✅ Comparación a tiempo constante (`src/lib/clave-servidor.ts`). |
| B3 | Cookie de sesión sin `Secure` explícito. | ✅ `Secure` en https y `SameSite=Lax` (`src/lib/supabase/cookies.ts`). No es `HttpOnly` a propósito: el navegador la necesita para entrar con el código del correo. |
| B4 | No existía `global-error` (error en el diseño principal mostraba la página genérica en inglés). | ✅ `src/app/global-error.tsx` en español y con colores de marca. `error.tsx` y `not-found.tsx` ya estaban bien. |
| B5 | La IP del registro de referentes se tomaba sin validar. | ✅ `ipDelVisitante()` única en `src/lib/registro.ts`. |
| B6 | En `/terminos`, el link a la política solo se distinguía por el color (accesibilidad). | ✅ Subrayado. |
| B7 | `dominios_excluidos` vacío: empleados pueden registrarse como referentes. | 📋 Tarea 7. |
| B8 | El repositorio es público y contiene los archivos de la fuente Satoshi, cuya licencia no permite distribuirlos. | 📋 Tarea 9. |

### Lo que ya estaba bien (revisado)

- RLS activo en todas las tablas; cada referente solo ve lo suyo y nada si está suspendido.
- Toda acción del super_admin se valida dos veces: en la Server Action (`verificarSuperAdmin`) y dentro de la función SQL (`es_super_admin()`), con `search_path` fijo.
- Validación con zod en el servidor en todos los formularios; nada de SQL armado a mano (todo por la API de Supabase / funciones con parámetros); React escapa el HTML y los correos escapan los nombres.
- CSRF: las Server Actions de Next.js comparan Origin y Host; las rutas GET no cambian datos (salvo el cron, que exige clave).
- Bucket `soportes-pagos` privado (5 MB, imagen o PDF), política de lectura solo para el dueño del pago y el super_admin, links firmados de 60 s. No existe bucket "marca" (las imágenes de marca están en `public/brand`).
- Mensajes de error genéricos hacia el público; el login no revela si un correo está registrado.
- Autorización de datos y términos guardados con versión y fecha (referentes y referidos; en referidos también IP y navegador).
- `.gitignore` cubre `.env*`, llaves `.pem`/`.key` y JSON de cuentas de servicio. **Historial de Git revisado completo: ningún secreto** (solo los valores de ejemplo de `.env.example`).
- **Bundle del navegador revisado** contra los valores reales de `.env.local` (sin imprimirlos): ningún secreto. Solo hay 3 variables `NEXT_PUBLIC_` (URL del sitio, URL de Supabase y la clave publicable), todas públicas por diseño.
- `npm audit`: 0 vulnerabilidades (producción y desarrollo).
- Advisors de Supabase: no tengo acceso a tu panel. Reproduje en las pruebas los avisos principales (RLS apagado, `search_path` variable, permisos de anon, funciones expuestas) y todos pasan. Revisa el Advisor después de ejecutar el SQL (tarea 1).

---

## c) Rutas, acciones y permisos

| Ruta / acción | Quién la puede usar | Dónde se valida |
|---|---|---|
| `/`, `/registro`, `/ingresar`, `/terminos`, `/politica-datos`, `/gracias`, `/auth/error` | Público | — (sin datos privados; `/gracias` solo muestra el nombre del plan) |
| `/r/[codigo]` | Público | Servidor busca el código con la clave secreta y solo devuelve el primer nombre del referente |
| `/confirmar/[token]` | Público con el link del correo | Token de 32 bytes; la base solo guarda su sha256 |
| `/auth/confirm` | Público (link mágico) | Supabase verifica el token; `next` solo a rutas internas |
| `/panel` | Referente con sesión | `proxy.ts` (filtro rápido) + `exigirUsuario()` + RLS |
| `/soporte/[pagoId]` | Dueño del pago o super_admin | RLS de `pagos` y política de Storage; link firmado de 60 s |
| `/admin`, `/admin/estado`, `/admin/reglas`, `/admin/referentes/[id]`, `/admin/referidos/[id]` | super_admin | `proxy.ts` + `exigirSuperAdmin()` (servidor) |
| `/admin/exportar` | super_admin | `verificarSuperAdmin()` → 403 |
| `/api/cruce` | Vercel Cron | `Authorization: Bearer CRON_SECRET` (tiempo constante) |
| `/api/salud` (nueva) | Monitor o super_admin | `Bearer SALUD_SECRET` o `CRON_SECRET`, o sesión de super_admin |
| Acción `registrarReferente` | Público | zod + celular + Turnstile + límite por IP + identidad (y otra vez en la base) |
| Acción `enviarLinkIngreso` | Público | zod + Turnstile + límite por IP + límite de Supabase |
| Acción `registrarReferido` | Público | zod + celular + Turnstile + límite por IP + `validar_nuevo_referido()` en la base |
| Acción `confirmarRegistro` | Público con token | `confirmar_referido()` en la base |
| Acción `cerrarSesion` | Con sesión | — |
| Acciones `actualizarCruce`, `editarReferido`, `volverAUsarHoja`, `cambiarSuspension`, `guardarReglas`, `agregarTelefonoBloqueado`, `quitarTelefonoBloqueado`, `prepararSoporte`, `registrarPago` | super_admin | `verificarSuperAdmin()` en el servidor **y** la función SQL verifica `es_super_admin()` (o RLS para los teléfonos bloqueados) |

Las Server Actions se pueden llamar directamente aunque el botón esté oculto: por eso cada una
verifica el rol en el servidor. Las pruebas de base de datos confirman que un referente que llama
las funciones de super_admin recibe "Solo un super_admin puede…".

---

## d) Arquitectura

```
   Navegador (PC / celular)
        │  HTTPS · cookies de sesión Secure/Lax · CSP
        ▼
 ┌─────────────────────── Vercel ────────────────────────┐
 │  Next.js 16 (App Router, Cache Components)             │
 │   • proxy.ts: renueva la sesión, protege /panel /admin  │
 │   • Páginas (servidor) y Server Actions                │
 │   • Rutas: /api/cruce (cron diario 6:00 a. m. COL),    │
 │     /api/salud, /admin/exportar, /soporte, /auth       │
 └───┬──────────────────┬─────────────────┬───────────────┘
     │ sesión del       │ clave secreta    │
     │ usuario (RLS)    │ (solo servidor)  │
     ▼                  ▼                  │
 ┌──────────── Supabase ────────────┐      │      ┌────────────────────┐
 │ Auth (link mágico / código)      │      ├─────▶│ Google Sheets API  │
 │ PostgreSQL: tablas + RLS +       │      │      │ (solo lectura, 1   │
 │  disparadores con TODAS las      │      │      │  lectura por cruce)│
 │  reglas del bono                 │      │      └────────────────────┘
 │ Storage: soportes-pagos (privado)│      │      ┌────────────────────┐
 └──────────────────────────────────┘      └─────▶│ SMTP (Gmail)       │
        ▲  subida directa del soporte             │ correos a          │
        └── (link firmado de un solo uso)         │ referentes/referidos│
   Navegador del super_admin                      └────────────────────┘
                                                  Cloudflare Turnstile
                                                  (anti-robots, opcional)
```

**Cómo se reparte el trabajo:** la **base de datos manda** (reglas del bono, duplicados,
auto-referidos, vigencia, permisos). El servidor de Next.js valida antes para dar mensajes claros,
lee la hoja y envía correos. El navegador solo muestra y envía formularios.

### Organización del código

- `src/app/**`: interfaz y Server Actions. `src/lib/**`: lógica y acceso a datos. `supabase/schema.sql`: modelo y reglas. La separación es clara.
- **Normalización de teléfono y correo**: existe en TypeScript (`src/lib/telefono.ts`, `src/lib/identidad.ts`) **y** en SQL. Es intencional (la base manda; la app da mensajes antes), los patrones de celular del SQL se **generan** desde la librería y ahora hay una **prueba de paridad** (`tests/bd-paridad.test.ts`) que confirma que ambos lados dan exactamente lo mismo.
- Duplicados menores (no urgentes): `leer(formData)` en 3 archivos de acciones y `primerNombre` en 2; `normalizarCorreo` vive en `telefono.ts`.

### Modelo de datos

Llaves primarias y foráneas correctas (`referidos → referentes / planes / pagos`, `on delete restrict` donde hay dinero), `check` en estados, formatos y montos, `unique` en código, correo del referente y token. Índices para las consultas frecuentes: identificadores (GIN), estado, `referente_id + created_at`, IP + fecha, revisión, pago, y los nuevos de intentos y ejecuciones. No encontré índices faltantes para el volumen esperado.

### Migraciones (propuesta — no lo hice)

Hoy todo está en un `schema.sql` que se puede volver a ejecutar. Funciona, pero no deja ver qué cambió entre versiones. Propuesta sin perder datos:

1. Instalar la CLI (`npx supabase init`, `npx supabase link`).
2. Crear `supabase/migrations/<fecha>_base.sql` con el `schema.sql` actual y marcarla como **ya aplicada** en producción (`npx supabase migration repair --status applied <fecha>`), sin ejecutarla.
3. Cada cambio futuro = un archivo nuevo en `supabase/migrations/`, probado primero con `npm test` (PGlite) y en la base de pruebas, y aplicado con `npx supabase db push`.
4. Mantener `schema.sql` como foto completa (o generarlo con `supabase db dump`).

¿Lo hacemos? Requiere tu token de Supabase y unos 30 minutos.

### Cruce con la hoja: ¿escala?

- **Una sola lectura** de todo el rango por cruce (la cuota de Google es 300 lecturas por minuto: sin riesgo).
- Los referidos se leen de a 1.000 y se guardan en lotes de 500, cada lote en una transacción con bloqueo.
- Con miles de filas cabe en los 60 s de Vercel (hoy: 183 filas en la hoja). Si algún día hay decenas de miles de referidos, conviene activar Fluid Compute (hasta 300 s) o dividir el cruce por partes.
- **Concurrencia**: ahora solo puede haber un cruce completo "en curso" (índice único en `ejecuciones_cruce` + bloqueo); el segundo queda "omitido".

### Operaciones atómicas

- **Pagos**: `registrar_pago()` es una sola transacción, bloquea las filas (`FOR UPDATE`) y valida que todas sigan "por pagar"; si falla, el servidor borra el soporte subido.
- **Cambios de estado**: siempre por disparadores o funciones SQL (una transacción por instrucción).
- **Cruce**: cada lote es atómico; el cruce completo no lo es (si falla a la mitad, los lotes guardados quedan bien y el siguiente cruce termina el resto: es idempotente).

### Fechas y zonas horarias

Todo se guarda como `timestamptz` (UTC) y se muestra en hora de Colombia (`America/Bogota`, en `src/lib/formato.ts` y en las comparaciones de fechas del SQL). La vigencia es `registro + 30 días`; la permanencia, `inicio de la racha ACTIVE + días configurados`. Las pruebas cubren día 29 (vigente) y día 31 (vencido), y permanencia de 29 y 31 días.

---

## e) Lighthouse

Medido en tu computador contra el build de producción, con el servidor de pruebas (sin base de
datos real). Celular = Moto G emulado con red lenta; PC = preset de escritorio.

| Página | Celular: rend. · acces. · b. prácticas · SEO | PC: rend. · acces. · b. prácticas · SEO | LCP celular | CLS |
|---|---|---|---|---|
| `/` (inicio) | **99 · 100 · 100 · 100** | 100 · 96\* · 100 · 100 | 0,8 s | 0 |
| `/registro` | **99 · 100 · 100 · 100** | 100 · 100 · 100 · 100 | 0,8 s | 0 |
| `/ingresar` | **100 · 100 · 100 · 100** | 100 · 100 · 100 · 100 | 0,8 s | 0 |
| `/gracias` | **99 · 100 · 100 · 66\*\*** | 100 · 100 · 100 · 66\*\* | 0,9 s | 0 |
| `/terminos` | 100 · 96\*\*\* · 100 · 100 | 100 · 96\*\*\* · 100 · 100 | 0,8 s | 0 |
| `/r/[código]` | 86 · 100 · 96 · 66\*\* (medida sin base: muestra el error) | 99 · 100 · 96 · 66\*\* | 3,9 s | 0 |
| `/panel`, `/admin` | No medibles sin una sesión de pruebas (redirigen a `/ingresar`). Se pueden medir con la base de pruebas (tarea 6). | | | |

\* Contraste: Lighthouse mide los textos de "Cómo funciona" mientras la sección todavía está
apareciendo (animación al hacer scroll). Con la animación terminada el contraste real es 6:1 (pasa AA).
\*\* SEO 66 es a propósito: `/gracias` y los links personales tienen `noindex` para no salir en Google.
\*\*\* Link solo por color: ya corregido (subrayado); no volví a medir.

Core Web Vitals: LCP < 1 s y CLS 0 en todas las páginas medidas; TBT ≤ 140 ms. Imágenes con
`next/image` (WebP/AVIF automáticos, `priority` solo en la mascota visible), Satoshi autoalojada con
`display: swap` y solo 3 pesos, animaciones que se apagan con "reducir movimiento" (probado),
botones deshabilitados con "Enviando…" mientras se envía, sin scroll horizontal de 360 a 1920 px
(probado en 6 páginas × 7 anchos).

---

## f) Resultados de las pruebas

| Comando | Resultado |
|---|---|
| `npm test` | **104 de 104 pasan**: 45 de celular e identidad (ya existían), 6 de seguridad, 4 de paridad app/base, 9 del esquema, 15 de permisos/RLS y 25 de reglas del bono (en PostgreSQL real en memoria). |
| `npm run test:e2e` | **45 pasan, 0 fallan**, 25 omitidas: 7 a propósito (anchos y teclado solo en PC) y 18 de flujos completos que esperan la base de pruebas (tarea 6). |
| `npm run lint` | Sin errores ni avisos. |
| `npm run build` | Correcto. |
| `npm run verificar` | 65 bien, 4 avisos (Turnstile, dominios excluidos, fecha de activación opcional y la Site URL de Supabase que no puede comparar sin token), 0 por corregir. Ojo: revisó tu base **actual**, que todavía no tiene el schema nuevo. |

**Qué cubren las pruebas de punta a punta pedidas (5.3):**

- Ya probado: acceso negado a `/panel` y `/admin` sin sesión, exportación y soportes sin sesión, cron sin clave, redirección abierta, cabeceras, registro de referente sin casillas, celulares falsos, teclado, reducir movimiento y tamaños de pantalla (PC y celular).
- Probado en la base (PGlite) y **escrito para el navegador** (corre cuando exista `.env.e2e`): registro de referente con autorización, referido con link válido y gracias, auto-referido (mismo correo, correo en Dropi, mismo celular), duplicado, cruce simulado, panel del referente sin ver el correo de su referido, referente bloqueado en `/admin`, suspensión.
- Pago con soporte, "Pagado ✓" y que otro referente no pueda abrir el soporte: **probado en la base** (RLS de `pagos` y de Storage). La prueba en navegador con subida de archivo queda pendiente para cuando exista la base de pruebas.
- Registro permitido de nuevo después de vencido y ya_cliente / posible_auto_referido: probados en la base.

---

## g) LISTA DE TAREAS PARA TI (en orden)

1. **Publicar y actualizar la base (hazlo en un momento de poco tráfico, todo seguido):**
   1. Revisa y une la rama `auditoria-produccion` a `main` en GitHub (Vercel publica solo).
   2. **Apenas termine la publicación**, abre Supabase → SQL Editor → New query, pega **todo** `supabase/schema.sql` → Run. (Entre el paso 1 y este, el panel del referente y el cruce fallan: por eso van seguidos.)
   3. En la terminal: `npm run verificar -- --produccion` y en la app `/admin/estado`. Debe decir 0 por corregir.
   4. Supabase → Advisors → Security Advisor: debería quedar sin errores. Si aparece algo, envíamelo.
2. **SMTP propio en Supabase Auth** (los links de acceso): Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP. Usa los mismos datos de `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` y remitente `notificaciones@atomapp.com.co`. Luego en Authentication → Rate Limits sube "emails per hour" (ej. 100).
3. **Turnstile** (gratis): Cloudflare → Turnstile → Add widget (dominio `referidos.atomsolutionsdata.com`). Copia la Site key y la Secret key a Vercel → Settings → Environment Variables (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) → Redeploy.
4. **Decidir el plan de Vercel**: Hobby no permite uso comercial. Recomiendo Pro (USD 20/mes): además da funciones de hasta 300 s y soporte.
5. **Copias de seguridad**: Supabase gratis no tiene. Opciones: (a) Supabase Pro (USD 25/mes, copias diarias de 7 días y sin pausa por inactividad), o (b) te preparo una copia semanal automática con GitHub Actions (`pg_dump` a un archivo privado). Dime cuál.
6. **Base de pruebas** para los flujos completos en navegador: (a) instala Docker Desktop y corre `npx supabase init` + `npx supabase start`, o (b) crea un segundo proyecto gratis en supabase.com solo para pruebas. Luego copia `.env.e2e.example` como `.env.e2e` y llénalo. **Avísame antes de que lo use**; nunca usaré la base de producción.
7. **Dominios excluidos**: `/admin/reglas` → escribe `atomsolutionsdata.com,atomapp.com.co` (y otros de empleados).
8. **Monitoreo** (gratis): crea en Vercel la variable `SALUD_SECRET` (genérala con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) y un monitor gratis que permita enviar el encabezado `Authorization` (por ejemplo Better Stack; revisa que tu plan lo incluya) que llame cada 5 min a `https://referidos.atomsolutionsdata.com/api/salud` con `Authorization: Bearer <SALUD_SECRET>`.
9. **Repositorio privado**: GitHub → Settings → General → Danger Zone → Change visibility → Private (la licencia de Satoshi no permite publicar sus archivos).
10. **Site URL de Supabase Auth**: Authentication → URL Configuration: Site URL `https://referidos.atomsolutionsdata.com` y en Redirect URLs `https://referidos.atomsolutionsdata.com/**`.
11. **Sentry (opcional, recomendado)**: plan gratis Developer (5.000 errores/mes). Necesito que crees una cuenta en sentry.io, un proyecto "Next.js" y me pases el DSN (es público) y un Auth Token (secreto, va solo en Vercel). Lo configuraría sin enviar datos personales (`sendDefaultPii: false`). **No lo instalé**: dime si lo hacemos.

---

## h) Recomendaciones después del lanzamiento

- **Primera semana**: revisa a diario el recuadro de estado en `/admin` (último cruce y fallas) y el monitor de `/api/salud`.
- **Planes gratis, qué vigilar**: Supabase Free pausa el proyecto tras 7 días sin actividad (el cron diario lo mantiene activo), 500 MB de base y 1 GB de Storage (≈ 3.000 soportes de 300 KB); Gmail envía hasta 500 correos/día (Workspace: 2.000); Vercel Hobby, 1 cron al día y 60 s por función.
- **Migraciones versionadas** (propuesta de la sección d) antes del siguiente cambio grande de la base.
- **Pruebas en cada cambio**: `npm test` antes de publicar; si falla una de `bd-reglas`, el cambio alteró el bono.
- **Correos a la bandeja de entrada**: configura SPF, DKIM y DMARC del dominio `atomapp.com.co` en tu proveedor de correo.
- **Política de datos**: define cuánto tiempo guardas los datos de referidos vencidos y "no aplica" (Ley 1581 pide no guardarlos más de lo necesario); se puede automatizar su anonimización.
- **Revisión periódica de accesos**: quién está en `super_admins` (Supabase → Table Editor) cada vez que alguien deje el equipo.
- **CSP más estricta**: hoy permite scripts en línea porque las páginas se preparan por adelantado. Cuando Next.js permita hashes automáticos con Cache Components, se puede cerrar más.
- `npm audit` y actualización de dependencias una vez al mes.
