import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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

export const metadata: Metadata = {
  title: "Referidos ATOM",
  description: "Programa de referidos de ATOM Solutions Data",
  applicationName: "Referidos ATOM",
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
