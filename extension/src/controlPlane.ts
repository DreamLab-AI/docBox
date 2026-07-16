import * as vscode from 'vscode';

// The Companion is a thin client. Every call goes to the docBox control-plane
// server, which owns the agent (pi) and the document store. Nothing here talks
// to a model or a datastore directly: it talks to the one server we own.
//
// The base URL is a setting (`docbox.controlPlaneUrl`). In the container the
// server sits behind oauth2-proxy on the same origin as code-server, so the
// browser's session cookie authenticates these requests with no token handling
// in the extension; the default points at the local dev server (README).

const DEFAULT_URL = 'http://127.0.0.1:8787';

export function controlPlaneUrl(): string {
  const configured = vscode.workspace
    .getConfiguration('docbox')
    .get<string>('controlPlaneUrl');
  const trimmed = configured?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_URL;
}

/** Join the configured base URL with an API path, tolerant of trailing slashes. */
export function apiUrl(path: string): string {
  const base = controlPlaneUrl().replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
