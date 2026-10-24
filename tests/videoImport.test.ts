import { describe, expect, it } from "vitest";
import { detectPlatform, extractUrl, findJsonLdRecipes, frameTimes, subtitlesToText } from "@/lib/videoImport";

describe("detectPlatform", () => {
  it("reconnaît TikTok, Instagram, YouTube et le reste", () => {
    expect(detectPlatform("https://vm.tiktok.com/ZNabc/")).toBe("tiktok");
    expect(detectPlatform("https://www.tiktok.com/@chef/video/123")).toBe("tiktok");
    expect(detectPlatform("https://www.instagram.com/reel/abc/")).toBe("instagram");
    expect(detectPlatform("https://youtu.be/xyz")).toBe("youtube");
    expect(detectPlatform("https://www.marmiton.org/recettes/x.aspx")).toBe("web");
    expect(detectPlatform("https://notiktok.com/x")).toBe("web");
    expect(detectPlatform("pas un lien")).toBe("web");
  });
});

describe("extractUrl", () => {
  it("retrouve le lien dans le texte de partage TikTok", () => {
    expect(extractUrl("Regarde la vidéo de @chef ! #tiktok https://vm.tiktok.com/ZNabc/ ")).toBe("https://vm.tiktok.com/ZNabc/");
    expect(extractUrl("(voir https://exemple.fr/tarte).")).toBe("https://exemple.fr/tarte");
    expect(extractUrl("aucun lien")).toBeNull();
  });
});

describe("subtitlesToText", () => {
  it("retire horodatages, balises et répétitions", () => {
    const vtt = `WEBVTT
Kind: captions
Language: fr

00:00:00.000 --> 00:00:01.500
<c>Mettez 200 g de farine</c>

00:00:01.500 --> 00:00:03.000
Mettez 200 g de farine

2
00:00:03.000 --> 00:00:05.000
puis 3 œufs &amp; le sucre`;
    expect(subtitlesToText(vtt)).toBe("Mettez 200 g de farine\npuis 3 œufs & le sucre");
  });
});

describe("frameTimes", () => {
  it("répartit les images sur la durée", () => {
    expect(frameTimes(40, 4)).toEqual([5, 15, 25, 35]);
    expect(frameTimes(null, 8)).toEqual([0]);
    expect(frameTimes(3, 8)).toHaveLength(3);
    expect(frameTimes(60, 0)).toEqual([]);
  });
});

describe("findJsonLdRecipes", () => {
  it("trouve une recette directe ou dans un @graph", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"Recipe","name":"Tarte"}</script>
      <script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["Recipe","Thing"],"name":"Flan"}]}</script>
      <script type="application/ld+json">pas du json</script>
    </head><body></body></html>`;
    expect(findJsonLdRecipes(html).map((r) => (r as { name: string }).name)).toEqual(["Tarte", "Flan"]);
  });
});
