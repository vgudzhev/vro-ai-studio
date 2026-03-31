import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const htmlPath = path.join(extensionUri.fsPath, 'media', 'webview.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Inject the nonce-based CSP and replace the script tag with a nonced version
  const nonce = getNonce();
  html = html.replace(
    '<script>',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">\n<script nonce="${nonce}">`
  );

  return html;
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
