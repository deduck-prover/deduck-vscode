import * as vscode from 'vscode';
import { ProofError } from './runner';

export class ProofStatePanel {
  private view?: vscode.WebviewPanel;
  constructor() {}

  private asciiArt: string = `
      __
  >(o )___    DeDuck
   ( ._> /    \"No quacks, just facts.\"
  ~~~~~~~~~~
  
  
  Programming formal-deduction proofs
  
  CS 245 Logic and Computation (Spring 2025)
  University of Waterloo
  
  © Yizhou Zhang
  Version: 0.1.0`;

  activateView() {
    if (!this.view) {
      this.view = vscode.window.createWebviewPanel(
        'deduckProof',
        `DeDuck Proof State`,
        vscode.ViewColumn.Beside,
        {}
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

  private htmlOnSuccess(body: string): string {
    return `
      <html><body>
      <pre>${body}</pre>
      <pre style="font-size: 9px; color: #888;">${this.asciiArt}</pre>
      </body></html>`;
  }

  private htmlOnError(err: ProofError): string {
    return `
      <html><body>
      <div><pre>${err.state}</pre></div>
      <div><pre style="color:rgb(205, 70, 70);">${
        err.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }</pre></div>
      <pre style="font-size: 9px; color: #888;">${this.asciiArt}</pre>
      </body></html>`;
  }
}