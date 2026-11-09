import { describe, expect, it } from "vitest";
import { isPublicAddress, publicHttpUrl } from "@/lib/publicWeb";

describe("adresses d’import web", () => {
  it.each(["127.0.0.1", "10.1.2.3", "100.64.1.2", "169.254.169.254", "172.16.0.1", "192.168.0.1", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "2002:7f00:1::1"])("bloque %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each(["1.1.1.1", "2606:4700:4700::1111"])("accepte %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
  it.each(["file:///etc/passwd", "http://2130706433/", "http://user@public.example/", "https://public.example:8443/"])("refuse %s", (url) => {
    expect(() => publicHttpUrl(url)).toThrow();
  });
});
