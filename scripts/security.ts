export const previewPolicyVersion = "restricted-html-v1";
export const permissionsPolicy =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(), autoplay=(), display-capture=()";
export const previewCsp =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
export function galleryCsp(previewOrigin: string): string {
  return `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'none'; frame-src ${previewOrigin}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
}
export function responseHeaders(
  kind: "gallery" | "preview",
  previewOrigin: string,
): Record<string, string> {
  return {
    "Content-Security-Policy": kind === "preview" ? previewCsp : galleryCsp(previewOrigin),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": permissionsPolicy,
    "Strict-Transport-Security": "max-age=300",
    ...(kind === "gallery" ? { "X-Frame-Options": "DENY" } : {}),
  };
}
export function headerFile(kind: "gallery" | "preview", previewOrigin: string): string {
  const headers = responseHeaders(kind, previewOrigin);
  return `/*\n${Object.entries(headers)
    .map(([name, value]) => `  ${name}: ${value}`)
    .join(
      "\n",
    )}\n${kind === "gallery" ? "/evidence/*\n  Content-Type: text/plain; charset=utf-8\n  Content-Disposition: inline\n" : ""}`;
}
