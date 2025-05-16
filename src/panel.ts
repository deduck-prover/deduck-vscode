import * as vscode from 'vscode';
import { ProofError } from './runner';

export class ProofStatePanel {
  private view?: vscode.WebviewPanel;
  constructor() {}

  activateView() {
    if (!this.view) {
      this.view = vscode.window.createWebviewPanel(
        'deduckProof',
        `DeDuck Proof State`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: false,
          localResourceRoots: [
            vscode.Uri.file(__dirname),
            vscode.Uri.file(require('path').join(__dirname, '../images')),
            vscode.Uri.file(require('path').join(__dirname, '../styles'))
          ]
        }
      );
      this.view.onDidDispose(() => {
        this.view = undefined;
      });
    }
  }

  updateOnError(err: ProofError) {
    this.activateView();
    this.view.webview.html = this.htmlOnError(err);
  }

  updateOnSuccess(stateText: string) {
    this.activateView();
    this.view.webview.html = this.htmlOnSuccess(stateText);
  }

  init() {
    this.updateOnSuccess("");
  }

  private getCssUri(webview: vscode.Webview): vscode.Uri {
    const path = require('path');
    const cssPath = path.join(__dirname, '../styles/panel.css');
    return (webview as any).asWebviewUri(vscode.Uri.file(cssPath));
  }

  private getLogoUri(webview: vscode.Webview): vscode.Uri {
    const path = require('path');
    const logoPath = path.join(__dirname, '../images/icon.png');
    return (webview as any).asWebviewUri(vscode.Uri.file(logoPath));
  }

  private renderHtml(mainContent: string, spinLogo: boolean = false): string {
    if (!this.view) return '';
    const cssUri = this.getCssUri(this.view.webview);
    const logoUri = this.getLogoUri(this.view.webview);
    const spinClass = spinLogo ? ' deduck-logo-spin' : '';
    return `
      <html>
      <head>
        <meta name="color-scheme" content="dark light">
        <link rel="stylesheet" type="text/css" href="${cssUri}">
      </head>
      <body class="vscode">
        <div class="deduck-content">
          ${mainContent}
        </div>
        <div class="deduck-footer">
          <img src="${logoUri}" alt="DeDuck Logo" class="deduck-logo${spinClass}" />
          <div class="deduck-footer-text">
            <div class="deduck-title">The DeDuck Prover</div>
            <div class="deduck-subtitle">"No quacks, just facts."</div>
          </div>
        </div>
      </body>
      </html>`;
  }

  private htmlOnSuccess(body: string): string {
    const spinLogo = body.includes('Q.E.D.');
    const mainContent = `<pre class="proof-state">${body}</pre>`;
    return this.renderHtml(mainContent, spinLogo);
  }

  private htmlOnError(err: ProofError): string {
    const errorBox = `<div class="error-box">${err.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
    const mainContent = `<pre class="proof-state">${err.state}</pre>\n${errorBox}`;
    return this.renderHtml(mainContent);
  }
}