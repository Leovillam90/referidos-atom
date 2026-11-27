# Plantillas de correo de Supabase Auth (marca ATOM)

Estos dos archivos son los correos que **envía Supabase** (no la app) para entrar
sin contraseña. Tienen el mismo diseño que los correos de la app
(`src/lib/correo.ts`).

| Archivo | Plantilla en Supabase | Asunto sugerido |
|---|---|---|
| `magic-link.html` | **Magic link** | `Tu link para entrar a Referidos ATOM` |
| `confirm-signup.html` | **Confirm signup** | `Confirma tu correo · Referidos ATOM` |

## Cómo pegarlas

1. Supabase → **Authentication → Emails → Templates**.
2. Elige la plantilla (Magic link o Confirm signup).
3. Cambia el **Subject** por el asunto sugerido.
4. En **Message body** borra todo y pega el contenido completo del archivo
   (ábrelo en VS Code, `Ctrl + A`, `Ctrl + C`).
5. Pulsa **Save**. Repite con la otra plantilla.

## Importante

- El botón usa `{{ .SiteURL }}`: la **Site URL** de Supabase
  (Authentication → URL Configuration) debe ser la dirección pública,
  hoy `https://referidos-atom.vercel.app`.
- El logo se carga desde `{{ .SiteURL }}/brand/logo-horizontal-texto-blanco.png`,
  así que solo se ve cuando la app está publicada (no en `localhost`).
- No cambies lo que está entre `{{ }}`: Supabase lo reemplaza al enviar.
