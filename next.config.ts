import type { NextConfig } from "next";

const esDesarrollo = process.env.NODE_ENV === "development";
/** En localhost (http) no se fuerza https: las pruebas y Lighthouse corren ahí. */
const sitioHttps = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://").startsWith("https://");

/** Origen de Supabase (el navegador sube los soportes y verifica el código de acceso ahí). */
function origenSupabase() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "https://*.supabase.co";
  }
}

const TURNSTILE = "https://challenges.cloudflare.com";

/*
 * Content-Security-Policy: de dónde puede cargar cosas la página.
 * Sin "nonces" porque las páginas se preparan por adelantado (Cache
 * Components); por eso script-src permite 'unsafe-inline' (lo exige
 * Next.js sin nonces). Lo importante queda cerrado: nadie puede meter la
 * app en un iframe, enviar formularios a otro sitio, cargar plugins ni
 * conectarse a dominios que no sean los de la app, Supabase y Turnstile.
 */
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' ${TURNSTILE}${esDesarrollo ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: ${origenSupabase()}`,
  `font-src 'self'`,
  `connect-src 'self' ${origenSupabase()} ${origenSupabase().replace(/^https:/, "wss:")} ${TURNSTILE}`,
  `frame-src ${TURNSTILE}`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  ...(esDesarrollo || !sitioHttps ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const CABECERAS_SEGURIDAD = [
  { key: "Content-Security-Policy", value: csp },
  // Solo HTTPS durante 2 años (Vercel ya redirige http → https)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  // Las pruebas de punta a punta compilan en otra carpeta (.next-e2e) para
  // no mezclarse con tu build normal ni con tus variables de producción.
  distDir: process.env.E2E_DIST_DIR || ".next",
  async headers() {
    return [
      { source: "/:path*", headers: CABECERAS_SEGURIDAD },
      // El link de confirmación lleva un token: que no viaje en el "Referer"
      { source: "/confirmar/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  // Si hay un documento oficial de la política de datos, /politica-datos
  // (el link del formulario) lleva a él. Si no, se muestra la página interna.
  async redirects() {
    const politica = process.env.POLITICA_DATOS_URL?.trim();
    return politica ? [{ source: "/politica-datos", destination: politica, permanent: false }] : [];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
