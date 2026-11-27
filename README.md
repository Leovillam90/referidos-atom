# Referidos ATOM

App web para el programa de referidos de ATOM.

- **Referente**: se registra, recibe un link único `/r/CODIGO` y ve solo sus referidos.
- **Referido**: llega por el link y llena un formulario corto (sin login), con autorización de datos según la Ley 1581 de 2012.
- **Administrador**: ve todo, ve los referidos que no cruzaron con la hoja de afiliados y exporta reportes.

Cada referido se cruza con la Google Sheet de afiliados ATOM: primero por correo y, si no aparece, por celular (en el [formato estándar](#celular)). El resultado muestra si está activo en ATOM (columna `ESTADO MANUAL` = `ACTIVE`) y con qué plan. Cada referido genera un **bono de pago único** para su referente, según la tabla `planes` y las [reglas del programa](#reglas-del-programa).

---

## ¿Qué hay en este proyecto?

| Carpeta / archivo | Para qué sirve |
|---|---|
| `src/app/` | Las páginas de la app |
| `src/components/ui/` | Botones, tarjetas, tablas, etc. (shadcn/ui) |
| `src/lib/supabase/` | Conexión con la base de datos |
| `src/lib/telefono.ts` | **Celular**: una sola función para validar y normalizar (libphonenumber-js), países, números falsos, formato en pantalla y WhatsApp |
| `src/lib/telefono-sql.ts` | Genera los patrones de celular por país que usa la base de datos (`npm run generar-sql-telefono`) |
| `src/lib/config-hoja.ts` | Lee la configuración de la Google Sheet (solo en el servidor) |
| `src/lib/hoja-afiliados.ts` | Lee la Google Sheet de afiliados |
| `src/lib/cruce.ts` | Cruza los referidos con la hoja (correo → teléfono) y revisa vencimientos |
| `src/lib/identidad.ts` | Regla de "la misma persona" (correo, teléfono o cuenta Dropi) |
| `src/lib/reglas.ts` | Lee las reglas del programa (tabla `reglas_programa`) |
| `src/lib/turnstile.ts` | Verificación anti-robots de Cloudflare Turnstile (opcional) |
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
6. Debe decir *Success*. En **Table Editor** verás las tablas `super_admins`, `reglas_programa`, `reglas_historial`, `referentes`, `referentes_historial`, `planes`, `referidos`, `pagos`, `referidos_historial` y `registros_intentos`. En **Storage** verás el bucket privado `soportes-pagos`.

> **¿Qué hace ese archivo?** Crea las tablas y activa el *Row Level Security*: reglas dentro de la base de datos que garantizan que cada referente solo vea sus propios registros, aunque alguien intente hacer trampa desde el navegador.

### Configurar el login por link mágico

1. En Supabase: **Authentication → Sign In / Providers → Email**. Verifica que esté activado.
2. **Authentication → URL Configuration**:
   - **Site URL**: `https://referidos.atomsolutionsdata.com` (el dominio propio, conectado en Vercel).
   - **Redirect URLs**: agrega `https://referidos.atomsolutionsdata.com/**` y `http://localhost:3000/**` (para probar en tu computador).
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
6. Revisa la hoja: la **primera fila** debe tener los títulos de las columnas (por ejemplo: `Correo`, `Telefono`, `Plan`, `ESTADO MANUAL`). El valor del bono no sale de la hoja: sale de la tabla `planes`.
   - Solo cuenta como **activo** quien tenga en la columna de estado el valor `ACTIVE` (se puede cambiar con `SHEET_VALOR_ACTIVO`). `INACTIVE` o `CANCELED` aparecen en la hoja pero no están activos.
   - (Opcional) Si la hoja tiene una columna con la **fecha en que se activó** cada afiliado, escribe su título en `SHEET_COL_FECHA_ACTIVACION`. Si no, la app usa la fecha en que el cruce vio por primera vez el estado activo.

---

## Paso 4 — Crear el archivo `.env.local` (las claves)

1. En VS Code, copia el archivo `.env.example` y renombra la copia a **`.env.local`**.
2. Llena cada valor:

| Variable | Dónde la consigues |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` en tu computador; `https://referidos.atomsolutionsdata.com` en Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings → Data API** (Project URL) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → **Project Settings → API Keys** → *Publishable key* (o la antigua *anon*) |
| `SUPABASE_SECRET_KEY` | Mismo lugar → *Secret key* (o la antigua *service_role*). **Es secreta.** |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Campo `client_email` del archivo JSON |
| `GOOGLE_PRIVATE_KEY` | Campo `private_key` del JSON, entre comillas dobles, con los `\n` tal cual |
| `GOOGLE_SHEET_ID` | En la URL de la hoja: lo que va entre `/d/` y `/edit` |
| `GOOGLE_SHEET_RANGE` | Nombre de la pestaña con los afiliados (ej. `Afiliados`) |
| `SHEET_COL_CORREO`, `SHEET_COL_TELEFONO`, `SHEET_COL_PLAN`, `SHEET_COL_ESTADO` | Los títulos exactos de esas columnas en la hoja (estado: `ESTADO MANUAL`) |
| `SHEET_VALOR_ACTIVO` | (Opcional) El valor de la columna de estado que significa activo. Si queda vacía: `ACTIVE` |
| `SHEET_COL_FECHA_ACTIVACION` | (Opcional) Título de la columna con la fecha de activación |
| `POLITICA_DATOS_VERSION` | Una etiqueta de la versión de tu política de datos (ej. `2026-11-v1`) |
| `TERMINOS_VERSION` | Una etiqueta de la versión de los términos del programa (`/terminos`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | (Opcional) Claves de Cloudflare Turnstile para frenar robots. Sin ellas los formularios funcionan igual |
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
| `/politica-datos` | Política de tratamiento de datos que aceptan referentes y referidos |
| `/terminos` | Términos del programa que acepta el referente (texto base con marcas **[POR REVISAR]** para el equipo legal) |
| `/confirmar/...` | Donde el referido confirma quién lo invitó (solo si la confirmación por correo está activa) |
| `/gracias` | Página que ve el referido al terminar: 3 pasos para activarse |
| `/admin` | Panel del super_admin: referentes, referidos, pagos y reportes |
| `/admin/reglas` | Reglas del programa (vigencia, permanencia, confirmación, dominios excluidos, límite por hora) |

### Probar el formulario de referidos

1. Copia tu link desde **/panel** y ábrelo en una ventana de incógnito.
2. Llena el formulario con **otro** correo (el tuyo propio no se acepta), elige proveedor o marca y marca la autorización.
3. Debe aparecer el mensaje "¡Listo! Recibimos tus datos".
4. Vuelve a **/panel**: el referido aparece en la tabla. Aparece con su plan solicitado y el bono **estimado**. Si ya está en la hoja de afiliados, en unos segundos pasa a **Por pagar** (recarga la página). Al referente le llega un correo si configuraste el SMTP.
5. Si intentas registrar a la misma persona otra vez (mismo correo, teléfono o cuenta Dropi), el formulario dice *"Ya estás registrado en el programa; si tienes dudas escríbenos por WhatsApp"*.

> **Antes de publicar:** completa en `src/app/(acceso)/politica-datos/page.tsx` los datos reales de la empresa (correo de contacto, razón social) y haz revisar el texto. Si lo cambias, sube la versión en `POLITICA_DATOS_VERSION`. Haz lo mismo con `src/app/(acceso)/terminos/page.tsx` (busca **[POR REVISAR]**) y `TERMINOS_VERSION`.

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
| **Pendiente de confirmación** | Se registró, pero falta que confirme por correo (solo si esa regla está activa). Todavía no cuenta |
| **Estimado** | Registro vigente, aún no activo en ATOM. Bono según el plan que le interesa. El referente ve "vence en N días" |
| **En verificación** | Se activó en ATOM dentro del plazo: el bono ya quedó **fijo**, y está cumpliendo los días de permanencia. Se ve la fecha en que pasa a *por pagar* |
| **Por pagar** | Cumplió la permanencia. Hay que pagarle al referente |
| **Pagado** | El super_admin registró el pago |
| **Vencido** | Pasó el plazo sin activarse. Bono 0 y la persona queda libre |
| **Ya era cliente** | Ya estaba en la hoja de afiliados al registrarse. Bono 0 |
| **No aplica** | El referente está suspendido, o el super_admin lo anuló |

### Reglas del programa

Se configuran en **/admin/reglas** (o en Supabase → **Table Editor → reglas_programa**, una sola fila). Ningún valor está fijo en el código: la base de datos las aplica y la app solo las lee.

| Regla | Valor inicial | Qué hace |
|---|---|---|
| `dias_vigencia_registro` | 30 | Días que tiene el referido para activarse |
| `dias_permanencia_para_pagar` | 30 | Días que debe seguir activo antes de pagar (0 = se paga apenas se activa) |
| `confirmacion_referido_por_correo` | No | Si el referido debe confirmar por correo quién lo invitó |
| `dominios_excluidos` | (vacío) | Dominios de correo que no pueden ser referentes, ej. `atomsolutionsdata.com,atomapp.com.co` |
| `max_registros_por_link_por_hora` | 10 | Límite de registros por link y por conexión (IP) en una hora |

Cada cambio de reglas queda en un historial (también los hechos desde el Table Editor) y los referidos en curso se recalculan. La vigencia nueva aplica a los registros que se hagan desde ese momento.

**Las reglas, en lenguaje sencillo:**

1. **La misma persona.** Cada persona tiene un conjunto de identificadores: su correo, su teléfono y su cuenta Dropi. Dos personas son la misma si **cualquier** identificador de una coincide con **cualquiera** de la otra, sin importar el campo (el correo escrito como cuenta Dropi, o el teléfono escrito como cuenta Dropi, también cuentan). Todo lo que parece correo se compara en minúsculas y sin espacios (en Gmail no cuentan los puntos ni lo que va después de `+`); los celulares, en el [formato estándar](#celular) (`573104827756`); la cuenta Dropi, sin mayúsculas ni espacios. Respuestas como "no tengo" en la cuenta Dropi no cuentan. Los identificadores se guardan en la base (columnas `identificadores` con índice) y la comparación se hace allí.
2. **No auto-referirse.** Un referente no puede registrarse en su propio link con su correo, teléfono o cuenta Dropi, en ningún campo. Si el referente cambia su teléfono o su cuenta Dropi, los anteriores siguen contando. El visitante ve un mensaje amable que no revela los datos del referente. Si los datos coinciden con **otro** referente, el registro se guarda marcado como «también es referente» para que lo revises.
   - **En el cruce con la hoja (la capa más importante):** si el `buyer_email` o el `TELEFONO` de la fila del afiliado coincide con cualquier identificador del referente, el referido queda como **Posible auto-referido**: bono 0, aviso en /admin, y no pasa a *por pagar*. Si esa misma fila de la hoja ya generó bono con otro referido, queda como **Afiliado ya bonificado** (sin bono doble). Ambos se resuelven con una excepción manual (con motivo).
   - **Un solo referente por persona:** no se puede crear una segunda cuenta de referente con el correo, el teléfono o la cuenta Dropi de otro referente.
3. **Sin duplicados.** Una persona solo puede tener un registro vigente en todo el programa, con cualquier referente. Si lo intenta de nuevo ve: *"Ya estás registrado en el programa; si tienes dudas escríbenos por WhatsApp"*.
4. **Vigencia.** El registro es del primer referente durante los días de vigencia. Si en ese plazo no se activa, pasa a *vencido* (bono 0) y la persona queda libre: el mismo referente u otro la pueden registrar con un plazo nuevo. Los vencimientos se revisan en el cruce diario y con el botón **Actualizar cruce**. Para no perjudicar a nadie por el cruce diario, un registro solo vence después de un cruce posterior al plazo, y una activación que el cruce ve por primera vez justo después del plazo se acepta si el cruce anterior fue dentro del plazo.
5. **Ya era cliente.** Si al registrarse la persona ya aparece en la hoja (con cualquier estado), queda como *ya era cliente* con bono 0 y el super_admin ve un aviso en /admin. Si la hoja tiene fecha de activación anterior al registro, pasa lo mismo.
6. **Activación después del registro.** El bono solo aplica si la activación ocurre después del registro y dentro de la vigencia. Se usa la columna `SHEET_COL_FECHA_ACTIVACION` si existe; si no, la fecha en que el cruce vio por primera vez `ACTIVE` (se guarda en `fecha_activacion_detectada`).
7. **Permanencia.** Al activarse pasa a *en verificación*. Cuando cumple los días de permanencia sin dejar de estar `ACTIVE`, pasa a *por pagar* (y ahí se queda). Si deja de estar activo antes, vuelve a *estimado*; si se vuelve a activar, la permanencia empieza de nuevo.
8. **Bono único y fijo.** Se fija con el plan que tenga al activarse y no se recalcula si cambia de plan, cancela o se vuelve a activar, ni si cambias el bono del plan después. Una persona genera bono una sola vez en la vida del programa.
9. **Confirmación por correo** (si está activa). El referido recibe un correo de `notificaciones@atomapp.com.co` para confirmar que lo invitó ese referente. Mientras no confirme queda *pendiente* y no ocupa a la persona: otro referente la puede registrar, y gana quien confirme primero. El plazo de vigencia empieza al confirmar. Si no confirma en los días de vigencia, vence.
10. **Anti-abuso.** Máximo de registros por hora por link y por IP. Verificación anti-robots con Cloudflare Turnstile si configuras sus dos claves. Si no, los formularios funcionan igual y la verificación lo muestra como aviso. Además, un campo trampa invisible.
11. **Exclusiones.** Los correos de los dominios excluidos no pueden registrarse como referentes.
12. **Suspensión.** El super_admin puede suspender a un referente desde su página en /admin, con motivo. Suspendido: no ve su panel, su link muestra *"Este link no está disponible"* y sus bonos no pagados pasan a *no aplica*. Mientras tanto sus referidos quedan libres. Al reactivarlo, sus referidos vuelven a seguir las reglas, salvo los que mientras tanto registró otro referente, que quedan vencidos. Todo queda en el historial.
13. **Términos.** El referente debe aceptar los términos del programa (`/terminos`) al registrarse. Se guardan la versión (`TERMINOS_VERSION`) y la fecha.
14. **Celular válido.** Ver [Celular](#celular): solo celulares reales de la lista de países, sin números falsos ni bloqueados. Si un mismo celular aparece en 3 o más registros, se marca como sospechoso en /admin (no se bloquea).

### Celular

Las mismas reglas en el registro de referentes y de referidos. Se validan en el navegador (para avisar rápido), en el servidor y en la base de datos (para que no se puedan saltar). Las reglas por país **no se programan a mano**: salen de la librería [libphonenumber-js](https://www.npmjs.com/package/libphonenumber-js) (metadata "max").

- **Países**: selector con bandera, nombre e indicativo. Colombia (+57) por defecto y primero; luego Argentina, Bolivia, Brasil, Chile, Costa Rica, Cuba, Ecuador, El Salvador, España, Estados Unidos, Guatemala, Honduras, México, Nicaragua, Panamá, Paraguay, Perú, Puerto Rico, República Dominicana, Uruguay y Venezuela.
- **Lo que escriba la persona** sirve: espacios, guiones, paréntesis, `+`, `00` o el indicativo. Si pega un número con `+` de otro país (ej. `+56 9 …`), el selector cambia solo a ese país. El ejemplo del campo cambia según el país (Colombia: `310 482 7756`).
- **Formato estándar** (en la base, el cruce, la identidad, Excel y WhatsApp): E.164 **sin** el `+`, solo dígitos. Colombia `573104827756`, México `525548273956`, Argentina `5491148273956` (el 9 de celular se agrega solo). El país (CO, MX, AR…) se guarda en la columna `telefono_pais`. En pantalla se ve legible: `+57 310 482 7756`. WhatsApp: `wa.me/573104827756`. En Excel salen las columnas **País** y **Celular**.
- **Se rechaza** con el mensaje *"Escribe un celular válido de [país], por ejemplo [ejemplo]"* si:
  - no es un número válido para el país, o es un **fijo** (se aceptan los tipos celular y "fijo o celular", como en Estados Unidos);
  - es **falso** (se mira el número sin indicativo): el mismo dígito 7 o más veces seguidas; el mismo dígito en el 80 % o más de las posiciones; una secuencia de 6 o más dígitos (`123456`, `987654`); o un patrón repetido (`3003003003`, `3121212121`, `3123123123`);
  - está en la lista de **números bloqueados** (tabla `telefonos_bloqueados`, se edita en **/admin/reglas**). Valores iniciales: 573000000000, 573001234567, 573111111111, 573123456789, 573333333333 y 573999999999.
- **Celulares sospechosos**: si un mismo celular aparece en 3 o más registros (referentes o referidos, vigentes o vencidos), aparece en /admin en «Celulares sospechosos» y con un aviso en la página del registro. No se bloquea.
- **Hoja de afiliados** (columna `TELEFONO`): se normaliza con la misma función. Si trae indicativo (con o sin `+`), se detecta el país; si no, se toma como Colombia. Un teléfono inválido no hace fallar el cruce: se ignora, la fila se cruza por `buyer_email` y se cuenta en el mensaje del cruce.
- **Datos que ya estaban**: al ejecutar `supabase/schema.sql` los celulares guardados pasan al formato estándar (sin indicativo = Colombia). No se borra ni se rechaza ninguno. Para ver los inválidos, fijos, falsos, bloqueados o sospechosos: `npm run reporte-telefonos` (solo lee).
- **Si actualizas libphonenumber-js**: corre `npm run generar-sql-telefono` (actualiza los patrones por país dentro de `supabase/schema.sql`) y vuelve a ejecutar el SQL. `npm test` avisa si quedaron desactualizados.

> Ojo con los ejemplos que parecen reales pero son secuencias: `55 1234 5678` (México), `11 2345 6789` (Argentina) o `+56 9 8765 4321` (Chile) se rechazan porque contienen 12345678, 23456789 o 98765432.

**Excepciones.** El super_admin puede hacer una excepción a cualquier regla desde la página del referido: cambiar estado, bono, plan, si está activo o la fecha de vencimiento. Escribe un motivo obligatorio, que queda en el historial, y el referido queda marcado como *editado a mano*, así que las reglas y el cruce dejan de cambiarlo. La única restricción es que no puede dejar a una persona con dos registros vigentes a la vez. Para liberar a una persona, marca su registro como *vencido*.

Todas las reglas se validan en la base de datos (funciones y disparadores de `supabase/schema.sql`), además de en el servidor de la app. Aunque alguien se salte la página, no las puede evitar.

### El panel del super_admin (`/admin`)

- **Por referente**: cada referente con sus totales (estimado, por pagar, pagado). Al entrar a uno puedes **registrar un pago**: eliges uno o varios referidos *por pagar*, la fecha, el valor (se sugiere la suma de los bonos), una nota opcional y el soporte (imagen o PDF de máximo 5 MB). El referente recibe un correo y ve el soporte en su panel.
- **Por referente**, con filtro **Suspendidos**. En la página de cada referente puedes **suspenderlo o reactivarlo** (con motivo) y ver ese historial.
- **Todos los referidos**, con filtros por cada estado (incluidos *vencido*, *ya era cliente*, *en verificación* y *pendiente de confirmación*) y *sin cruce con la hoja*. Al entrar a uno puedes hacer una **excepción manual**, con motivo obligatorio. Desde ese momento las reglas y el cruce ya no lo cambian, hasta que presiones **Volver a seguir las reglas**. Cada cambio queda en el **historial** con quién lo hizo, cuándo y por qué.
- **Aviso de clientes existentes**: si en los últimos 30 días se registraron personas que ya eran clientes, aparece un aviso con el link para revisarlas.
- **Reglas** (botón en la barra): los valores de las reglas del programa, su historial y la lista de **números de celular bloqueados** (agregar y quitar).
- **Celulares sospechosos**: los celulares que aparecen en 3 o más registros, con el link a cada uno.
- El celular de cada referente y referido se ve como `+57 310 482 7756` y abre WhatsApp.
- **Exportar a Excel**: la vista que estés viendo, o todos los pagos.

Los referidos pagados no se pueden editar.

### Cómo funciona el cruce con la hoja

Cada referido se busca en la Google Sheet de afiliados, primero por **correo** y, si no aparece, por **celular** (en el formato estándar; los `TELEFONO` inválidos de la hoja se ignoran y se cuentan), con la regla de "la misma persona". Se guarda si aparece en la hoja, si está activo (`ESTADO MANUAL` = `ACTIVE`), el plan y la fecha de activación. Con eso la base de datos aplica las [reglas del programa](#reglas-del-programa): ya cliente, vigencia, permanencia y bono fijo.

El cruce se hace:

1. Justo después de que alguien llena el formulario de referido.
2. Cuando el super_admin presiona **Actualizar cruce con la hoja**.
3. Automáticamente una vez al día (6:00 a. m. hora Colombia) cuando la app está en Vercel. Ver `vercel.json` y la variable `CRON_SECRET`.

El cruce **no cambia** los referidos pagados, vencidos, ya clientes ni los editados a mano. Después del cruce diario y del botón se revisan los vencimientos y las permanencias cumplidas.

### Correos al referente

Se envían desde `notificaciones@atomapp.com.co` usando las variables `SMTP_*`:

- Cuando un referido se registra con su link (o cuando confirma, si la confirmación está activa): nombre, plan de interés, bono estimado y el plazo para activarse. Si ya era cliente, se lo dice.
- Al referido, si la confirmación por correo está activa: link para confirmar quién lo invitó.
- Cuando se registra un pago: valor, fecha y botón para ver el soporte en su panel.

> **Siempre que actualices el proyecto:** vuelve a ejecutar todo `supabase/schema.sql` en el SQL Editor. Se puede ejecutar varias veces sin problema y no borra datos.

### Revisar que todo esté bien configurado

Hay dos formas, y las dos revisan lo mismo:

- En la terminal: `npm run verificar` (con `npm run verificar -- --produccion` revisa además que `NEXT_PUBLIC_SITE_URL` sea `https://referidos.atomsolutionsdata.com`, como se exige en producción)
- Pruebas de la regla de identidad y del celular: `npm test` (app) y `supabase/pruebas-identidad.sql` en el SQL Editor (base de datos; deshace todo al terminar)
- Reporte de los celulares ya guardados (inválidos, fijos, falsos, bloqueados y sospechosos): `npm run reporte-telefonos` (solo lee)
- Reporte de registros existentes que la regla de identidad habría bloqueado: `npm run reporte-identidades` (incluye la hoja; solo lee) o `supabase/reporte-identidades.sql`
- En la app: **/admin/estado** (solo super_admin; botón **Estado** en la barra de administración)

Muestran una lista con ✅ (bien), ⚠️ (aviso) o ❌ (por corregir) y **qué hacer** en cada caso:

- Variables de `.env.local`
- Conexión a Supabase con la clave publicable y con la secreta
- Tablas, columnas, funciones, reglas de seguridad y bucket privado de soportes
- **Reglas del celular**: los casos de prueba en la app y **los mismos en la base de datos** (deben dar igual), que los patrones por país de `schema.sql` estén al día, la lista de bloqueados, celulares sin convertir y cuántos celulares sospechosos hay
- Que `NEXT_PUBLIC_SITE_URL` sea `https://referidos.atomsolutionsdata.com` en producción (en Vercel lo revisa solo)
- Que haya un super_admin, los 3 planes con su bono y las reglas del programa (avisa si no hay dominios excluidos o si la confirmación por correo está activa sin SMTP)
- Acceso a la Google Sheet: pestaña, columnas (incluida la de estado), cuántos afiliados están activos, la columna opcional de fecha y qué planes de la hoja no coinciden
- Cloudflare Turnstile (aviso si no está configurado)
- Conexión SMTP (sin enviar ningún correo)
- Enlaces de la página de gracias
- Site URL de Supabase Auth
- Cruce diario

**Nunca muestra el valor de una clave.** Revisa la Site URL de Supabase Auth de forma automática solo si agregas el token opcional `SUPABASE_ACCESS_TOKEN` (ver `.env.example`); si no, te dice qué revisar a mano. En la terminal, el comando termina con código de error si hay algo ❌, así que también sirve antes de publicar.

---

## Paso 7 — Publicar en Vercel con dominio propio

1. Sube el proyecto a un repositorio **privado** en GitHub.
2. Entra a https://vercel.com, inicia sesión con GitHub → **Add New → Project** → elige el repositorio → **Deploy**.
3. En Vercel → tu proyecto → **Settings → Environment Variables**: agrega las mismas variables de `.env.local`, pero con `NEXT_PUBLIC_SITE_URL` = `https://referidos.atomsolutionsdata.com`. Para `GOOGLE_PRIVATE_KEY` pega el valor sin las comillas externas.
4. **Settings → Domains** → agrega tu dominio y crea en tu proveedor de dominio el registro DNS que Vercel te indique.
5. Vuelve a Supabase → **Authentication → URL Configuration**: *Site URL* = `https://referidos.atomsolutionsdata.com`; *Redirect URLs* = `https://referidos.atomsolutionsdata.com/**` y `http://localhost:3000/**`. Si algún día cambias el dominio, cámbialo en los dos lugares (Vercel y Supabase).
6. En Vercel → **Deployments** → **Redeploy** para que tome las variables.

---

## Identidad de marca (ATOM Solutions Data)

- **Colores** (clases de Tailwind en `src/app/globals.css`): `dark-gunmetal` #1D2935 (fondo),
  `sea-green` #0DE8C0 (acento y botón principal), `silver-lake-blue` #6884C5 (botón secundario),
  `steel-pink` #C81FDA. Degradado de marca: `linea-degradado` y `subrayado-degradado`.
- **Estados del bono:** Estimado (azul), Por pagar (rosa), Pagado ✓ (verde), No aplica (gris).
  Los contrastes están revisados para WCAG AA (comentarios en `globals.css` y `components/ui/badge.tsx`).
  Nunca pongas texto blanco sobre el verde: no se lee.
- **Tipografía:** Satoshi, autoalojada en `src/fonts/satoshi/`. Su licencia (`LICENCIA-FFL.txt`)
  **no permite publicar los archivos de la fuente**: este repositorio debe seguir siendo **privado**.
- **Logos:** `public/brand/` (copiados del manual de marca, sin deformar). Favicon e íconos del
  celular: `src/app/favicon.ico`, `icon.png`, `apple-icon.png` y `public/brand/icono-*.png`.
- **Mascota:** `public/brand/mascota.webp` (965×1200, ~100 KB) y `mascota.png` de respaldo. Componente
  `src/components/mascota.tsx` (entrada con rebote, flotación, halo, parallax en PC y saludo al pasar por
  "Quiero ser referente"). Todas las animaciones son CSS y se apagan con "reducir movimiento" del sistema.
- **Bonos del inicio:** se leen de la tabla `planes` y se guardan en caché 1 hora (`bonosPublicos` en
  `src/lib/planes.ts`).
- **Correos:** los de la app están en `src/lib/correo.ts`; las plantillas para Supabase Auth
  (Magic link y Confirm signup) están en `emails/` con instrucciones para pegarlas.

---

## Seguridad: resumen

- **Row Level Security** activado en todas las tablas: un referente solo ve su perfil, sus referidos y sus pagos; el super_admin ve todo.
- Editar referidos y registrar pagos solo se puede con funciones de la base de datos que verifican que quien llama es super_admin, y cada cambio queda en el historial.
- Los soportes de pago están en un bucket **privado**. Se abren con links temporales firmados (60 segundos) y un referente solo puede abrir los de sus propios pagos.
- Los referidos (visitantes sin sesión) nunca ven el valor de los bonos.
- Los visitantes sin login **no** pueden leer ni escribir en la base de datos directamente. El formulario de referidos lo guarda el servidor después de validar los datos.
- Un referente solo puede modificar su nombre, celular (con las mismas reglas) y cuenta Dropi (nunca su código ni su correo).
- La Google Sheet se lee solo desde el servidor, con permiso de **solo lectura**.
- Por cada referido se guarda la prueba de la autorización de datos (fecha, versión de la política, IP y navegador), como exige la Ley 1581 de 2012. Por cada referente, la versión y fecha de la política y de los términos que aceptó.
- Los referentes no pueden ver la IP, el navegador ni el token de confirmación de sus referidos (permisos por columna).
- Un referente suspendido no puede ver sus referidos, pagos ni soportes (lo impide la base de datos, no solo la página).
- Las reglas del programa (duplicados, auto-referidos, vigencia, límites por hora, dominios excluidos) se validan en la base de datos, además de en el servidor.
- Las tablas nuevas (`reglas_programa`, `reglas_historial`, `referentes_historial`, `registros_intentos`) tienen RLS: solo el super_admin las lee y nadie las cambia desde el navegador. Las IP de `registros_intentos` se borran a los 2 días.

---

## Hoja de ruta

- [x] **Fase 1** — Proyecto base, esquema de base de datos, configuración y documentación.
- [x] **Fase 2** — Registro e inicio de sesión de referentes (link mágico) y panel del referente.
- [x] **Fase 3** — Formulario público `/r/CODIGO` con autorización de datos.
- [x] **Fase 4** — Cruce con la Google Sheet (correo → teléfono).
- [x] **Fase 5** — Panel de administrador, referidos sin cruce y exportación de reportes.
- [x] **Ajustes** — Rol super_admin, planes y bonos, estados del bono, edición manual con historial, pagos con soporte, página de gracias y correos.
- [x] **Reglas del programa** — Identidad, no auto-referirse, sin duplicados, vigencia, ya cliente, permanencia, bono fijo, confirmación por correo, anti-abuso, exclusiones, suspensión, términos y excepciones con motivo.
- [ ] **Fase 6** — Publicación en Vercel con dominio propio.
