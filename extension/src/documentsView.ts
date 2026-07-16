import * as vscode from 'vscode';
import { apiUrl } from './controlPlane';
import { getNonce, mimeForName } from './util';

// A document as the control-plane server returns it (server/src/index.ts,
// mirroring DocumentInfo in the app's domain contract). Declared locally
// because the extension is a separate package and does not import app types.
interface DocumentInfo {
  id: string;
  name: string;
  ownerId: string;
  project: string;
  sizeKb: number;
  pages: number;
  mime: string;
  uploadedAt: number;
  ocr: 'pending' | 'processing' | 'done' | 'review' | 'failed' | string;
  ocrRoute: string;
  handwriting: boolean;
  confidence?: number;
  fieldsForReview?: number;
}

type InboundMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'upload' };

type OutboundMessage =
  | { type: 'documents'; items: DocumentInfo[] }
  | { type: 'busy'; text: string }
  | { type: 'error'; text: string };

/**
 * The Documents view: list what has been uploaded, show OCR status, and upload
 * more using the native VS Code file picker. This is the one document affordance
 * the VS Code explorer does not give us; browsing and editing files stays in the
 * explorer itself (ADR-007).
 */
export class DocumentsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'docbox.documents';

  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: InboundMessage) => {
      switch (message.type) {
        case 'ready':
        case 'refresh':
          void this.load();
          break;
        case 'upload':
          void this.upload();
          break;
      }
    });
  }

  /** Reload the list. Invoked by the view-title refresh command and on open. */
  public refresh(): void {
    void this.load();
  }

  private post(message: OutboundMessage): void {
    void this.view?.webview.postMessage(message);
  }

  private async load(): Promise<void> {
    if (!this.view) {
      return;
    }
    try {
      const response = await fetch(apiUrl('/api/documents'));
      if (!response.ok) {
        this.post({ type: 'error', text: `GET /api/documents returned ${response.status}` });
        return;
      }
      const items = (await response.json()) as DocumentInfo[];
      this.post({ type: 'documents', items });
    } catch (error) {
      this.post({ type: 'error', text: `cannot reach control plane: ${(error as Error).message}` });
    }
  }

  private async upload(): Promise<void> {
    const picks = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Upload to docBox',
      title: 'Select documents to upload',
      filters: { Documents: ['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp', 'heic', 'docx'] },
    });
    if (!picks || picks.length === 0) {
      return;
    }

    this.post({ type: 'busy', text: `uploading ${picks.length} file(s)…` });

    for (const uri of picks) {
      const name = uri.path.slice(uri.path.lastIndexOf('/') + 1) || 'upload.bin';
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        // The upload registers the document and queues OCR; the server decides
        // the OCR route (local vs a cloud provider) from config, so the per-file
        // privacy switch is honoured server-side (server/src/index.ts).
        const response = await fetch(apiUrl('/api/documents'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name,
            sizeKb: Math.max(1, Math.round(stat.size / 1024)),
            mime: mimeForName(name),
            pages: 1,
          }),
        });
        if (!response.ok) {
          void vscode.window.showErrorMessage(`docBox: upload failed for ${name} (${response.status})`);
        }
      } catch (error) {
        void vscode.window.showErrorMessage(`docBox: upload failed for ${name}: ${(error as Error).message}`);
      }
    }

    await this.load();
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'documents.css'),
    );
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>docBox Documents</title>
</head>
<body>
  <div class="toolbar">
    <button id="upload" type="button">Upload document</button>
    <span id="status" class="status"></span>
  </div>
  <ul id="list" class="list" aria-live="polite"></ul>
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    const list = document.getElementById('list');
    const status = document.getElementById('status');
    const uploadButton = document.getElementById('upload');

    uploadButton.addEventListener('click', () => {
      vscodeApi.postMessage({ type: 'upload' });
    });

    function badge(state) {
      const el = document.createElement('span');
      el.className = 'badge ' + state;
      el.textContent = state;
      return el;
    }

    function render(items) {
      list.textContent = '';
      if (!items.length) {
        status.textContent = 'No documents yet.';
        return;
      }
      status.textContent = items.length + ' document(s)';
      for (const doc of items) {
        const li = document.createElement('li');
        li.className = 'row';

        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = doc.name;

        const meta = document.createElement('span');
        meta.className = 'meta';
        const bits = [doc.project, doc.pages + 'p', doc.sizeKb + ' kB'];
        if (doc.handwriting) { bits.push('handwritten'); }
        if (typeof doc.confidence === 'number') {
          bits.push(Math.round(doc.confidence * 100) + '%');
        }
        meta.textContent = bits.join(' · ');

        li.appendChild(name);
        li.appendChild(badge(doc.ocr));
        li.appendChild(meta);
        list.appendChild(li);
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'documents') {
        render(msg.items);
      } else if (msg.type === 'busy') {
        status.textContent = msg.text;
      } else if (msg.type === 'error') {
        status.textContent = msg.text;
      }
    });

    // Ask the extension host for the list as soon as the view is live.
    vscodeApi.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
