/**
 * npm run imagen-compartir
 * Genera src/app/opengraph-image.jpg (1200x630, menos de 300 KB para WhatsApp), la imagen que muestran
 * WhatsApp y las redes al compartir un link de la app, a partir de
 * scripts/imagen-compartir.html. Usa Chrome o Edge instalados.
 * Vuelve a ejecutarlo si cambias la mascota, el logo o el texto.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { pathToFileURL } from "node:url";

const NAVEGADORES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((r): r is string => Boolean(r));

const navegador = NAVEGADORES.find((r) => existsSync(r));
if (!navegador) {
  console.error("No encontré Chrome ni Edge. Indica la ruta con la variable CHROME_PATH.");
  process.exit(1);
}

const plantilla = pathToFileURL(join(process.cwd(), "scripts", "imagen-compartir.html")).href;
const captura = join(tmpdir(), "referidos-atom-compartir.png");
const salida = join(process.cwd(), "src", "app", "opengraph-image.jpg");

execFileSync(navegador, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--allow-file-access-from-files",
  "--force-device-scale-factor=1",
  "--window-size=1200,630",
  "--virtual-time-budget=3000",
  `--screenshot=${captura}`,
  plantilla,
], { stdio: "ignore" });

// JPEG: WhatsApp no muestra la vista previa si la imagen pesa más de ~300 KB
sharp(captura)
  .resize(1200, 630)
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile(salida)
  .then(() => {
    rmSync(captura);
    console.log(`Listo: ${salida} (${Math.round(statSync(salida).size / 1024)} KB)`);
  });
