import { describe, expect, it } from "vitest";
import { isMaintenanceEmail, maintenanceEmails } from "@/lib/auth/maintenance";

describe("compte de maintenance", () => {
  it("lit une ou plusieurs adresses, sans tenir compte des majuscules", () => {
    expect(maintenanceEmails(" Moi@Exemple.fr, autre@exemple.fr ")).toEqual(["moi@exemple.fr", "autre@exemple.fr"]);
    expect(maintenanceEmails("")).toEqual([]);
    expect(maintenanceEmails(undefined)).toEqual([]);
  });

  it("reconnaît l'adresse", () => {
    const env = "moi@exemple.fr";
    expect(isMaintenanceEmail("MOI@exemple.fr", env)).toBe(true);
    expect(isMaintenanceEmail("lui@exemple.fr", env)).toBe(false);
    expect(isMaintenanceEmail(null, env)).toBe(false);
  });

  it("sans réglage, personne n'est caché", () => {
    expect(isMaintenanceEmail("moi@exemple.fr", "")).toBe(false);
  });
});
