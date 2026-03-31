import * as vscode from 'vscode';
import { reviewCode, ReviewIssue } from './claudeClient';

export class VroDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private debounceTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('vroAiStudio');
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.diagnosticCollection);

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const cfg = vscode.workspace.getConfiguration('vroAiStudio');
        if (!cfg.get<boolean>('autoReviewOnSave')) return;
        if (!this.isVroFile(doc)) return;
        this.scheduleReview(doc);
      })
    );
  }

  private isVroFile(doc: vscode.TextDocument): boolean {
    return (
      (doc.languageId === 'typescript' || doc.languageId === 'javascript') &&
      !doc.fileName.includes('.spec.') &&
      !doc.fileName.includes('.test.')
    );
  }

  private scheduleReview(doc: vscode.TextDocument): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.runReview(doc), 500);
  }

  async runReview(doc: vscode.TextDocument): Promise<ReviewIssue[]> {
    const code = doc.getText();
    if (code.trim().length < 20) return [];

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'vRO AI: Reviewing...',
      },
      async () => {
        try {
          const issues = await reviewCode(code);
          this.applyDiagnostics(doc, issues);
          return issues;
        } catch (err: any) {
          vscode.window.showErrorMessage(`vRO AI Review failed: ${err.message}`);
          return [];
        }
      }
    );

    return [];
  }

  private applyDiagnostics(doc: vscode.TextDocument, issues: ReviewIssue[]): void {
    const diagnostics: vscode.Diagnostic[] = issues.map((issue) => {
      const line = Math.max(0, (issue.line ?? 1) - 1);
      const lineText = doc.lineAt(Math.min(line, doc.lineCount - 1));
      const range = lineText.range;

      const severity =
        issue.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : issue.severity === 'warning'
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information;

      const diag = new vscode.Diagnostic(
        range,
        `[vRO AI] ${issue.title}: ${issue.description}`,
        severity
      );
      diag.source = 'vRO AI Studio';
      return diag;
    });

    this.diagnosticCollection.set(doc.uri, diagnostics);
  }

  clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }
}
