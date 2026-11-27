import type { MetadataRoute } from "next";
import { urlSitio } from "@/lib/sitio";

/** robots.txt: las zonas privadas no se rastrean. (Los links /r/ no se bloquean aquí para que WhatsApp muestre la vista previa; esas páginas llevan noindex.) */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/panel", "/api/", "/auth/", "/soporte/", "/confirmar/"] },
    sitemap: `${urlSitio()}/sitemap.xml`,
    host: urlSitio(),
  };
}
