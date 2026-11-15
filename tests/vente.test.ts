import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vente from "../plateforme/panel/vente.mjs";

const opts = { domaine: "recipelog.cc", cssUrl: "https://admin.recipelog.cc/panel.css" };

describe("vente : réglages", () => {
  it("part de prix d'exemple, tout à compléter, en brouillon", async () => {
    const v = await vente.lire(mkdtempSync(join(tmpdir(), "vente-")));
    expect(v.publie).toBe(false);
    expect(v.offres.map((o: { nom: string }) => o.nom)).toEqual(["Essentiel", "Équipe", "Sur mesure"]);
    expect(vente.manques(v)).toContain("le SIREN");
  });

  it("enregistre et contrôle ce que le panel envoie", async () => {
    const d = mkdtempSync(join(tmpdir(), "vente-"));
    const v = await vente.regler(d, {
      identite: { nom: " Noé Martin ", statut: "EI", siren: "123456789", adresse: "1 rue des Fleurs, 30000 Nîmes", email: "contact@recipelog.cc", telephone: "06", ville: "Nîmes" },
      tva: "franchise",
      essai: "14",
      annuel: 2,
      offres: [{ nom: "Solo", prix: "19.5", utilisateurs: 1, lectures: 10, mcp: 1, texte: "" }],
      enVigueur: "2026-12-01",
      publie: true,
    });
    expect(v.identite.nom).toBe("Noé Martin");
    expect(v.offres[0]).toEqual({ nom: "Solo", prix: 19.5, utilisateurs: 1, lectures: 10, mcp: true, texte: "" });
    expect(v.manques).toEqual([]);
    expect(JSON.parse(readFileSync(join(d, "vente", "vente.json"), "utf8")).essai).toBe(14);
    expect(() => vente.nettoyer({ ...v, identite: { email: "pas-un-mail" } })).toThrow(/e-mail/);
    expect(() => vente.nettoyer({ ...v, identite: { siren: "abc" } })).toThrow(/SIREN/);
    expect(() => vente.nettoyer({ ...v, offres: [{ nom: "" }] })).toThrow(/nom/);
    expect(() => vente.nettoyer({ ...v, tva: "x" })).toThrow(/TVA/);
  });
});

describe("vente : pages publiques", () => {
  it("affiche « à compléter » et le bandeau brouillon tant que rien n'est rempli", () => {
    const h = vente.page("mentions-legales", vente.PAR_DEFAUT, opts);
    expect(h).toContain("<mark>à compléter</mark>");
    expect(h).toContain("Brouillon");
    expect(h).toContain('name="robots" content="noindex"');
    expect(h).toContain("Cloudflare, Inc.");
    expect(vente.page("inconnue", vente.PAR_DEFAUT, opts)).toBeNull();
  });

  it("remplit les textes, échappe et retire le bandeau une fois publié", () => {
    const v = { ...vente.PAR_DEFAUT, publie: true, identite: { ...vente.PAR_DEFAUT.identite, nom: "<b>Noé</b>", siren: "123456789", ville: "Nîmes" } };
    const m = vente.page("mentions-legales", v, opts);
    expect(m).toContain("&lt;b&gt;Noé&lt;/b&gt;");
    expect(m).not.toContain("Brouillon");
    expect(m).toContain("293 B");
    expect(vente.page("cgv", v, opts)).toContain("tribunaux de Nîmes");
    const t = vente.page("tarifs", v, opts);
    expect(t).toContain("29 €");
    expect(t).toContain("Sur devis");
    expect(t).toContain("Essai gratuit de 30 jours");
    const s = vente.page("sous-traitance", { ...v, identite: { ...v.identite, sauvegardesExternes: "OVH SAS" } }, opts);
    expect(s).toContain("Anthropic, PBC");
    expect(s).toContain("OVH SAS");
  });
});
