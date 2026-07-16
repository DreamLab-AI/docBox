import * as vscode from 'vscode';
import { ChatViewProvider } from './chatView';
import { DocumentsViewProvider } from './documentsView';

// Entry point. code-server activates this the first time either docBox view is
// revealed (see activationEvents in package.json). We register the two webview
// providers and one command; there is no background work and no agent logic
// here. The heavy lifting lives in the control-plane server this talks to.
export function activate(context: vscode.ExtensionContext): void {
  const chat = new ChatViewProvider(context.extensionUri);
  const documents = new DocumentsViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chat),
    vscode.window.registerWebviewViewProvider(DocumentsViewProvider.viewId, documents),
    vscode.commands.registerCommand('docbox.refreshDocuments', () => {
      documents.refresh();
    }),
  );
}

export function deactivate(): void {
  // Nothing to tear down: the providers hold no timers or open sockets.
}
