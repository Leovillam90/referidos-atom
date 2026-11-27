import type { MetadataRoute } from "next";
import { urlSitio } from "@/lib/sitio";

/** sitemap.xml: solo las páginas públicas. */
export default function sitemap(): MetadataRoute.Sitemap {
  const sitio = urlSitio();
  return [
    { url: `${sitio}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${sitio}/registro`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${sitio}/ingresar`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${sitio}/terminos`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${sitio}/politica-datos`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
