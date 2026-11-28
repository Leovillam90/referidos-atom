"use client"; // Las páginas de error deben ser componentes del navegador

import "./globals.css";

/**
 * Último recurso: se muestra si falla hasta el diseño principal de la app.
 * Reemplaza todo el documento, por eso trae su propio <html> y <body> y
 * estilos simples (no depende de nada que pudo haber fallado).
 */
export default function ErrorGlobal({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#1d2935",
          color: "#ffffff",
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          padding: 24,
        }}
      >
        <title>Algo salió mal · Referidos ATOM</title>
        <main style={{ maxWidth: 440, textAlign: "center" }}>
          <p style={{ color: "#0de8c0", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            ATOM Solutions Data
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: "8px 0 12px" }}>No pudimos cargar la página</h1>
          <p style={{ color: "#c4ccd6", lineHeight: 1.55, margin: "0 0 24px" }}>
            Fue un error temporal de nuestro lado, no tuyo. Intenta de nuevo en un momento; si sigue pasando,
            escríbenos y te ayudamos.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                background: "#0de8c0",
                color: "#1d2935",
                border: 0,
                borderRadius: 999,
                padding: "12px 24px",
                fontWeight: 700,
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              Intentar de nuevo
            </button>
            {/* Recarga completa: el error pudo estar en la navegación del lado del navegador */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                color: "#ffffff",
                border: "1px solid #5b6675",
                borderRadius: 999,
                padding: "12px 24px",
                fontWeight: 700,
                fontSize: 16,
                textDecoration: "none",
              }}
            >
              Ir al inicio
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
