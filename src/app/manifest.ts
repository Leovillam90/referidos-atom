import type { MetadataRoute } from "next";

/** Datos para "Agregar a la pantalla de inicio" en el celular. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Referidos ATOM",
    short_name: "Referidos ATOM",
    description: "Programa de referidos de ATOM Solutions Data",
    start_url: "/panel",
    display: "standalone",
    background_color: "#1d2935",
    theme_color: "#1d2935",
    lang: "es",
    icons: [
      { src: "/brand/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
