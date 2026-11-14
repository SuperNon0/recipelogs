import { describe, expect, it } from "vitest";
import { getEquipe, inviterMembre, renvoyerInvitation, retirerMembre } from "@/lib/auth/passerelle";

type Call = { url: string; init: RequestInit };

function fake(status: number, body?: unknown, calls: Call[] = []) {
  return {
    calls,
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    },
  };
}

const base = { url: "http://recipelog-passerelle:8000/", key: "cle-chanka" };

describe("client de la passerelle", () => {
  it("lit l'équipe, avec la clé en en-tête", async () => {
    const f = fake(200, {
      instance: "chanka",
      max: 10,
      membres: [{ email: "Chef@Exemple.fr", nom: "Chef", actif: true, derniereConnexion: null }],
    });
    const r = await getEquipe({ ...base, fetch: f.fetch });
    expect(r).toEqual({
      ok: true,
      equipe: { instance: "chanka", max: 10, membres: [{ email: "chef@exemple.fr", nom: "Chef", actif: true, derniereConnexion: null }] },
    });
    expect(f.calls[0].url).toBe("http://recipelog-passerelle:8000/v1/equipe");
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer cle-chanka");
  });

  it("max: null veut dire sans plafond", async () => {
    const r = await getEquipe({ ...base, fetch: fake(200, { instance: "x", max: null, membres: [] }).fetch });
    expect(r.ok && r.equipe.max).toBeNull();
  });

  it("invite : envoie l'e-mail en minuscules", async () => {
    const f = fake(201, { membre: { email: "a@b.fr", nom: "", actif: true, derniereConnexion: null }, invitationEnvoyee: true });
    const r = await inviterMembre(" A@B.fr ", undefined, { ...base, fetch: f.fetch });
    expect(r.ok).toBe(true);
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ email: "a@b.fr" });
    expect(f.calls[0].init.method).toBe("POST");
  });

  it("traduit les erreurs en phrases simples", async () => {
    const quota = await inviterMembre("a@b.fr", undefined, { ...base, fetch: fake(409, { error: "quota", max: 10 }).fetch });
    expect(quota).toMatchObject({ ok: false, code: "quota", status: 409, max: 10 });
    expect(!quota.ok && quota.message).toMatch(/plus de places/);

    const deja = await inviterMembre("a@b.fr", undefined, { ...base, fetch: fake(409, { error: "deja_membre" }).fetch });
    expect(deja).toMatchObject({ ok: false, code: "deja_membre" });

    const invalide = await inviterMembre("x", undefined, { ...base, fetch: fake(400, { error: "email_invalide" }).fetch });
    expect(invalide).toMatchObject({ ok: false, code: "email_invalide", message: "Cette adresse e-mail n'est pas valable." });

    const down = await getEquipe({ ...base, fetch: fake(503, { error: "authentik_indisponible" }).fetch });
    expect(down).toMatchObject({ ok: false, code: "authentik_indisponible" });
    expect(!down.ok && down.message).toMatch(/ne répond pas/);

    const sansCorps = await getEquipe({ ...base, fetch: fake(503, "<html>").fetch });
    expect(sansCorps).toMatchObject({ ok: false, code: "authentik_indisponible" });

    const cle = await getEquipe({ ...base, fetch: fake(401, { error: "cle_invalide" }).fetch });
    expect(cle).toMatchObject({ ok: false, code: "cle_invalide" });

    const inconnu = await getEquipe({ ...base, fetch: fake(500, { error: "bizarre", message: "Phrase de la passerelle." }).fetch });
    expect(inconnu).toMatchObject({ ok: false, code: "bizarre", message: "Phrase de la passerelle." });
  });

  it("ne lève jamais : passerelle injoignable ou délai dépassé", async () => {
    const r = await getEquipe({
      ...base,
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(r).toMatchObject({ ok: false, code: "injoignable" });
    expect(!r.ok && r.message).not.toMatch(/fetch failed/);

    const slow = await getEquipe({
      ...base,
      timeoutMs: 20,
      fetch: (_u, init) =>
        new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")))),
    });
    expect(slow).toMatchObject({ ok: false, code: "injoignable" });
  });

  it("sans réglage, ne tente rien", async () => {
    const f = fake(200, {});
    const r = await getEquipe({ url: "", key: "", fetch: f.fetch });
    expect(r).toMatchObject({ ok: false, code: "reglage" });
    expect(f.calls).toHaveLength(0);
  });

  it("retirer : 204 ou 404 réussissent, l'adresse est encodée", async () => {
    const f = fake(204);
    expect(await retirerMembre("a+b@c.fr", { ...base, fetch: f.fetch })).toEqual({ ok: true });
    expect(f.calls[0].url).toBe("http://recipelog-passerelle:8000/v1/equipe/a%2Bb%40c.fr");
    expect(f.calls[0].init.method).toBe("DELETE");
    expect(await retirerMembre("a@c.fr", { ...base, fetch: fake(404, { error: "introuvable" }).fetch })).toEqual({ ok: true });
    expect((await retirerMembre("a@c.fr", { ...base, fetch: fake(503, { error: "authentik_indisponible" }).fetch })).ok).toBe(false);
  });

  it("renvoyer l'invitation", async () => {
    const f = fake(200, { invitationEnvoyee: true });
    expect(await renvoyerInvitation("a@b.fr", { ...base, fetch: f.fetch })).toEqual({ ok: true, invitationEnvoyee: true });
    expect(f.calls[0].url).toBe("http://recipelog-passerelle:8000/v1/equipe/a%40b.fr/invitation");
  });
});
