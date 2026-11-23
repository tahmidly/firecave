// Renders the Firecave logo (shared/logo.ts) into build/icon.png (1024px, used for macOS) and build/icon.ico (16–256px).
// Run with:  npx electron scripts/make-icon.cjs
const { app, BrowserWindow, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "shared", "logo.ts"), "utf8");
const svg = /LOGO_SVG = `([\s\S]*?)`;/.exec(src)?.[1];
if (!svg) throw new Error("LOGO_SVG not found in shared/logo.ts");

/** ICO file holding PNG-compressed images (supported since Windows Vista). */
function toIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent"><div style="width:1024px;height:1024px">${svg.replace("<svg ", '<svg width="1024" height="1024" ')}</div></body></html>`;
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const big = img.resize({ width: 1024, height: 1024, quality: "best" });
  const out = path.join(root, "build");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "icon.png"), big.toPNG());
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const ico = toIco(sizes.map((size) => ({ size, png: nativeImage.createFromBuffer(big.toPNG()).resize({ width: size, height: size, quality: "best" }).toPNG() })));
  fs.writeFileSync(path.join(out, "icon.ico"), ico);
  console.log("wrote build/icon.png and build/icon.ico");
  app.quit();
});
