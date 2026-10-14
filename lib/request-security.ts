export function isSameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const internal = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || internal.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || internal.protocol.slice(0, -1);
  try {
    const supplied = new URL(origin);
    return !supplied.username && !supplied.password && supplied.host === host && supplied.protocol === `${protocol}:`;
  } catch { return false; }
}
