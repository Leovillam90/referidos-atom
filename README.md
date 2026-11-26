# Referidos ATOM

App web para el programa de referidos de ATOM.

- **Referente**: se registra, recibe un link único `/r/CODIGO` y ve solo sus referidos.
- **Referido**: llega por el link y llena un formulario corto (sin login), con autorización de datos según la Ley 1581 de 2012.
- **Administrador**: ve todo, ve los referidos que no cruzaron con la hoja de afiliados y exporta reportes.

Cada referido se cruza con la Google Sheet de afiliados ATOM: primero por correo y, si no aparece, por teléfono normalizado. El resultado muestra si está activo en ATOM y con qué plan. Cada referido genera un **bono de pago único** para su referente, según la tabla `planes`.

---

## ¿Qué hay en este proyecto?

| Carpeta / archivo | Para qué sirve |
|---|---|
| `src/app/` | Las páginas de la app |
| `src/components/ui/` | Botones, tarjetas, tablas, etc. (shadcn/ui) |
| `src/lib/supabase/` | Conexión con la base de datos |
| `src/lib/telefono.ts` | Regla para limpiar teléfonos (quita espacios, guiones y +57) |
| `src/lib/config-hoja.ts` | Lee la configuración de la Google Sheet (solo en el servidor) |
| `src/lib/hoja-afiliados.ts` | Lee la Google Sheet de afiliados |
| `src/lib/cruce.ts` | Cruza los referidos con la hoja (correo → teléfono) |
| `src/app/admin/` | Panel del super_admin: referentes, referidos, edición, pagos y reportes |
| `src/lib/correo.ts` | Correos al referente (SMTP configurable) |
| `src/lib/config-programa.ts` | Enlaces de la página de gracias (Dropi, videos, WhatsApp) |
| `vercel.json` | Programa el cruce automático diario en Vercel |
| `supabase/schema.sql` | Tablas y reglas de seguridad de la base de datos |
| `.env.example` | Plantilla de las claves y ajustes que necesita la app |
| `.vscode/extensions.json` | Extensiones recomendadas para VS Code |

**Herramientas que usa:** Next.js (la app), Supabase (base de datos y login por link mágico al correo), Google Sheets API (lectura de afiliados), Vercel (publicación en internet).

---

## Paso 0 — Programas en tu computador

Necesitas tener instalados:

1. **Node.js** versión 20 o superior → https://nodejs.org (botón "LTS").
2. **Git** → https://git-scm.com
3. **VS Code** → https://code.visualstudio.com

Al abrir esta carpeta en VS Code aparecerá un aviso para instalar las extensiones recomendadas. Acéptalo (incluye el paquete de idioma español).

Para comprobar que todo está bien, abre la terminal de VS Code (menú **Terminal → Nueva terminal**) y escribe:

```
node -v
```

Debe mostrar un número como `v20...` o mayor.

---

## Paso 1 — Instalar las librerías del proyecto

En la terminal de VS Code, dentro de la carpeta del proyecto:

```
npm install
```

Esto descarga todo lo que la app necesita (carpeta `node_modules`). Solo se hace una vez, o cuando se agreguen librerías nuevas.

---

## Paso 2 — Crear la base de datos en Supabase

1. Entra a https://supabase.com y crea una cuenta.
2. Clic en **New project**. Ponle nombre (ej. `referidos-atom`), crea una contraseña segura para la base de datos (guárdala) y elige la región **South America (São Paulo)**.
3. Espera a que el proyecto termine de crearse (1–2 minutos).
4. En el menú izquierdo entra a **SQL Editor → New query**.
5. Abre el archivo `supabase/schema.sql` de este proyecto, copia **todo** su contenido, pégalo en Supabase y presiona **Run**.
6. Debe decir *Success*. En **Table Editor** verás las tablas `super_admins`, `referentes`, `planes`, `referidos`, `pagos` y `referidos_historial`. En **Storage** verás el bucket privado `soportes-pagos`.

> **¿Qué hace ese archivo?** Crea las tablas y activa el *Row Level Security*: reglas dentro de la base de datos que garantizan que cada referente solo vea sus propios registros, aunque alguien intente hacer trampa desde el navegador.

### Configurar el login por link mágico

1. En Supabase: **Authentication → Sign In / Providers → Email**. Verifica que esté activado.
2. **Authentication → URL Configuration**:
   - **Site URL**: `https://referidos-atom-pd9u.vercel.app` (la dirección pública en Vercel).
   - **Redirect URLs**: agrega `https://referidos-atom-pd9u.vercel.app/**` y `http://localhost:3000/**` (para probar en tu computador).
3. **Authentication → Emails → Templates**: cambia el link de dos plantillas para que el link mágico funcione aunque la persona lo abra en otro dispositivo (por ejemplo, pidió el link en el computador y lo abre en el celular).
   - En la plantilla **Magic link** reemplaza `{{ .ConfirmationURL }}` por:
     ```
     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/panel
     ```
   - En la plantilla **Confirm signup** haz el mismo reemplazo.
   - Si no lo cambias, el link solo funciona en el mismo navegador donde se pidió.
4. (Recomendado para producción) **Authentication → Emails → SMTP Settings**: configura un servicio de correo propio (ej. Resend, Brevo). El correo gratuito de Supabase tiene un límite muy bajo de envíos por hora.

---

## Paso 3 — Preparar la Google Sheet (cuenta de servicio)

Una *cuenta de servicio* es un "usuario robot" de Google que la app usa para leer la hoja. Sus credenciales viven solo en el servidor; nunca llegan al navegador.

1. Entra a https://console.cloud.google.com y crea un proyecto (ej. `referidos-atom`).
2. Busca **Google Sheets API** en la barra superior y presiona **Habilitar**.
3. Ve a **IAM y administración → Cuentas de servicio → Crear cuenta de servicio**. Ponle un nombre (ej. `lector-referidos`) y termina sin asignar roles.
4. Entra a la cuenta creada → pestaña **Claves → Agregar clave → Crear clave nueva → JSON**. Se descarga un archivo `.json`.
   - **Guárdalo en un lugar seguro y NO lo pongas dentro de la carpeta del proyecto.**
5. Abre tu Google Sheet de afiliados → botón **Compartir** → pega el correo de la cuenta de servicio (termina en `...iam.gserviceaccount.com`) con permiso **Lector**.
6. Revisa la hoja: la **primera fila** debe tener los títulos de las columnas (por ejemplo: `Correo`, `Telefono`, `Plan`). El valor del bono no sale de la hoja: sale de la tabla `planes`.

---

## Paso 4 — Crear el archivo `.env.local` (las claves)

1. En VS Code, copia el archivo `.env.example` y renombra la copia a **`.env.local`**.
2. Llena cada valor:

| Variable | Dónde la consigues |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` en tu computador; `https://referidos-atom-pd9u.vercel.app` en Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings → Data API** (Project URL) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → **Project Settings → API Keys** → *Publishable key* (o la antigua *anon*) |
| `SUPABASE_SECRET_KEY` | Mismo lugar → *Secret key* (o la antigua *service_role*). **Es secreta.** |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Campo `client_email` del archivo JSON |
| `GOOGLE_PRIVATE_KEY` | Campo `private_key` del JSON, entre comillas dobles, con los `\n` tal cual |
| `GOOGLE_SHEET_ID` | En la URL de la hoja: lo que va entre `/d/` y `/edit` |
| `GOOGLE_SHEET_RANGE` | Nombre de la pestaña con los afiliados (ej. `Afiliados`) |
| `SHEET_COL_CORREO`, `SHEET_COL_TELEFONO`, `SHEET_COL_PLAN` | Los títulos exactos de esas columnas en la hoja |
| `POLITICA_DATOS_VERSION` | Una etiqueta de la versión de tu política de datos (ej. `2026-11-v1`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Datos del correo `notificaciones@atomapp.com.co` que te da tu proveedor de correo. Sin `SMTP_HOST` no se envían correos |
| `LINK_DROPI_ATOM` | Link de registro en ATOM dentro de Dropi (paso 1 de la página de gracias) |
| `LINK_VIDEOS_ACTIVACION`, `WHATSAPP_CAPACITACION` | Videos y números de WhatsApp de la página de gracias (ya traen valores) |
| `POLITICA_DATOS_URL` | Link del documento oficial de la política de datos (PDF). El link del formulario lleva ahí. Vacía = página interna `/politica-datos` |
| `CRON_SECRET` | Una clave larga inventada por ti (ver cómo generarla en `.env.example`). Protege el cruce automático diario |

> **Importante:** `.env.local` **nunca** se sube a GitHub (ya está excluido en `.gitignore`). Si alguna vez una clave secreta se filtra, genérala de nuevo en Supabase o Google.

Si cambian los nombres de las columnas en la hoja, solo actualizas las variables `SHEET_COL_*`; no hay que tocar código.

---

## Paso 5 — Encender la app en tu computador

```
npm run dev
```

Abre http://localhost:3000 en el navegador. Para apagarla, en la terminal presiona `Ctrl + C`.

> Si cambias algo en `.env.local`, apaga la app (`Ctrl + C`) y vuelve a encenderla para que tome los cambios.

### Probar el registro de referentes

1. Entra a http://localhost:3000/registro y llena el formulario con tu correo real.
2. Abre el correo que te llega y haz clic en el link.
3. Debes quedar en **/panel**, con tu link `/r/CODIGO` y la tabla de referidos (vacía por ahora).
4. En Supabase → **Table Editor → referentes** debe aparecer tu fila con su código.

Páginas disponibles:

| Dirección | Qué es |
|---|---|
| `/registro` | Registro de referentes |
| `/ingresar` | Entrar con link mágico (para quien ya está registrado) |
| `/panel` | Panel del referente: su link y sus referidos (requiere sesión) |
| `/r/CODIGO` | Formulario público del referido (sin login) |
| `/politica-datos` | Política de tratamiento de datos que acepta el referido |
| `/gracias` | Página que ve el referido al terminar: 3 pasos para activarse |
| `/admin` | Panel del super_admin: referentes, referidos, pagos y reportes |

### Probar el formulario de referidos

1. Copia tu link desde **/panel** y ábrelo en una ventana de incógnito.
2. Llena el formulario con **otro** correo (el tuyo propio no se acepta), elige proveedor o marca y marca la autorización.
3. Debe aparecer el mensaje "¡Listo! Recibimos tus datos".
4. Vuelve a **/panel**: el referido aparece en la tabla. Aparece con su plan solicitado y el bono **estimado**. Si ya está en la hoja de afiliados, en unos segundos pasa a **Por pagar** (recarga la página). Al referente le llega un correo si configuraste el SMTP.
5. Si intentas registrar el mismo correo otra vez, el formulario avisa que ya está registrado.

> **Antes de publicar:** completa en `src/app/(acceso)/politica-datos/page.tsx` los datos reales de la empresa (correo de contacto, razón social) y haz revisar el texto. Si lo cambias, sube la versión en `POLITICA_DATOS_VERSION`.

---

## Paso 6 — Nombrar un super_admin

Solo el **super_admin** entra a `/admin`, edita referidos y registra pagos.

1. La persona debe iniciar sesión en la app una vez (para que exista su usuario).
2. En Supabase → **SQL Editor**, ejecuta (cambiando el correo):

```sql
insert into public.super_admins (user_id)
select id from auth.users where email = 'correo-del-super-admin@ejemplo.com';
```

> Si el super_admin no es referente, no puede usar `/registro`. Créalo en Supabase → **Authentication → Users → Add user → Send invitation** (o *Create new user*), ejecuta el SQL de arriba y entra por `/ingresar`.
>
> Si ya habías nombrado administradores con la versión anterior, no tienes que hacer nada: al ejecutar `schema.sql` la tabla `administradores` se renombra a `super_admins` con las mismas personas.

### Planes y bonos (tabla `planes`)

Se editan en Supabase → **Table Editor → planes**, sin tocar código:

| Columna | Para qué sirve |
|---|---|
| `nombre` | Cómo se ve en el formulario y los paneles (ej. *Plan Experto*) |
| `bono` | Valor del bono, **pago único por referido** |
| `alias` | Otros nombres con que el plan aparece en la Google Sheet, ej. `{"Experto mensual"}` |
| `activo` | `false` = deja de aparecer en el formulario |
| `orden` | Orden en el formulario |

Valores iniciales: Plan Escala $20.000 · Plan Experto $80.000 · Plan Control $100.000. Si cambias un bono, se recalculan los referidos que no están pagados ni editados a mano. Los ya pagados conservan el valor que se pagó.

El plan de la hoja se reconoce sin importar mayúsculas, tildes ni la palabra "Plan" (`EXPERTO`, `plan experto` y `Plan Experto` son lo mismo). Si la hoja trae un nombre distinto, agrégalo en `alias`.

### Estados del bono

| Estado | Cuándo |
|---|---|
| **Estimado** | Se registró pero aún no está activo en ATOM. Bono según el plan que le interesa |
| **Por pagar** | Está activo en ATOM (aparece en la hoja). Bono según el plan que tomó |
| **Pagado** | El super_admin registró el pago |
| **No aplica** | No se activó o el super_admin lo anuló (se marca a mano) |

### El panel del super_admin (`/admin`)

- **Por referente**: cada referente con sus totales (estimado, por pagar, pagado). Al entrar a uno puedes **registrar un pago**: eliges uno o varios referidos *por pagar*, la fecha, el valor (se sugiere la suma de los bonos), una nota opcional y el soporte (imagen o PDF de máximo 5 MB). El referente recibe un correo y ve el soporte en su panel.
- **Todos los referidos**, con filtros por estado y *sin cruce con la hoja*. Al entrar a uno puedes **editarlo a mano** (plan afiliado, activo, bono y estado). Desde ese momento el cruce con la hoja ya no lo cambia, hasta que presiones **Volver a usar la hoja**. Cada cambio queda en el **historial** con quién lo hizo y cuándo.
- **Exportar a Excel**: la vista que estés viendo, o todos los pagos.

Los referidos pagados no se pueden editar.

### Cómo funciona el cruce con la hoja

Cada referido se busca en la Google Sheet de afiliados, primero por **correo** y, si no aparece, por **teléfono** (los dos limpios: minúsculas, sin espacios, sin guiones y sin +57). Si aparece, queda **activo** con el plan de la hoja y su bono pasa a **Por pagar**. Si no aparece, sigue **Estimado** y sale en *Sin cruce*.

El cruce se hace:

1. Justo después de que alguien llena el formulario de referido.
2. Cuando el super_admin presiona **Actualizar cruce con la hoja**.
3. Automáticamente una vez al día (6:00 a. m. hora Colombia) cuando la app está en Vercel. Ver `vercel.json` y la variable `CRON_SECRET`.

El cruce **no cambia** los referidos pagados ni los editados a mano.

### Correos al referente

Se envían desde `notificaciones@atomapp.com.co` usando las variables `SMTP_*`:

- Cuando un referido se registra con su link: nombre, plan de interés y bono estimado.
- Cuando se registra un pago: valor, fecha y botón para ver el soporte en su panel.

> **Siempre que actualices el proyecto:** vuelve a ejecutar todo `supabase/schema.sql` en el SQL Editor. Se puede ejecutar varias veces sin problema y no borra datos.

### Revisar que todo esté bien configurado

Hay dos formas, y las dos revisan lo mismo:

- En la terminal: `npm run verificar`
- En la app: **/admin/estado** (solo super_admin; botón **Estado** en la barra de administración)

Muestran una lista con ✅ (bien), ⚠️ (aviso) o ❌ (por corregir) y **qué hacer** en cada caso:

- Variables de `.env.local`
- Conexión a Supabase con la clave publicable y con la secreta
- Tablas, funciones, reglas de seguridad y bucket privado de soportes
- Que haya un super_admin y los 3 planes con su bono
- Acceso a la Google Sheet: pestaña, columnas, cuántas filas leyó y qué planes de la hoja no coinciden
- Conexión SMTP (sin enviar ningún correo)
- Enlaces de la página de gracias
- Site URL de Supabase Auth
- Cruce diario

**Nunca muestra el valor de una clave.** Revisa la Site URL de Supabase Auth de forma automática solo si agregas el token opcional `SUPABASE_ACCESS_TOKEN` (ver `.env.example`); si no, te dice qué revisar a mano. En la terminal, el comando termina con código de error si hay algo ❌, así que también sirve antes de publicar.

---

## Paso 7 — Publicar en Vercel con dominio propio

1. Sube el proyecto a un repositorio **privado** en GitHub.
2. Entra a https://vercel.com, inicia sesión con GitHub → **Add New → Project** → elige el repositorio → **Deploy**.
3. En Vercel → tu proyecto → **Settings → Environment Variables**: agrega las mismas variables de `.env.local`, pero con `NEXT_PUBLIC_SITE_URL` = `https://referidos-atom-pd9u.vercel.app` (o tu dominio propio, si lo configuras). Para `GOOGLE_PRIVATE_KEY` pega el valor sin las comillas externas.
4. **Settings → Domains** → agrega tu dominio y crea en tu proveedor de dominio el registro DNS que Vercel te indique.
5. Vuelve a Supabase → **Authentication → URL Configuration**: *Site URL* = `https://referidos-atom-pd9u.vercel.app`; *Redirect URLs* = `https://referidos-atom-pd9u.vercel.app/**` y `http://localhost:3000/**`. Si luego agregas un dominio propio, cámbialo en los dos lugares (Vercel y Supabase).
6. En Vercel → **Deployments** → **Redeploy** para que tome las variables.

---

## Seguridad: resumen

- **Row Level Security** activado en todas las tablas: un referente solo ve su perfil, sus referidos y sus pagos; el super_admin ve todo.
- Editar referidos y registrar pagos solo se puede con funciones de la base de datos que verifican que quien llama es super_admin, y cada cambio queda en el historial.
- Los soportes de pago están en un bucket **privado**. Se abren con links temporales firmados (60 segundos) y un referente solo puede abrir los de sus propios pagos.
- Los referidos (visitantes sin sesión) nunca ven el valor de los bonos.
- Los visitantes sin login **no** pueden leer ni escribir en la base de datos directamente. El formulario de referidos lo guarda el servidor después de validar los datos.
- Un referente solo puede modificar su nombre, teléfono y cuenta Dropi (nunca su código ni su correo).
- La Google Sheet se lee solo desde el servidor, con permiso de **solo lectura**.
- Por cada referido se guarda la prueba de la autorización de datos (fecha, versión de la política, IP y navegador), como exige la Ley 1581 de 2012.
- Un mismo correo solo puede ser referido una vez.

---

## Hoja de ruta

- [x] **Fase 1** — Proyecto base, esquema de base de datos, configuración y documentación.
- [x] **Fase 2** — Registro e inicio de sesión de referentes (link mágico) y panel del referente.
- [x] **Fase 3** — Formulario público `/r/CODIGO` con autorización de datos.
- [x] **Fase 4** — Cruce con la Google Sheet (correo → teléfono).
- [x] **Fase 5** — Panel de administrador, referidos sin cruce y exportación de reportes.
- [x] **Ajustes** — Rol super_admin, planes y bonos, estados del bono, edición manual con historial, pagos con soporte, página de gracias y correos.
- [ ] **Fase 6** — Publicación en Vercel con dominio propio.
