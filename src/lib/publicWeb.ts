import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blocked.addSubnet(network, prefix);
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [network, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address);
  return family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

export function publicHttpUrl(input: string | URL): URL {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error("Seules les adresses web publiques sur les ports standard sont acceptées.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new Error("Adresse réseau non publique.");
  return url;
}

async function requestPage(url: URL, signal: AbortSignal) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(host);
  const addresses = literalFamily ? [{ address: host, family: literalFamily }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Adresse réseau non publique.");
  }
  const { address, family } = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
    const req = request(url, {
      signal,
      agent: false,
      family,
      // Conserve le nom HTTP/TLS d'origine et utilise exactement l'adresse vérifiée.
      lookup: (_host, _options, callback) => callback(null, address, family),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeLog)", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" },
    }, resolve);
    req.on("error", reject);
    req.end();
  });
}

export async function readPublicPage(input: string): Promise<{ html: string; url: string }> {
  const signal = AbortSignal.timeout(30_000);
  let url = publicHttpUrl(input);
  for (let hops = 0; hops <= 5; hops++) {
    const response = await requestPage(url, signal);
    const status = response.statusCode ?? 500;
    if (status >= 300 && status < 400 && response.headers.location) {
      response.destroy();
      url = publicHttpUrl(new URL(response.headers.location, url));
      continue;
    }
    if (status < 200 || status >= 300) {
      response.destroy();
      throw new Error("La page répond " + status);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response) {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) throw new Error("La page dépasse 5 Mio.");
      chunks.push(chunk);
    }
    return { html: Buffer.concat(chunks).toString("utf8"), url: url.href };
  }
  throw new Error("Trop de redirections.");
}
