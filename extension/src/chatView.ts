import * as vscode from 'vscode';
import { apiUrl } from './controlPlane';
import { getNonce } from './util';

// Messages the webview sends up to the extension host.
type InboundMessage = { type: 'send'; text: string };

// Messages the extension host posts down to the webview.
type OutboundMessage =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'reply'; text: string; done: true }
  | { type: 'error'; text: string };

/**
 * The Chat view: the docked replacement for the "chat bubble" (ADR-007). It is
 * a message list plus an input. A prompt is POSTed to the control-plane server,
 * which relays the pi engine's streaming events back; this view renders the
 * deltas as they arrive.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'docbox.chat';

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
      if (message.type === 'send' && message.text.trim().length > 0) {
        void this.send(message.text.trim());
      }
    });
  }

  private post(message: OutboundMessage): void {
    void this.view?.webview.postMessage(message);
  }

  private async send(prompt: string): Promise<void> {
    if (!this.view) {
      return;
    }
    this.post({ type: 'status', text: 'thinking…' });

    try {
      // ── Where pi connects ────────────────────────────────────────────────
      // The control-plane server runs the pi engine in RPC mode
      // (`pi --mode rpc`, corpus/12): it forwards this prompt and relays pi's
      // streaming event model (message deltas, thinking, tool_execution_*) back
      // as Server-Sent Events, matching the transport already chosen for the
      // control plane (ADR-005). Until that route lands (PRD-003, milestone M3)
      // the server may answer with a single JSON body; the reader below handles
      // both a live SSE stream and a plain reply, so the view is correct now and
      // needs no change when the stream is wired.
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        this.post({ type: 'error', text: `control plane returned ${response.status}` });
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream') && response.body) {
        await this.pipeStream(response.body);
        return;
      }

      const data = (await response.json().catch(() => null)) as { reply?: string } | null;
      this.post({ type: 'reply', text: data?.reply ?? '(empty reply)', done: true });
    } catch (error) {
      // This dev environment has no control plane, so a failure here is expected
      // until the box is built. Surface the reason rather than swallowing it.
      this.post({ type: 'error', text: `cannot reach control plane: ${(error as Error).message}` });
    }
  }

  /**
   * Read an SSE stream of pi deltas. Frames are separated by a blank line; each
   * `data:` line is one event, and a `[DONE]` sentinel closes the turn.
   */
  private async pipeStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) {
            continue;
          }
          const payload = line.slice('data:'.length).trim();
          if (payload === '[DONE]') {
            this.post({ type: 'reply', text: '', done: true });
            return;
          }
          this.post({ type: 'delta', text: payload });
        }
        boundary = buffer.indexOf('\n\n');
      }
    }

    this.post({ type: 'reply', text: '', done: true });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.css'),
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
  <title>docBox Chat</title>
</head>
<body>
  <div id="log" class="log" aria-live="polite"></div>
  <form id="composer" class="composer">
    <textarea id="input" rows="2" placeholder="Ask the agent for something bigger than this window…"></textarea>
    <button id="send" type="submit">Send</button>
  </form>
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    const log = document.getElementById('log');
    const form = document.getElementById('composer');
    const input = document.getElementById('input');

    // The current assistant bubble that streaming deltas append to.
    let streaming = null;

    function bubble(role, text) {
      const el = document.createElement('div');
      el.className = 'msg ' + role;
      el.textContent = text;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) { return; }
      bubble('user', text);
      streaming = null;
      input.value = '';
      vscodeApi.postMessage({ type: 'send', text });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'status') {
        streaming = bubble('assistant pending', msg.text);
      } else if (msg.type === 'delta') {
        if (!streaming || streaming.classList.contains('pending')) {
          streaming = bubble('assistant', '');
        }
        streaming.textContent += msg.text;
        log.scrollTop = log.scrollHeight;
      } else if (msg.type === 'reply') {
        if (msg.text) {
          if (!streaming || streaming.classList.contains('pending')) {
            streaming = bubble('assistant', '');
          }
          streaming.textContent += msg.text;
        }
        streaming = null;
      } else if (msg.type === 'error') {
        bubble('error', msg.text);
        streaming = null;
      }
    });
  </script>
</body>
</html>`;
  }
}
