import { describe, expect, it } from "vitest";
import { deballerFichier, deballerFichiers } from "@/lib/envoiFichier";

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");

describe("envoi des documents en base64", () => {
  it("remet le fichier, son nom et son type", async () => {
    const octets = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x10]);
    const f = deballerFichier(`RLB64.${b64("Mercuriale été.pdf")}.${b64("application/pdf")}.${b64(octets)}`);
    expect(f?.name).toBe("Mercuriale été.pdf");
    expect(f?.type).toBe("application/pdf");
    expect(Buffer.from(await f!.arrayBuffer()).equals(octets)).toBe(true);
  });

  it("accepte encore un fichier envoyé normalement", () => {
    const f = new File(["x"], "a.jpg");
    expect(deballerFichier(f)).toBe(f);
  });

  it("ignore un texte quelconque et les fichiers vides", () => {
    expect(deballerFichier("bonjour")).toBeNull();
    expect(deballerFichier(null)).toBeNull();
    expect(deballerFichiers([`RLB64.${b64("a")}.${b64("")}.`, new File(["y"], "b.jpg")]).map((f) => f.name)).toEqual(["b.jpg"]);
  });
});
