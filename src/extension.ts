import * as vscode from 'vscode';
import * as path from 'path';
import { callClaude, reviewCode, SYSTEM_PROMPTS, ReviewIssue } from './claudeClient';
import { VroDiagnosticsProvider } from './diagnosticsProvider';
import { getWebviewContent } from './webviewContent';
import {
  gatherWorkspaceContext,
  formatContextForPrompt,
  ONBOARDING_SYSTEM,
} from './onboardingProvider';

let panel: vscode.WebviewPanel | undefined;
const diagnostics = new VroDiagnosticsProvider();
const obHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
const out = vscode.window.createOutputChannel('vRO AI Studio');

export function activate(context: vscode.ExtensionContext) {
  diagnostics.register(context);
  out.appendLine('vRO AI Studio activated');
  vscode.window.showInformationMessage('vRO AI Studio: extension activated ✓');

  context.subscriptions.push(
    vscode.commands.registerCommand('vroAiStudio.openPanel', () => {
      if (panel) { panel.reveal(); return; }
      panel = vscode.window.createWebviewPanel(
        'vroAiStudio', 'vRO AI Studio', vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        }
      );
      panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
      panel.onDidDispose(() => (panel = undefined), null, context.subscriptions);
      panel.webview.onDidReceiveMessage(
        (msg) => handleWebviewMessage(msg, panel!.webview),
        undefined, context.subscriptions
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vroAiStudio.reviewCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const code = editor.document.getText();
      ensurePanel(context);
      panel!.webview.postMessage({ type: 'fillCode', source: 'review', code });
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'vRO AI: Reviewing…' },
        async () => {
          try {
            const issues = await reviewCode(code);
            panel?.webview.postMessage({ type: 'reviewResult', issues });
          } catch (err: any) {
            vscode.window.showErrorMessage(`vRO AI: ${err.message}`);
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vroAiStudio.generateTests', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      ensurePanel(context);
      panel!.webview.postMessage({ type: 'fillCode', source: 'tests', code: editor.document.getText() });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vroAiStudio.explainWorkflow', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const sel = editor.selection;
      const code = sel.isEmpty ? editor.document.getText() : editor.document.getText(sel);
      ensurePanel(context);
      panel!.webview.postMessage({ type: 'fillCode', source: 'explain', code });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vroAiStudio.generateAction', async () => {
      ensurePanel(context);
      panel!.reveal();
    })
  );

  // Sidebar webview — pass view.webview directly (NOT view.webview as WebviewPanel)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('vroAiStudio.sidePanel', {
      resolveWebviewView(view) {
        view.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        };
        view.webview.html = getWebviewContent(view.webview, context.extensionUri);
        view.webview.onDidReceiveMessage(
          (msg) => handleWebviewMessage(msg, view.webview),
          undefined, context.subscriptions
        );
      },
    })
  );
}

function ensurePanel(context: vscode.ExtensionContext) {
  if (!panel) { vscode.commands.executeCommand('vroAiStudio.openPanel'); }
}

// ── All webview messages routed here — accepts vscode.Webview directly ──────
async function handleWebviewMessage(msg: any, webview: vscode.Webview) {
  // post() now uses the Webview object directly — no .webview property needed
  const post = (m: any) => webview.postMessage(m);

  out.appendLine(`[msg] type=${msg.type}`);
  vscode.window.showInformationMessage(`vRO AI Studio received: ${msg.type}`);

  try {
    switch (msg.type) {

      case 'generate': {
        const chips: string[] = msg.chips || [];
        const system = `${SYSTEM_PROMPTS.generator}\nInclude: ${chips.join(', ')}.`;
        const user = `Generate a vRO TypeScript action that: ${msg.prompt}
Input parameters: ${msg.inputs || 'none'}
Return type: ${msg.returnType || 'void'}
Use proper vRO TypeScript patterns with vro-types. ES5-compatible.`;
        out.appendLine('[generate] calling Claude...');
        const text = await callClaude(system, user);
        out.appendLine(`[generate] got ${text.length} chars, posting result`);
        post({ type: 'result', target: 'gen-out', btn: 'gen-btn', label: 'Generate Action', text });
        break;
      }

      case 'review': {
        const chips: string[] = msg.chips || [];
        const system = `You are a senior VMware Aria Orchestrator code reviewer.
Analyze vRO TypeScript/JavaScript for: ${chips.join(', ')}.
Respond ONLY with a JSON array: [{"severity":"error"|"warning"|"info","title":"...","description":"..."}]
No markdown fences, no extra text.`;
        out.appendLine('[review] calling Claude...');
        const result = await callClaude(system, `Review this vRO action:\n\n${msg.code}`);
        out.appendLine(`[review] got ${result.length} chars`);
        let issues: ReviewIssue[] = [];
        try { issues = JSON.parse(result.replace(/```json|```/g, '').trim()); } catch {}
        post({ type: 'reviewResult', issues });
        break;
      }

      case 'genTests': {
        const chips: string[] = msg.chips || [];
        const system = `${SYSTEM_PROMPTS.testGenerator}\nCover: ${chips.join(', ')}.`;
        out.appendLine('[genTests] calling Claude...');
        const text = await callClaude(system, `Generate Jasmine tests for:\n\n${msg.code}`);
        out.appendLine(`[genTests] got ${text.length} chars`);
        post({ type: 'result', target: 'test-out', btn: 'test-btn', label: 'Generate Tests', text });
        break;
      }

      case 'explain': {
        const fmts: Record<string, string> = {
          plain: 'Write a plain English explanation for a non-developer stakeholder.',
          docs: 'Write Markdown docs: purpose, parameters, return value, example.',
          readme: 'Write a README.md section: description, inputs, outputs, notes.',
          runbook: 'Write an ops runbook: what it does, when it runs, failure modes.',
        };
        const system = `${SYSTEM_PROMPTS.explainer} ${fmts[msg.format] || fmts.plain}`;
        out.appendLine('[explain] calling Claude...');
        const text = await callClaude(system, `Explain this vRO action:\n\n${msg.code}`);
        out.appendLine(`[explain] got ${text.length} chars`);
        post({ type: 'result', target: 'exp-out', btn: 'exp-btn', label: 'Explain', text });
        break;
      }

      case 'insertCode': {
        const editor = vscode.window.activeTextEditor;
        if (editor) { editor.edit((eb) => eb.insert(editor.selection.active, msg.code)); }
        break;
      }

      case 'saveTestFile': {
        const editor = vscode.window.activeTextEditor;
        const dir = editor ? path.dirname(editor.document.uri.fsPath)
          : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const base = editor
          ? path.basename(editor.document.uri.fsPath, path.extname(editor.document.uri.fsPath))
          : 'action';
        const specPath = path.join(dir, `${base}.spec.ts`);
        const uri = vscode.Uri.file(specPath);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(msg.code, 'utf8'));
        vscode.window.showTextDocument(uri);
        vscode.window.showInformationMessage(`Test file saved: ${path.basename(specPath)}`);
        break;
      }

      case 'obInit': {
        out.appendLine('[obInit] gathering workspace context...');
        const ctx = await gatherWorkspaceContext();
        const ctxText = formatContextForPrompt(ctx);
        out.appendLine('[obInit] context: ' + ctxText.slice(0, 200));
        const healthOk = ctx.healthIssues.length === 0;
        const healthMsg = healthOk
          ? 'All environment checks passed.'
          : `${ctx.healthIssues.length} issue(s): ${ctx.healthIssues[0]}`;
        const greeting = healthOk
          ? `Welcome! I scanned your environment — all checks passed.\n\nReady to walk through the 5 onboarding stages? Ask anything to get started.`
          : `Welcome! I found ${ctx.healthIssues.length} issue(s) to fix before mvn vro:push will work.\n\nTop issue: ${ctx.healthIssues[0]}\n\nWant help fixing this first?`;
        obHistory.length = 0;
        obHistory.push({ role: 'assistant', content: greeting });
        out.appendLine('[obInit] posting obGreet');
        post({ type: 'obGreet', text: greeting, health: healthMsg, healthOk });
        break;
      }

      case 'obChat': {
        out.appendLine('[obChat] gathering context + calling Claude...');
        const ctx = await gatherWorkspaceContext();
        const ctxText = formatContextForPrompt(ctx);
        const systemWithCtx = ONBOARDING_SYSTEM + '\n\n' + ctxText;
        obHistory.push({ role: 'user', content: msg.text });
        // Send full history as a single formatted user prompt
        const historyText = obHistory
          .map((m) => (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.content)
          .join('\n\n');
        const reply = await callClaude(systemWithCtx, historyText);
        out.appendLine(`[obChat] got ${reply.length} chars`);
        obHistory.push({ role: 'assistant', content: reply });
        post({ type: 'obReply', text: reply });
        break;
      }
    }
  } catch (err: any) {
    out.appendLine(`[error] ${err.message}`);
    post({ type: 'error', message: err.message });
  }
}

export function deactivate() {}
