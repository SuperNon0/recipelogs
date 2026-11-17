/**
 * Côté navigateur : réduit une photo de facture avant l'envoi (une photo de
 * téléphone fait 3 à 8 Mo ; 2000 px de large suffisent pour lire une facture,
 * et pèsent 300 à 700 Ko). Remet aussi la photo droite (orientation EXIF) et
 * la convertit en JPG (les photos HEIC d'iPhone comprises, quand le
 * navigateur sait les ouvrir). Un PDF passe tel quel.
 */
const COTE_MAX = 2000;
const QUALITE = 0.82;

export function estPdf(f: File): boolean {
  return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
}

export async function preparerPhoto(f: File): Promise<File> {
  if (estPdf(f)) return f;
  try {
    const img = await createImageBitmap(f, { imageOrientation: "from-image" });
    const echelle = Math.min(1, COTE_MAX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * echelle));
    const h = Math.max(1, Math.round(img.height * echelle));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return f;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    img.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALITE));
    if (!blob) return f;
    // On garde l'original s'il était déjà plus léger (petite photo déjà en JPG).
    if (blob.size >= f.size && f.type === "image/jpeg") return f;
    return new File([blob], (f.name || "facture").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}
