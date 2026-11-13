import { afterEach, describe, expect, it, vi } from "vitest";
import { posix, win32 } from "node:path";

afterEach(() => {
  vi.doUnmock("node:path");
  vi.resetModules();
});

for (const [name, paths, root] of [
  ["POSIX", posix, "/var/lib/recipelog/uploads"],
  ["Windows", win32, "C:\\recipelog\\uploads"],
] as const) {
  describe(`confinement des uploads ${name}`, () => {
    async function load() {
      vi.resetModules();
      vi.doMock("node:path", () => ({ ...paths, resolve: (...parts: string[]) => paths.resolve(root, ...parts) }));
      return import("@/lib/uploads");
    }

    it("accepte une image et une facture dans leur dossier", async () => {
      const { uploadFilePath, UPLOAD_DIR, fileFromUploadUrl } = await load();
      expect(uploadFilePath(["photos", "tarte.jpg"])).toBe(paths.join(UPLOAD_DIR, "photos", "tarte.jpg"));
      expect(uploadFilePath(["factures", "12-test.pdf"])).toBe(paths.join(UPLOAD_DIR, "factures", "12-test.pdf"));
      expect(fileFromUploadUrl("/uploads/photos/tarte%20citron.jpg")).toBe(paths.join(UPLOAD_DIR, "photos", "tarte citron.jpg"));
    });

    it("refuse les sorties, chemins absolus, segments composites et alias", async () => {
      const { uploadFilePath, fileFromUploadUrl } = await load();
      for (const parts of [[], ["..", "secret.jpg"], ["photos", "..", "factures", "1.jpg"], ["../secret.jpg"], ["..\\secret.jpg"], ["/tmp/secret.jpg"], ["C:\\secret.jpg"], ["C:secret.jpg"], [""], ["."], ["x\0.jpg"]]) {
        expect(uploadFilePath(parts), JSON.stringify(parts)).toBeNull();
      }
      expect(fileFromUploadUrl("/uploads/photos/%2e%2e/factures/1.jpg")).toBeNull();
      expect(fileFromUploadUrl("/uploads/photos%2f..%2ffactures/1.jpg")).toBeNull();
    });
  });
}
