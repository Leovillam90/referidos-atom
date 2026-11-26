import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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
