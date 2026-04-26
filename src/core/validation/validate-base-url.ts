import { AppError } from "../errors";

const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const isIpv4 = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

const normalizeHost = (host: string) =>
  host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

const parseIpv4Octets = (host: string): number[] | null => {
  if (!isIpv4(host)) {
    return null;
  }

  const octets = host.split(".").map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
};

const isPrivateIpv4 = (host: string) => {
  const octets = parseIpv4Octets(host);
  if (!octets) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const parseIpv6Hextets = (host: string): number[] | null => {
  const normalized = normalizeHost(host).toLowerCase();
  if (!normalized.includes(":")) {
    return null;
  }

  let expandedHost = normalized;
  if (expandedHost.includes(".")) {
    const lastColon = expandedHost.lastIndexOf(":");
    if (lastColon === -1) {
      return null;
    }

    const ipv4Tail = parseIpv4Octets(expandedHost.slice(lastColon + 1));
    if (!ipv4Tail) {
      return null;
    }

    const leftWord = ((ipv4Tail[0] << 8) | ipv4Tail[1]).toString(16);
    const rightWord = ((ipv4Tail[2] << 8) | ipv4Tail[3]).toString(16);
    expandedHost = `${expandedHost.slice(0, lastColon)}:${leftWord}:${rightWord}`;
  }

  const parts = expandedHost.split("::");
  if (parts.length > 2) {
    return null;
  }

  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts[1] ? parts[1].split(":") : [];
  const missingCount = 8 - (left.length + right.length);

  if (parts.length === 1 && missingCount !== 0) {
    return null;
  }

  if (parts.length === 2 && missingCount < 1) {
    return null;
  }

  const hextets = [
    ...left,
    ...(parts.length === 2 ? Array.from({ length: missingCount }, () => "0") : []),
    ...right
  ];

  if (hextets.length !== 8 || hextets.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
    return null;
  }

  return hextets.map((part) => Number.parseInt(part, 16));
};

const isBlockedIpv6 = (host: string) => {
  const hextets = parseIpv6Hextets(host);
  if (!hextets) {
    return false;
  }

  const isLoopback = hextets.slice(0, 7).every((part) => part === 0) && hextets[7] === 1;
  if (isLoopback) {
    return true;
  }

  const firstBlock = hextets[0];
  if ((firstBlock & 0xfe00) === 0xfc00) {
    return true;
  }

  if ((firstBlock & 0xffc0) === 0xfe80) {
    return true;
  }

  const isIpv4Mapped =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff;

  if (!isIpv4Mapped) {
    return false;
  }

  const mappedIpv4 = [
    hextets[6] >> 8,
    hextets[6] & 0xff,
    hextets[7] >> 8,
    hextets[7] & 0xff
  ].join(".");

  return isPrivateIpv4(mappedIpv4);
};

export const validateBaseUrl = (baseUrl: string) => {
  let parsed: URL;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new AppError("invalid_base_url", "baseUrl must be a valid URL.", 400);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppError("invalid_base_url", "Only http:// or https:// baseUrl values are allowed.", 400);
  }

  if (parsed.username || parsed.password) {
    throw new AppError("invalid_base_url", "baseUrl must not include embedded credentials.", 400);
  }

  const host = normalizeHost(parsed.hostname.toLowerCase());
  if (blockedHosts.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new AppError("invalid_base_url", "Local and internal addresses are not allowed.", 400);
  }

  if (isPrivateIpv4(host) || isBlockedIpv6(host)) {
    throw new AppError("invalid_base_url", "Private network addresses are not allowed.", 400);
  }

  return parsed;
};
