import net from "node:net";
import { UnsupportedPlatformError, ValidationError } from "infra/errors";

export type Provider = {
  name: "youtube" | "x" | "tiktok" | "instagram";
  label: string;
  hosts: string[];
};

// Allowlist de hosts por plataforma. Comparação exata, sem subdomínios curinga.
const providers: Provider[] = [
  {
    name: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
  },
  {
    name: "x",
    label: "X",
    hosts: [
      "x.com",
      "www.x.com",
      "mobile.x.com",
      "twitter.com",
      "www.twitter.com",
      "mobile.twitter.com",
    ],
  },
  {
    name: "tiktok",
    label: "TikTok",
    hosts: [
      "tiktok.com",
      "www.tiktok.com",
      "m.tiktok.com",
      "vm.tiktok.com",
      "vt.tiktok.com",
    ],
  },
  {
    name: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "www.instagram.com"],
  },
];

const BLOCKED_HOSTNAMES = ["localhost", "localhost.localdomain"];
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home"];

function parseUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw invalidUrl("O link informado não é uma URL válida.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidUrl("O link precisa começar com http:// ou https://.");
  }

  if (url.username || url.password) {
    throw invalidUrl("O link não pode conter usuário ou senha.");
  }

  if (url.port) {
    throw invalidUrl("O link não pode indicar uma porta.");
  }

  const hostname = normalizeHostname(url.hostname);

  if (net.isIP(hostname)) {
    throw invalidUrl("Endereços IP não são aceitos.");
  }

  if (
    BLOCKED_HOSTNAMES.includes(hostname) ||
    BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    !hostname.includes(".")
  ) {
    throw invalidUrl("Endereços locais ou de rede privada não são aceitos.");
  }

  return { url, hostname };
}

function normalizeHostname(hostname: string) {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function invalidUrl(message: string) {
  return new ValidationError({
    message,
    action: "Cole o link completo do vídeo, como aparece no navegador.",
  });
}

function matches(provider: Provider, rawUrl: string) {
  try {
    return provider.hosts.includes(parseUrl(rawUrl).hostname);
  } catch {
    return false;
  }
}

function findByUrl(rawUrl: string): Provider {
  const { hostname } = parseUrl(rawUrl);
  const found = providers.find((provider) => provider.hosts.includes(hostname));

  if (!found) {
    throw new UnsupportedPlatformError({
      message: `A plataforma "${hostname}" não é suportada.`,
    });
  }

  return found;
}

const provider = {
  all: providers,
  matches,
  findByUrl,
};

export default provider;
