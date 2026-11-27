import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { urlSitio } from "@/lib/sitio";
import "./globals.css";

/*
 * Satoshi (Fontshare / Indian Type Foundry), autoalojada y sin modificar.
 * Licencia: src/fonts/satoshi/LICENCIA-FFL.txt (permite usarla en sitios
 * propios, pero NO distribuir los archivos: el repositorio debe ser privado).
 * Black = títulos · Regular = textos · Bold = etiquetas y botones.
 * (Sin Medium: font-medium usa Regular; una fuente menos = carga más rápida.)
 */
const satoshi = localFont({
  src: [
    { path: "../fonts/satoshi/Satoshi-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/satoshi/Satoshi-Bold.woff2", weight: "700", style: "normal" },
    { path: "../fonts/satoshi/Satoshi-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

const TITULO = "Refiere a ATOM y gana bonos";
const DESCRIPCION =
  "Programa de referidos de ATOM Solutions Data: comparte tu link personal por WhatsApp y gana bonos por cada persona que se afilie a ATOM.";

/*
 * metadataBase vuelve absolutos los links de la imagen para compartir
 * (src/app/opengraph-image.jpg, se genera con "npm run imagen-compartir").
 */
export const metadata: Metadata = {
  metadataBase: new URL(urlSitio()),
  title: "Referidos ATOM",
  description: DESCRIPCION,
  applicationName: "Referidos ATOM",
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Referidos ATOM",
    title: TITULO,
    description: DESCRIPCION,
  },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRIPCION },
  appleWebApp: { title: "Referidos ATOM", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#1d2935",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${satoshi.variable} dark h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
