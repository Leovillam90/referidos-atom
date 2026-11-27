import Link from "next/link";
import {
  Award,
  BadgeCheck,
  FileCheck2,
  HeartHandshake,
  Infinity as Infinito,
  Lock,
  Share2,
  ShieldCheck,
  UserPlus,
  Wallet,
  Zap,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EncabezadoPublico } from "@/components/encabezado-publico";
import { FondoDigital } from "@/components/fondo-digital";
import { PieMarca } from "@/components/marca";
import { Mascota } from "@/components/mascota";
import { bonosPublicos, type BonoPublico } from "@/lib/planes";
import { formatoPesos } from "@/lib/formato";
import { cn } from "@/lib/utils";

/** Márgenes laterales fluidos y ancho máximo amplio (≈1280 px). */
const CONTENEDOR = "mx-auto w-full max-w-7xl px-[clamp(1rem,4vw,2.5rem)]";

export default async function Inicio() {
  // Valores de la tabla "planes" (en caché 1 hora, ver lib/planes.ts)
  const bonos = await bonosPublicos();
  const maximo = bonos.length ? Math.max(...bonos.map((b) => b.bono)) : null;

  return (
    <div className="relative isolate flex flex-1 flex-col overflow-x-clip">
      <FondoDigital className="fixed" />
      <EncabezadoPublico />
      <main className="flex-1">
        <Hero maximo={maximo} />
        <ComoFunciona />
        {bonos.length > 0 && <Bonos bonos={bonos} />}
        <Valores />
        <LlamadaFinal />
      </main>
      <PieMarca />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Hero({ maximo }: { maximo: number | null }) {
  const datos = [
    { icono: Wallet, texto: maximo ? `Hasta ${formatoPesos(maximo)} por referido` : "Bono por cada referido activo" },
    { icono: Infinito, texto: "Sin límite de referidos" },
    { icono: FileCheck2, texto: "Pagos con soporte" },
  ];

  return (
    <section
      aria-labelledby="titulo-inicio"
      className={cn(CONTENEDOR, "zona-saludo grid items-center gap-2 pt-4 pb-14 sm:pt-8 lg:min-h-[min(calc(100svh-4.5rem),44rem)] lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pt-6 lg:pb-4")}
    >
      {/* Mascota: en el celular arriba y completa (con margen para que al moverse no se corte); en PC grande a la derecha */}
      <div className="relative mx-auto w-[min(58vw,14rem)] pt-2 pb-6 sm:w-64 sm:pt-4 lg:order-last lg:w-full lg:max-w-[32rem] lg:py-0">
        <Mascota
          prioridad
          parallax
          sizes="(min-width: 1024px) 512px, (min-width: 640px) 256px, 58vw"
          className="w-full"
        />
      </div>

      <div className="grid gap-6 text-center lg:text-left">
        <p className="text-xs font-bold tracking-[0.22em] text-sea-green uppercase sm:text-sm">Programa de referidos</p>
        <h1
          id="titulo-inicio"
          className="text-[clamp(2.25rem,1.2rem+4.4vw,4.75rem)] leading-[1.02] font-black tracking-tight text-balance"
        >
          Refiere a ATOM y <span className="subrayado-degradado">gana bonos</span> por cada referido
        </h1>
        <p className="mx-auto max-w-xl text-[clamp(1rem,0.9rem+0.4vw,1.25rem)] leading-relaxed text-muted-foreground lg:mx-0">
          Invita proveedores y marcas a ATOM con tu link personal. Sigue en tu panel el estado de cada referido y
          recibe tu bono cuando se active.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
          <Link href="/registro" className={buttonVariants({ size: "lg", className: "dispara-saludo h-14 w-full px-8 text-lg sm:w-auto" })}>
            Quiero ser referente
          </Link>
          <Link
            href="/ingresar"
            className={buttonVariants({ size: "lg", variant: "outline", className: "h-14 w-full px-8 text-lg sm:w-auto" })}
          >
            Ya tengo cuenta
          </Link>
        </div>
        <ul className="grid gap-3 pt-2 sm:grid-cols-3">
          {datos.map(({ icono: Icono, texto }) => (
            <li
              key={texto}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card/80 px-4 py-3 text-left text-sm font-bold"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sea-green/15 text-sea-green">
                <Icono className="size-5" aria-hidden />
              </span>
              {texto}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TituloSeccion({ id, etiqueta, titulo, texto }: { id: string; etiqueta: string; titulo: string; texto?: string }) {
  return (
    <div className="mx-auto grid max-w-2xl gap-3 text-center">
      <p className="text-xs font-bold tracking-[0.22em] text-sea-green uppercase sm:text-sm">{etiqueta}</p>
      <h2 id={id} className="text-[clamp(1.75rem,1.2rem+2.2vw,3rem)] leading-tight font-black tracking-tight text-balance">
        {titulo}
      </h2>
      {texto && <p className="text-base text-muted-foreground sm:text-lg">{texto}</p>}
    </div>
  );
}

function ComoFunciona() {
  const pasos = [
    { icono: UserPlus, titulo: "Regístrate", texto: "Crea tu cuenta de referente en un minuto. Sin contraseñas: entras con un link a tu correo." },
    { icono: Share2, titulo: "Comparte tu link", texto: "Envía tu link personal por WhatsApp a proveedores y marcas que quieran vender con ATOM." },
    { icono: BadgeCheck, titulo: "Gana cuando se activa", texto: "Cuando tu referido se activa en ATOM, tu bono pasa a “por pagar” y te avisamos al pagarlo." },
  ];
  return (
    <section aria-labelledby="como-funciona" className={cn(CONTENEDOR, "aparecer py-14 sm:py-20 lg:pt-10")}>
      <TituloSeccion id="como-funciona" etiqueta="Cómo funciona" titulo="Tres pasos y listo" />
      <ol className="relative mt-10 grid gap-4 md:grid-cols-3 md:gap-6">
        {/* Línea que une los pasos (PC y tablet) */}
        <div aria-hidden className="linea-degradado absolute top-11 right-[16%] left-[16%] hidden h-0.5 opacity-60 md:block" />
        {pasos.map(({ icono: Icono, titulo, texto }, i) => (
          <li key={titulo} className="relative grid content-start justify-items-center gap-3 rounded-3xl border border-white/8 bg-card/85 p-6 text-center">
            <span className="relative flex size-14 items-center justify-center rounded-2xl bg-dark-gunmetal ring-1 ring-white/10">
              <Icono className="size-7 text-sea-green" aria-hidden />
              <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-sea-green text-xs font-black text-dark-gunmetal">
                {i + 1}
              </span>
            </span>
            <h3 className="text-xl font-black">{titulo}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{texto}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Bonos({ bonos }: { bonos: BonoPublico[] }) {
  return (
    <section aria-labelledby="bonos" className={cn(CONTENEDOR, "aparecer py-14 sm:py-20")}>
      <TituloSeccion
        id="bonos"
        etiqueta="Bonos por plan"
        titulo="Tu bono depende del plan que tome tu referido"
        texto="Es un pago único por cada referido que se active en ATOM."
      />
      <ul className={cn("mx-auto mt-10 grid max-w-5xl gap-4 sm:gap-6", bonos.length >= 3 ? "md:grid-cols-3" : "sm:grid-cols-2")}>
        {bonos.map((b, i) => (
          <li
            key={b.id}
            className={cn(
              "borde-degradado group relative grid gap-2 rounded-3xl px-4 py-6 text-center transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_50px_-18px_rgb(13_232_192/0.45)] sm:p-8",
              i === bonos.length - 1 && "lg:scale-[1.03]",
            )}
          >
            <p className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{b.nombre}</p>
            <p className="text-[clamp(1.75rem,1rem+2vw,2.75rem)] leading-none font-black whitespace-nowrap tabular-nums">{formatoPesos(b.bono)}</p>
            <p className="text-sm text-muted-foreground">por referido activo</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Valores() {
  const valores = [
    { icono: HeartHandshake, nombre: "Confianza" },
    { icono: Lock, nombre: "Seguridad" },
    { icono: Award, nombre: "Calidad" },
    { icono: Zap, nombre: "Rapidez" },
    { icono: ShieldCheck, nombre: "Acompañamiento" },
  ];
  return (
    <section aria-labelledby="valores" className={cn(CONTENEDOR, "aparecer py-10 sm:py-14")}>
      <h2 id="valores" className="sr-only">
        Nuestros valores
      </h2>
      <ul className="flex flex-wrap justify-center gap-x-6 gap-y-1 rounded-3xl border border-white/8 bg-card/80 p-4 sm:gap-x-10 sm:p-6 lg:justify-between lg:px-12">
        {valores.map(({ icono: Icono, nombre }) => (
          <li
            key={nombre}
            className="flex items-center justify-center gap-2.5 rounded-2xl px-2 py-2.5 text-sm font-bold sm:text-base"
          >
            <Icono className="size-5 shrink-0 text-sea-green" aria-hidden />
            {nombre}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LlamadaFinal() {
  return (
    <section aria-labelledby="empieza" className={cn(CONTENEDOR, "aparecer pt-10 pb-16 sm:pb-24")}>
      <div className="zona-saludo borde-degradado relative grid items-center gap-6 overflow-hidden rounded-[2rem] p-6 sm:grid-cols-[auto_1fr] sm:p-10 lg:gap-10 lg:px-14">
        <Mascota sizes="(min-width: 640px) 176px, 128px" movimiento="flotar" className="mx-auto w-32 sm:w-44" />
        <div className="grid gap-4 text-center sm:text-left">
          <h2 id="empieza" className="text-[clamp(1.6rem,1.2rem+1.6vw,2.5rem)] leading-tight font-black tracking-tight text-balance">
            ¿Conoces a alguien que quiera vender con ATOM?
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg">Regístrate gratis, recibe tu link y empieza a sumar bonos hoy.</p>
          <div>
            <Link href="/registro" className={buttonVariants({ size: "lg", className: "dispara-saludo h-14 w-full px-8 text-lg sm:w-auto" })}>
              Quiero ser referente
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
