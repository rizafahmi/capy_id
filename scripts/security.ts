export const previewPolicyVersion = "restricted-html-v1";
export const permissionsPolicy =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(), autoplay=(), display-capture=()";
export const previewCsp =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
export function galleryCsp(previewOrigin: string): string {
  return `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; frame-src ${previewOrigin}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
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
  const common = `/*\n${Object.entries(headers)
    .map(([name, value]) => `  ${name}: ${value}`)
    .join("\n")}\n`;
  if (kind === "preview") return common;
  return `${common}/assets/*
  Cache-Control: public, max-age=31536000, immutable
/thumbnails/*
  Cache-Control: public, max-age=31536000, immutable
/assets/runs.json
  Cache-Control: public, max-age=0, must-revalidate
/evidence/*
  Content-Type: text/plain; charset=utf-8
  Content-Disposition: inline
`;
}
