/**
 * Revisión de la configuración de la app. La usan la página
 * /admin/estado y el comando "npm run verificar".
 *
 * REGLA: nunca se devuelve el valor de una variable. Solo si está, si
 * tiene buen formato y si funciona. Todo mensaje de error pasa por
 * limpiar(), que tapa cualquier secreto que pudiera venir dentro.
 *
 * Este archivo no usa los atajos "@/..." para que también funcione
 * desde la terminal.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth, sheets } from "@googleapis/sheets";
import nodemailer from "nodemailer";
import configVercel from "../../vercel.json";

export type Estado = "ok" | "error" | "aviso";
export type Resultado = { estado: Estado; titulo: string; detalle?: string; solucion?: string };
export type Grupo = { titulo: string; resultados: Resultado[] };

const REMITENTE_ESPERADO = "notificaciones@atomapp.com.co";
const VIDEOS_POR_DEFECTO = "https://www.youtube.com/playlist?list=PLJxe4Q_nt4qE";
const PLANES_ESPERADOS = ["escala", "experto", "control"];
const DONDE_VERCEL = "En Vercel: Settings → Environment Variables (y luego Redeploy).";

type Variable = { nombre: string; para: string; donde: string; formato?: (v: string) => string | null };

const VARIABLES: Variable[] = [
  {
    nombre: "NEXT_PUBLIC_SITE_URL",
    para: "dirección pública de la app",
    donde: "http://localhost:3000 en tu computador; tu dominio https en Vercel.",
    formato: (v) => (esUrl(v) ? null : "debe ser una dirección completa, ej. https://referidos.atom.com.co"),
  },
  {
    nombre: "NEXT_PUBLIC_SUPABASE_URL",
    para: "conexión a Supabase",
    donde: "Supabase → Project Settings → Data API → Project URL.",
    formato: (v) => (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v) ? null : "debe verse como https://xxxx.supabase.co"),
  },
  {
    nombre: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    para: "conexión pública a Supabase",
    donde: "Supabase → Project Settings → API Keys → Publishable key.",
    formato: (v) => (/^(sb_publishable_|eyJ)/.test(v) ? null : "debe empezar por sb_publishable_"),
  },
  {
    nombre: "SUPABASE_SECRET_KEY",
    para: "guardar referidos y cruces desde el servidor",
    donde: "Supabase → Project Settings → API Keys → Secret key.",
    formato: (v) =>
      v === leer("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        ? "es igual a la clave publicable; debe ser la Secret key"
        : /^(sb_secret_|eyJ)/.test(v)
          ? null
          : "debe empezar por sb_secret_",
  },
  {
    nombre: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    para: "leer la Google Sheet",
    donde: "Campo client_email del archivo JSON de la cuenta de servicio.",
    formato: (v) => (v.endsWith(".iam.gserviceaccount.com") ? null : "debe terminar en .iam.gserviceaccount.com"),
  },
  {
    nombre: "GOOGLE_PRIVATE_KEY",
    para: "leer la Google Sheet",
    donde: "Campo private_key del JSON, entre comillas y con los \\n.",
    formato: (v) =>
      v.includes("BEGIN PRIVATE KEY") && v.includes("END PRIVATE KEY") ? null : "no parece una llave privada completa",
  },
  {
    nombre: "GOOGLE_SHEET_ID",
    para: "saber qué hoja leer",
    donde: "En la URL de la hoja, lo que va entre /d/ y /edit.",
    formato: (v) => (/^[A-Za-z0-9_-]{20,}$/.test(v) ? null : "no parece un ID de Google Sheet"),
  },
  { nombre: "GOOGLE_SHEET_RANGE", para: "pestaña de afiliados", donde: "Nombre de la pestaña, ej. Afiliados." },
  { nombre: "SHEET_COL_CORREO", para: "columna de correo", donde: "Título exacto de la columna en la hoja." },
  { nombre: "SHEET_COL_TELEFONO", para: "columna de teléfono", donde: "Título exacto de la columna en la hoja." },
  { nombre: "SHEET_COL_PLAN", para: "columna de plan", donde: "Título exacto de la columna en la hoja." },
  {
    nombre: "POLITICA_DATOS_VERSION",
    para: "guardar la autorización de datos",
    donde: "Una etiqueta como 2026-11-v1.",
  },
  {
    nombre: "CRON_SECRET",
    para: "proteger el cruce diario",
    donde: "Una clave larga al azar (ver .env.example).",
    formato: (v) => (v.length >= 32 ? null : "es muy corta; usa al menos 32 caracteres"),
  },
  { nombre: "SMTP_HOST", para: "enviar correos", donde: "Ej. smtp.gmail.com." },
  {
    nombre: "SMTP_PORT",
    para: "enviar correos",
    donde: "465 (SSL) o 587 (STARTTLS).",
    formato: (v) => (/^\d{2,5}$/.test(v) ? null : "debe ser un número, ej. 465"),
  },
  { nombre: "SMTP_USER", para: "enviar correos", donde: "La cuenta de correo, ej. notificaciones@atomapp.com.co." },
  { nombre: "SMTP_PASSWORD", para: "enviar correos", donde: "La contraseña de aplicación del correo." },
];

/** Variables cuyo valor nunca puede aparecer en un mensaje. */
const SECRETAS = [
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "GOOGLE_PRIVATE_KEY",
  "CRON_SECRET",
  "SMTP_PASSWORD",
  "SUPABASE_ACCESS_TOKEN",
];

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
function leer(nombre: string) {
  return process.env[nombre]?.trim() ?? "";
}

function esUrl(v: string, soloHttps = false) {
  try {
    const u = new URL(v);
    return soloHttps ? u.protocol === "https:" : u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function pareceEjemplo(v: string) {
  return /^"?\(|xxxx|TU-PROYECTO|ESTE_ES_EL_ID|tu-proyecto\.iam/i.test(v);
}

/** Tapa cualquier secreto que pudiera venir dentro de un mensaje de error. */
export function limpiar(texto: string) {
  let t = texto;
  for (const nombre of SECRETAS) {
    const valor = leer(nombre);
    const trozos = [valor, valor.replace(/\\n/g, "\n"), ...valor.replace(/\\n/g, "\n").split("\n")];
    for (const trozo of trozos) {
      if (trozo.trim().length >= 8) t = t.split(trozo.trim()).join("•••");
    }
  }
  return t.length > 300 ? `${t.slice(0, 300)}…` : t;
}

function mensaje(e: unknown) {
  return limpiar(e instanceof Error ? e.message : String(e));
}

async function conLimite<T>(promesa: PromiseLike<T>, ms = 15000): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`no respondió en ${ms / 1000} segundos`)), ms);
  });
  try {
    return await Promise.race([promesa, limite]);
  } finally {
    clearTimeout(reloj);
  }
}

const ok = (titulo: string, detalle?: string): Resultado => ({ estado: "ok", titulo, detalle });
const error = (titulo: string, solucion: string, detalle?: string): Resultado => ({ estado: "error", titulo, detalle, solucion });
const aviso = (titulo: string, solucion: string, detalle?: string): Resultado => ({ estado: "aviso", titulo, detalle, solucion });

/** Igual que public.normalizar_nombre_plan() en schema.sql. */
function normalizarPlan(t: string | null | undefined) {
  const s = String(t ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^plan\s+/, "")
    .replace(/\s+/g, " ");
  return s || null;
}

function normalizarTitulo(t: unknown) {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// ---------------------------------------------------------------------
// 1. Variables de entorno
// ---------------------------------------------------------------------
function revisarVariables(): Grupo {
  const resultados: Resultado[] = VARIABLES.map((v) => {
    const valor = leer(v.nombre);
    if (!valor) {
      return error(`${v.nombre} falta`, `Agrégala en .env.local. ${v.donde} ${DONDE_VERCEL}`, `Sirve para: ${v.para}.`);
    }
    if (pareceEjemplo(valor)) {
      return error(`${v.nombre} tiene el texto de ejemplo`, `Reemplázalo por el valor real. ${v.donde}`);
    }
    const problema = v.formato?.(valor);
    if (problema) return error(`${v.nombre} presente, pero ${problema}`, v.donde);
    return ok(`${v.nombre} presente`);
  });

  if (leer("SHEET_COL_COMISION")) {
    resultados.push(
      aviso("SHEET_COL_COMISION ya no se usa", "Puedes borrarla: el bono sale de la tabla planes."),
    );
  }
  return { titulo: "Variables de entorno", resultados };
}

// ---------------------------------------------------------------------
// 2. Conexión a Supabase
// ---------------------------------------------------------------------
async function revisarSupabase(): Promise<{ grupo: Grupo; admin: SupabaseClient | null }> {
  const resultados: Resultado[] = [];
  const url = leer("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const publica = leer("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secreta = leer("SUPABASE_SECRET_KEY");
  let admin: SupabaseClient | null = null;

  if (!url) {
    resultados.push(error("No se puede probar Supabase", "Configura NEXT_PUBLIC_SUPABASE_URL."));
    return { grupo: { titulo: "Conexión a Supabase", resultados }, admin };
  }

  // Clave publicable
  if (!publica) {
    resultados.push(error("Clave publicable: no configurada", "Configura NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."));
  } else {
    try {
      const r = await conLimite(fetch(`${url}/auth/v1/settings`, { headers: { apikey: publica } }));
      if (r.ok) resultados.push(ok("Conexión con la clave publicable"));
      else
        resultados.push(
          error(
            `Clave publicable rechazada (código ${r.status})`,
            "Copia de nuevo la Publishable key desde Supabase → Project Settings → API Keys.",
          ),
        );

      // Un visitante sin sesión NO debe poder leer referidos
      const anon = createClient(url, publica, { auth: { persistSession: false } });
      const { data, error: e } = await conLimite(anon.from("referidos").select("id").limit(1));
      if (e || !data?.length) resultados.push(ok("Los visitantes sin sesión no pueden leer los referidos"));
      else
        resultados.push(
          error(
            "¡Un visitante sin sesión puede leer referidos!",
            "Ejecuta de nuevo todo supabase/schema.sql para restaurar las reglas de seguridad.",
          ),
        );
    } catch (e) {
      resultados.push(error("No hubo respuesta de Supabase", "Revisa NEXT_PUBLIC_SUPABASE_URL y tu conexión a internet.", mensaje(e)));
    }
  }

  // Clave secreta
  if (!secreta) {
    resultados.push(error("Clave secreta: no configurada", "Configura SUPABASE_SECRET_KEY."));
  } else {
    admin = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
    try {
      const { error: e } = await conLimite(admin.from("referentes").select("id", { count: "exact", head: true }));
      if (!e) resultados.push(ok("Conexión con la clave secreta"));
      else if (/permission denied/i.test(e.message))
        resultados.push(
          error(
            "La clave secreta funciona, pero no tiene permisos sobre las tablas",
            "Ejecuta de nuevo todo supabase/schema.sql en Supabase → SQL Editor.",
          ),
        );
      else if (/invalid api key|jwt/i.test(e.message)) {
        admin = null;
        resultados.push(error("Clave secreta rechazada", "Copia de nuevo la Secret key desde Supabase → Project Settings → API Keys."));
      } else resultados.push(error("Error al usar la clave secreta", "Ejecuta de nuevo supabase/schema.sql.", limpiar(e.message)));
    } catch (e) {
      admin = null;
      resultados.push(error("No hubo respuesta de Supabase con la clave secreta", "Revisa tu conexión a internet.", mensaje(e)));
    }
  }

  return { grupo: { titulo: "Conexión a Supabase", resultados }, admin };
}

// ---------------------------------------------------------------------
// 3 y 4. Base de datos, seguridad y datos mínimos
// ---------------------------------------------------------------------
type Diagnostico = {
  tablas: { nombre: string; existe: boolean; rls: boolean; politicas: number; anon_lee: boolean | null }[];
  funciones: { nombre: string; existe: boolean }[];
  disparadores: { nombre: string; existe: boolean }[];
  bucket: { publico: boolean; limite: number | null; tipos: string[] | null } | null;
  politica_storage: boolean;
  super_admins: number;
};

type PlanBD = { id: string; nombre: string; bono: number | string | null; alias: string[] | null; activo: boolean };

async function revisarBaseDeDatos(admin: SupabaseClient | null): Promise<{ grupos: Grupo[]; planes: PlanBD[] | null }> {
  const SCHEMA = "Ejecuta de nuevo todo supabase/schema.sql en Supabase → SQL Editor.";
  const bd: Resultado[] = [];
  const datos: Resultado[] = [];
  const grupos = [
    { titulo: "Base de datos y seguridad", resultados: bd },
    { titulo: "Datos mínimos", resultados: datos },
  ];

  if (!admin) {
    bd.push(error("No se pudo revisar la base de datos", "Primero arregla la conexión con la clave secreta."));
    return { grupos, planes: null };
  }

  let d: Diagnostico | null = null;
  try {
    const { data, error: e } = await conLimite(admin.rpc("diagnostico"));
    if (e) bd.push(error("Falta la función de diagnóstico", SCHEMA, limpiar(e.message)));
    else d = data as Diagnostico;
  } catch (e) {
    bd.push(error("No se pudo revisar la base de datos", SCHEMA, mensaje(e)));
  }

  if (d) {
    for (const t of d.tablas) {
      if (!t.existe) bd.push(error(`Tabla ${t.nombre}: no existe`, SCHEMA));
      else if (!t.rls) bd.push(error(`Tabla ${t.nombre}: Row Level Security APAGADO`, SCHEMA));
      else if (t.anon_lee) bd.push(error(`Tabla ${t.nombre}: los visitantes sin sesión tienen permiso de lectura`, SCHEMA));
      else bd.push(ok(`Tabla ${t.nombre}: existe y tiene RLS activo`, `${t.politicas} regla(s) de acceso`));
    }

    const faltanF = d.funciones.filter((f) => !f.existe).map((f) => f.nombre);
    bd.push(
      faltanF.length
        ? error(`Faltan funciones: ${faltanF.join(", ")}`, SCHEMA)
        : ok(`Las ${d.funciones.length} funciones de la base de datos existen`),
    );

    const faltanD = d.disparadores.filter((f) => !f.existe).map((f) => f.nombre);
    bd.push(
      faltanD.length
        ? error(`Faltan disparadores: ${faltanD.join(", ")}`, SCHEMA)
        : ok(`Los ${d.disparadores.length} disparadores automáticos existen`),
    );

    if (!d.bucket) bd.push(error("Bucket de soportes (soportes-pagos): no existe", SCHEMA));
    else if (d.bucket.publico)
      bd.push(error("Bucket de soportes: es PÚBLICO (cualquiera podría ver los soportes)", SCHEMA));
    else {
      const mb = d.bucket.limite ? Math.round(d.bucket.limite / 1024 / 1024) : null;
      bd.push(
        mb === 5
          ? ok("Bucket de soportes: privado, máximo 5 MB", `Tipos permitidos: ${(d.bucket.tipos ?? []).join(", ")}`)
          : aviso(`Bucket de soportes: privado, pero el límite es ${mb ?? "ilimitado"} MB`, SCHEMA),
      );
    }

    bd.push(
      d.politica_storage
        ? ok("Regla de seguridad de los soportes: cada referente solo ve los suyos")
        : error("Falta la regla de seguridad de los soportes en Storage", SCHEMA),
    );

  }

  // Super admins (si falta el diagnóstico, se cuentan directamente)
  let superAdmins: number | null = d?.super_admins ?? null;
  if (superAdmins === null) {
    const { count, error: e } = await admin.from("super_admins").select("user_id", { count: "exact", head: true });
    if (!e) superAdmins = count ?? 0;
  }
  if (superAdmins === null) datos.push(error("No se pudo revisar si hay super_admin", SCHEMA));
  else
    datos.push(
      superAdmins > 0
        ? ok(`Hay ${superAdmins} super_admin${superAdmins === 1 ? "" : "s"}`)
        : error(
            "No hay ningún super_admin",
            "Inicia sesión una vez con esa cuenta y ejecuta en el SQL Editor: insert into public.super_admins (user_id) select id from auth.users where email = 'TU-CORREO';",
          ),
    );

  // Planes
  let planes: PlanBD[] | null = null;
  try {
    const { data, error: e } = await conLimite(
      admin.from("planes").select("id, nombre, bono, alias, activo").order("orden").returns<PlanBD[]>(),
    );
    if (e) datos.push(error("No se pudo leer la tabla planes", SCHEMA, limpiar(e.message)));
    else planes = data ?? [];
  } catch (e) {
    datos.push(error("No se pudo leer la tabla planes", SCHEMA, mensaje(e)));
  }

  if (planes) {
    const faltan = PLANES_ESPERADOS.filter((id) => !planes!.some((p) => p.id === id));
    const sinBono = planes.filter((p) => !(Number(p.bono) > 0));
    const lista = planes.map((p) => `${p.nombre} ${pesos.format(Number(p.bono) || 0)}${p.activo ? "" : " (inactivo)"}`).join(" · ");
    if (faltan.length) datos.push(error(`Faltan planes: ${faltan.join(", ")}`, SCHEMA, lista || "La tabla está vacía."));
    else if (sinBono.length)
      datos.push(
        error(
          `Planes sin bono: ${sinBono.map((p) => p.nombre).join(", ")}`,
          "Ponles el valor en Supabase → Table Editor → planes → columna bono.",
          lista,
        ),
      );
    else datos.push(ok(`La tabla planes tiene los ${PLANES_ESPERADOS.length} planes con su bono`, lista));
  }

  return { grupos, planes };
}

// ---------------------------------------------------------------------
// 5. Google Sheet
// ---------------------------------------------------------------------
async function revisarHoja(planes: PlanBD[] | null): Promise<Grupo> {
  const resultados: Resultado[] = [];
  const grupo = { titulo: "Google Sheet de afiliados", resultados };

  const correoCuenta = leer("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const llave = leer("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const idHoja = leer("GOOGLE_SHEET_ID");
  const rango = leer("GOOGLE_SHEET_RANGE");
  if (!correoCuenta || !llave || !idHoja || !rango) {
    resultados.push(
      error("No se puede probar la hoja", "Configura GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID y GOOGLE_SHEET_RANGE."),
    );
    return grupo;
  }

  const cliente = new auth.JWT({
    email: correoCuenta,
    key: llave,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const api = sheets({ version: "v4", auth: cliente });

  // Acceso a la hoja
  let pestanas: string[] = [];
  try {
    const r = await conLimite(
      api.spreadsheets.get({ spreadsheetId: idHoja, fields: "properties.title,sheets.properties.title" }),
    );
    pestanas = (r.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
    resultados.push(ok(`Acceso a la hoja «${r.data.properties?.title ?? "sin título"}»`));
  } catch (e) {
    const m = mensaje(e);
    if (/permission|403/i.test(m))
      resultados.push(
        error(
          "La cuenta de servicio no tiene permiso para leer la hoja",
          `En la hoja: Compartir → agrega ${correoCuenta} como Lector.`,
          m,
        ),
      );
    else if (/not found|404/i.test(m))
      resultados.push(error("No se encontró la hoja", "Revisa GOOGLE_SHEET_ID (lo que va entre /d/ y /edit en la URL).", m));
    else if (/invalid_grant|private key|PEM|DECODER|invalid_client/i.test(m))
      resultados.push(
        error(
          "Google rechazó la cuenta de servicio",
          "Revisa GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY (deben venir del mismo archivo JSON y la llave no debe estar borrada en Google Cloud).",
          m,
        ),
      );
    else if (/has not been used|disabled|SERVICE_DISABLED/i.test(m))
      resultados.push(error("La Google Sheets API no está habilitada", "Google Cloud → APIs y servicios → habilita Google Sheets API.", m));
    else resultados.push(error("No se pudo abrir la hoja", "Revisa las variables GOOGLE_*.", m));
    return grupo;
  }

  // Pestaña
  const pestana = rango.split("!")[0].replace(/^'|'$/g, "").trim();
  if (!pestanas.includes(pestana)) {
    resultados.push(
      error(
        `La pestaña «${pestana}» no existe`,
        "Corrige GOOGLE_SHEET_RANGE con el nombre exacto de la pestaña.",
        `Pestañas de la hoja: ${pestanas.join(", ") || "(ninguna)"}`,
      ),
    );
    return grupo;
  }
  resultados.push(ok(`La pestaña «${pestana}» existe`));

  // Columnas y filas
  let filas: unknown[][] = [];
  let titulos: unknown[] = [];
  try {
    const r = await conLimite(
      api.spreadsheets.values.get({ spreadsheetId: idHoja, range: rango, valueRenderOption: "UNFORMATTED_VALUE" }),
    );
    [titulos = [], ...filas] = (r.data.values ?? []) as unknown[][];
  } catch (e) {
    resultados.push(error("No se pudieron leer los datos de la pestaña", "Revisa GOOGLE_SHEET_RANGE.", mensaje(e)));
    return grupo;
  }

  const normalizados = titulos.map(normalizarTitulo);
  const encontrados = titulos.map((t) => `"${String(t)}"`).join(", ") || "(ninguno)";
  const indices: Record<string, number> = {};
  for (const [clave, variable] of [
    ["correo", "SHEET_COL_CORREO"],
    ["telefono", "SHEET_COL_TELEFONO"],
    ["plan", "SHEET_COL_PLAN"],
  ] as const) {
    const nombre = leer(variable);
    const i = nombre ? normalizados.indexOf(normalizarTitulo(nombre)) : -1;
    indices[clave] = i;
    if (!nombre) resultados.push(error(`Columna de ${clave}: falta ${variable}`, `Configura ${variable}.`));
    else if (i < 0)
      resultados.push(
        error(
          `Columna de ${clave} («${nombre}») no encontrada`,
          `Corrige ${variable} con el título exacto de la primera fila.`,
          `Títulos en la primera fila: ${encontrados}`,
        ),
      );
    else resultados.push(ok(`Columna de ${clave} encontrada («${String(titulos[i])}»)`));
  }

  const conDatos = filas.filter((f) => f.some((c) => String(c ?? "").trim() !== ""));
  resultados.push(
    conDatos.length > 0
      ? ok(`Se leyeron ${conDatos.length} filas de afiliados`)
      : aviso("La pestaña no tiene filas de afiliados", "Revisa que los datos estén en esa pestaña, debajo de los títulos."),
  );

  // Planes de la hoja que no coinciden con la tabla planes
  if (indices.plan >= 0 && planes) {
    const conocidos = new Set<string>();
    for (const p of planes) {
      for (const n of [p.nombre, p.id, ...(p.alias ?? [])]) {
        const k = normalizarPlan(n);
        if (k) conocidos.add(k);
      }
    }
    const sinCoincidencia = new Map<string, number>();
    let sinPlan = 0;
    for (const f of conDatos) {
      const texto = String(f[indices.plan] ?? "").trim();
      const k = normalizarPlan(texto);
      if (!k) sinPlan++;
      else if (!conocidos.has(k)) sinCoincidencia.set(texto, (sinCoincidencia.get(texto) ?? 0) + 1);
    }
    const extra = sinPlan ? ` ${sinPlan} fila(s) no tienen plan.` : "";
    if (sinCoincidencia.size === 0) {
      resultados.push(ok("Todos los planes de la hoja coinciden con un plan o alias", extra.trim() || undefined));
    } else {
      const lista = [...sinCoincidencia.entries()]
        .slice(0, 10)
        .map(([n, c]) => `«${n}» (${c})`)
        .join(", ");
      resultados.push(
        aviso(
          `${sinCoincidencia.size} nombre(s) de plan de la hoja no coinciden con ningún plan o alias`,
          "Agrega esos nombres en la columna alias del plan correcto (Supabase → Table Editor → planes). Mientras tanto, esos referidos quedan «por pagar» sin bono.",
          `${lista}.${extra}`,
        ),
      );
    }
  }

  return grupo;
}

// ---------------------------------------------------------------------
// 6. Correo SMTP
// ---------------------------------------------------------------------
async function revisarCorreo(): Promise<Grupo> {
  const resultados: Resultado[] = [];
  const host = leer("SMTP_HOST");
  const puerto = Number(leer("SMTP_PORT") || 587);
  const usuario = leer("SMTP_USER");
  const clave = leer("SMTP_PASSWORD");

  if (!host) {
    resultados.push(error("SMTP no configurado: no se envían correos", "Configura SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASSWORD."));
  } else if (!clave) {
    resultados.push(error("Falta SMTP_PASSWORD", "Escribe la contraseña de aplicación del correo en .env.local (y en Vercel)."));
  } else {
    try {
      const transporte = nodemailer.createTransport({
        host,
        port: puerto,
        secure: puerto === 465,
        auth: usuario ? { user: usuario, pass: clave } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });
      await conLimite(transporte.verify(), 20000);
      transporte.close();
      resultados.push(ok(`Conexión SMTP con ${host}:${puerto} y usuario aceptados`, "No se envió ningún correo."));
    } catch (e) {
      const m = mensaje(e);
      const gmail = /gmail|google/i.test(host);
      resultados.push(
        error(
          /auth|535|534|login|credentials/i.test(m)
            ? "El servidor de correo rechazó el usuario o la contraseña"
            : `No se pudo conectar a ${host}:${puerto}`,
          gmail
            ? "Usa una contraseña de aplicación de 16 letras (requiere verificación en 2 pasos en esa cuenta) y revisa SMTP_USER. Puerto 465 o 587."
            : "Revisa SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASSWORD con tu proveedor de correo.",
          m,
        ),
      );
    }
  }

  const remitente = leer("SMTP_FROM") || `ATOM Referidos <${REMITENTE_ESPERADO}>`;
  const correoRemitente = (remitente.match(/<([^>]+)>/)?.[1] ?? remitente).trim().toLowerCase();
  resultados.push(
    correoRemitente === REMITENTE_ESPERADO
      ? ok(`Remitente: ${REMITENTE_ESPERADO}`)
      : aviso(`El remitente es ${correoRemitente}, no ${REMITENTE_ESPERADO}`, "Corrige SMTP_FROM o bórrala para usar el remitente por defecto."),
  );
  if (usuario && usuario.toLowerCase() !== correoRemitente) {
    resultados.push(
      aviso(
        `SMTP_USER (${usuario}) es distinto del remitente`,
        "Gmail cambia el remitente por la cuenta que inicia sesión, salvo que esté configurado como alias en «Enviar correo como». Lo más simple: usa la misma cuenta.",
      ),
    );
  }

  return { titulo: "Correo (SMTP)", resultados };
}

// ---------------------------------------------------------------------
// 7. Página de gracias
// ---------------------------------------------------------------------
/** ¿Responde el link? (sin descargar todo el contenido) */
async function responde(url: string) {
  const r = await conLimite(fetch(url, { method: "GET", redirect: "follow", headers: { Range: "bytes=0-0" } }), 10000);
  await r.body?.cancel();
  return { ok: r.ok || r.status === 206, codigo: r.status, tipo: r.headers.get("content-type") ?? "" };
}

async function revisarPaginaGracias(): Promise<Grupo> {
  const resultados: Resultado[] = [];

  const dropi = leer("LINK_DROPI_ATOM");
  if (!dropi)
    resultados.push(
      error(
        "LINK_DROPI_ATOM no configurado",
        "Agrega el link de registro en ATOM dentro de Dropi. Mientras falte, el paso 1 dice «Muy pronto te compartiremos el link».",
      ),
    );
  else if (!esUrl(dropi, true)) resultados.push(error("LINK_DROPI_ATOM no es un link https válido", "Debe empezar por https://"));
  else {
    try {
      const r = await responde(dropi);
      resultados.push(
        r.ok
          ? ok(`LINK_DROPI_ATOM configurado y abre (${new URL(dropi).hostname})`)
          : error(`LINK_DROPI_ATOM no abre (código ${r.codigo})`, "Revisa que el link sea correcto."),
      );
    } catch (e) {
      resultados.push(aviso("No se pudo abrir LINK_DROPI_ATOM para comprobarlo", "Ábrelo en el navegador para confirmar que funciona.", mensaje(e)));
    }
  }

  const videosEnv = leer("LINK_VIDEOS_ACTIVACION");
  const videos = videosEnv || VIDEOS_POR_DEFECTO;
  const origen = videosEnv ? "" : " (se está usando el valor por defecto)";
  let lista = "";
  let esYoutube = false;
  try {
    const u = new URL(videos);
    esYoutube = /(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname) && u.protocol === "https:";
    lista = u.searchParams.get("list") ?? "";
  } catch {
    /* formato inválido */
  }
  if (!esYoutube)
    resultados.push(error(`LINK_VIDEOS_ACTIVACION no es un link https de YouTube${origen}`, "Pega el link completo de la lista de YouTube."));
  else if (!lista)
    resultados.push(error(`LINK_VIDEOS_ACTIVACION no tiene el parámetro list=${origen}`, "En YouTube abre la lista → Compartir → Copiar, y pega ese link."));
  else {
    // YouTube confirma si la lista existe (oEmbed responde 200 solo si existe y es pública)
    try {
      const r = await conLimite(
        fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/playlist?list=${lista}`)}`),
        10000,
      );
      const datos = r.ok ? ((await r.json()) as { title?: string }) : null;
      resultados.push(
        datos
          ? ok(`LINK_VIDEOS_ACTIVACION: lista de YouTube encontrada${origen}`, datos.title ? `«${datos.title}»` : undefined)
          : error(
              `LINK_VIDEOS_ACTIVACION: YouTube no encuentra la lista (código ${r.status})${origen}`,
              "Revisa que la lista sea Pública o No listada y vuelve a copiar su link desde Compartir.",
            ),
      );
    } catch (e) {
      resultados.push(aviso("No se pudo comprobar la lista de YouTube", "Ábrela en el navegador para confirmar que funciona.", mensaje(e)));
    }
  }

  // Política de tratamiento de datos (el link del formulario)
  const politica = leer("POLITICA_DATOS_URL");
  if (!politica)
    resultados.push(
      aviso(
        "POLITICA_DATOS_URL no configurada: el formulario usa la página interna /politica-datos",
        "Completa el correo de contacto en src/app/(acceso)/politica-datos/page.tsx o configura el link del documento oficial.",
      ),
    );
  else if (!esUrl(politica, true))
    resultados.push(error("POLITICA_DATOS_URL no es un link https válido", "Debe empezar por https://"));
  else {
    try {
      const r = await responde(politica);
      resultados.push(
        r.ok
          ? ok(`Política de datos: el documento abre (${r.tipo.includes("pdf") ? "PDF" : r.tipo || "página"})`)
          : error(`POLITICA_DATOS_URL no abre (código ${r.codigo})`, "Revisa el link del documento."),
      );
    } catch (e) {
      resultados.push(aviso("No se pudo abrir POLITICA_DATOS_URL para comprobarla", "Ábrela en el navegador para confirmar.", mensaje(e)));
    }
  }

  const numeros = (leer("WHATSAPP_CAPACITACION") || "573122521130,573189762642").split(",").map((n) => n.replace(/\D/g, ""));
  const malos = numeros.filter((n) => !/^57\d{10}$/.test(n));
  resultados.push(
    malos.length
      ? error("WHATSAPP_CAPACITACION tiene números con formato incorrecto", "Escríbelos con indicativo, sin + ni espacios, separados por coma: 573001234567,573009876543")
      : ok(`${numeros.length} número(s) de WhatsApp para la capacitación`),
  );

  return { titulo: "Página de gracias y política de datos", resultados };
}

// ---------------------------------------------------------------------
// 8. Sitio y Supabase Auth
// ---------------------------------------------------------------------
async function revisarSitio(): Promise<Grupo> {
  const resultados: Resultado[] = [];
  const sitio = leer("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
  const AUTH = "Supabase → Authentication → URL Configuration";

  if (!esUrl(sitio)) {
    resultados.push(error("NEXT_PUBLIC_SITE_URL no es válida", "Escribe la dirección completa, ej. http://localhost:3000"));
    return { titulo: "Sitio y login", resultados };
  }
  const origen = new URL(sitio).origin;
  const local = /localhost|127\.0\.0\.1/.test(origen);
  if (local && process.env.VERCEL_ENV === "production")
    resultados.push(error("En producción NEXT_PUBLIC_SITE_URL apunta a localhost", `Ponla con tu dominio https en Vercel y haz Redeploy.`));
  else resultados.push(ok(`NEXT_PUBLIC_SITE_URL: ${origen}`));

  const token = leer("SUPABASE_ACCESS_TOKEN");
  const ref = leer("NEXT_PUBLIC_SUPABASE_URL").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (!token || !ref) {
    resultados.push(
      aviso(
        "No se puede comparar automáticamente con la configuración de Supabase Auth",
        `Revisa a mano en ${AUTH}: Site URL = ${origen} y en Redirect URLs debe estar ${origen}/**. (Para revisarlo automáticamente, agrega SUPABASE_ACCESS_TOKEN: ver .env.example.)`,
      ),
    );
    return { titulo: "Sitio y login", resultados };
  }

  try {
    const r = await conLimite(
      fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { headers: { Authorization: `Bearer ${token}` } }),
    );
    if (!r.ok) {
      resultados.push(
        error(`Supabase no aceptó SUPABASE_ACCESS_TOKEN (código ${r.status})`, "Crea un token nuevo en supabase.com → Account → Access Tokens."),
      );
    } else {
      const c = (await r.json()) as { site_url?: string; uri_allow_list?: string };
      const siteAuth = (c.site_url ?? "").replace(/\/$/, "");
      const permitidas = (c.uri_allow_list ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const cubre = permitidas.some((p) => p === `${origen}/**` || p === `${origen}/*` || p.startsWith(`${origen}/auth/confirm`));
      let originAuth = "";
      try {
        originAuth = new URL(siteAuth).origin;
      } catch {
        /* vacío */
      }

      if (originAuth === origen) resultados.push(ok("Site URL de Supabase Auth coincide con NEXT_PUBLIC_SITE_URL"));
      else if (cubre)
        resultados.push(
          aviso(
            `Site URL de Supabase Auth es ${originAuth || "(vacía)"}, distinta de ${origen}`,
            `El login funciona porque ${origen}/** está en Redirect URLs, pero los correos usan la Site URL. En producción cámbiala en ${AUTH}.`,
          ),
        );
      else
        resultados.push(
          error(
            `Site URL de Supabase Auth (${originAuth || "vacía"}) no coincide con ${origen}`,
            `En ${AUTH}: pon Site URL = ${origen} y agrega ${origen}/** en Redirect URLs.`,
          ),
        );

      resultados.push(
        cubre
          ? ok(`${origen}/** está en las Redirect URLs`)
          : error(`Falta ${origen}/** en las Redirect URLs`, `Agrégalo en ${AUTH} → Redirect URLs.`),
      );
    }
  } catch (e) {
    resultados.push(error("No se pudo consultar la configuración de Supabase Auth", "Revisa tu conexión a internet.", mensaje(e)));
  }
  return { titulo: "Sitio y login", resultados };
}

// ---------------------------------------------------------------------
// 9. Cruce diario
// ---------------------------------------------------------------------
function revisarCron(): Grupo {
  const resultados: Resultado[] = [];
  const secreto = leer("CRON_SECRET");
  resultados.push(
    !secreto
      ? error("CRON_SECRET falta", `Genérala (ver .env.example) y agrégala en .env.local y en Vercel. ${DONDE_VERCEL}`)
      : secreto.length < 32
        ? aviso("CRON_SECRET es corta", "Usa al menos 32 caracteres al azar.")
        : ok("CRON_SECRET presente"),
  );

  const crons = (configVercel as { crons?: { path: string; schedule: string }[] }).crons ?? [];
  const cruce = crons.find((c) => c.path === "/api/cruce");
  resultados.push(
    cruce
      ? ok(
          "Cruce diario configurado en vercel.json",
          cruce.schedule === "0 11 * * *" ? "Todos los días a las 6:00 a. m. hora Colombia." : `Horario (UTC): ${cruce.schedule}`,
        )
      : error("vercel.json no tiene el cruce diario", 'Agrega en vercel.json: "crons": [{ "path": "/api/cruce", "schedule": "0 11 * * *" }]'),
  );
  return { titulo: "Cruce diario (Vercel Cron)", resultados };
}

// ---------------------------------------------------------------------
export async function verificarConfiguracion(): Promise<Grupo[]> {
  const variables = revisarVariables();
  const { grupo: supabase, admin } = await revisarSupabase();
  const [{ grupos: bd, planes }, correo, sitio, gracias] = await Promise.all([
    revisarBaseDeDatos(admin),
    revisarCorreo(),
    revisarSitio(),
    revisarPaginaGracias(),
  ]);
  const hoja = await revisarHoja(planes);
  return [variables, supabase, ...bd, hoja, correo, gracias, sitio, revisarCron()];
}

export function contar(grupos: Grupo[]) {
  const todos = grupos.flatMap((g) => g.resultados);
  return {
    ok: todos.filter((r) => r.estado === "ok").length,
    errores: todos.filter((r) => r.estado === "error").length,
    avisos: todos.filter((r) => r.estado === "aviso").length,
  };
}
