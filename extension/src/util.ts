// A per-render nonce for the webview Content-Security-Policy. VS Code's webview
// guidance requires that inline scripts carry a nonce so only the markup we
// author can run; the webview itself makes no network calls (the extension host
// does), so its CSP can otherwise be locked to `default-src 'none'`.
export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/** Best-effort MIME guess from a filename, used when uploading a document. */
export function mimeForName(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const table: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    webp: 'image/webp',
    heic: 'image/heic',
    txt: 'text/plain',
    md: 'text/markdown',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return table[ext] ?? 'application/octet-stream';
}
