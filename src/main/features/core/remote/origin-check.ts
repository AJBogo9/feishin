/**
 * Reject cross-origin WebSocket handshakes.
 *
 * WebSockets are exempt from the same-origin policy and there is no CORS preflight, so without
 * this any page in any browser on the machine can open a socket to the remote server. That
 * matters because the connection handler short-circuits the app-level `authenticate` message when
 * both credential fields are blank, which the shipped help text explicitly offers as an option.
 */
export const isAllowedOrigin = (
    origin: string | undefined,
    host: string | undefined,
    forwardedHost?: string | string[] | undefined,
): boolean => {
    // Browsers always send Origin on a WS handshake (RFC 6455 4.1). A missing one means a native
    // client, which the same-origin policy was never protecting in the first place.
    if (!origin) return true;

    // The WebSocket API cannot set request headers, so a hostile page can forge neither of these.
    const forwarded = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    const allowed = [host, forwarded?.split(',')[0]?.trim()].filter(Boolean);

    if (allowed.length === 0) return false;

    try {
        // Compare host (hostname:port) rather than the full origin, so an https reverse proxy in
        // front of the http server still matches. X-Forwarded-Host covers the common nginx setup,
        // whose default is `proxy_set_header Host $proxy_host`.
        const originHost = new URL(origin).host;
        return allowed.includes(originHost);
    } catch {
        // "null" (sandboxed iframe, file://) and anything malformed. This must not throw: an
        // exception here escapes ws into the http server's 'upgrade' emit, and the process-wide
        // uncaughtException handler would take the whole path down with it.
        return false;
    }
};
