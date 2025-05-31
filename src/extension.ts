import * as vscode from 'vscode';
import { ProofStatePanel } from './panel';
import { ProofRunner } from './runner';
import { execSync } from 'child_process';

let panel: ProofStatePanel;
let runner: ProofRunner;
let successDecoration: vscode.TextEditorDecorationType;
let errorDecoration: vscode.TextEditorDecorationType;

// dictionary from text editors to the last lines that failed/passed
// 0-based line number of the last line that failed/passed
// -1 means no line has failed/passed
let lastLine: Map<vscode.Uri, {failed: number, passed: number}> = new Map();

export function activate(ctx: vscode.ExtensionContext) {
  // Create text decorations
  successDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(0, 255, 0, 0.2)',
    isWholeLine: true
  });
  errorDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    isWholeLine: true
  });

  const script = 'deduckprover.vscode';
  // Read Python interpreter path from configuration (fallback to "python")
  const config = vscode.workspace.getConfiguration('deduck-prover-vscode');
  const pythonPath = config.get<string>('pythonPath') || 'python';

  // Check Python version (must be >= 3.8)
  try {
    const versionOut = execSync(`${pythonPath} -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"`, { encoding: 'utf8' }).trim();
    const [major, minor] = versionOut.split('.').map(Number);
    if (major < 3 || (major === 3 && minor < 8)) {
      vscode.window.showErrorMessage(`Python >= 3.8 is required, but found version ${versionOut} at '${pythonPath}'. Please update your Python interpreter.`);
      return;
    }
  } catch (e: any) {
    vscode.window.showErrorMessage(`Could not find a Python interpreter.`);
    return;
  }

  // Check if the deduck-prover Python package is installed
  try {
    const pipShow = execSync(`${pythonPath} -m pip show deduck-prover`, { encoding: 'utf8' }).trim();
    console.log(`Found deduck-prover package:\n${pipShow}`);
  } catch (e: any) {
    vscode.window.showErrorMessage(`The Python package 'deduck-prover' is not installed in the selected environment (${pythonPath}). ${e.message}`);
    return;
  }
  
  // Pass the extension path directly to the runner
  runner = new ProofRunner(pythonPath, ['-m', script], ctx.extensionPath);

  panel = new ProofStatePanel();

  ctx.subscriptions.push(
    vscode.commands.registerCommand('deduck.runToCursor', runToCursor),
    vscode.commands.registerCommand('deduck.stepForward', stepForward),
    vscode.commands.registerCommand('deduck.stepBackward', stepBackward),
    vscode.commands.registerCommand('deduck.runToEnd', runToEnd),
    vscode.commands.registerCommand('deduck.reset', reset),
    // Add active text editor change listener
    vscode.window.onDidChangeActiveTextEditor(handleTextEditorChange),
    // Add document change listener
    vscode.workspace.onDidChangeTextDocument(handleDocumentChange),
    // Clean up decorations when extension deactivates
    { dispose: () => {
      successDecoration.dispose();
      errorDecoration.dispose();
    }}
  );

  // Fire the proof state panel
  panel.init()
}

function setTextDecorations() {
  const editor = vscode.window.activeTextEditor;
  let sucDeco;
  let errDeco;
  const lastLineFailed = lastLine.get(editor.document.uri)?.failed;
  const lastLinePassed = lastLine.get(editor.document.uri)?.passed;
  if (lastLineFailed < 0) {
    if (lastLinePassed < 0) {
      sucDeco = [];
      errDeco = [];
    } else {
      sucDeco = [new vscode.Range(0, 0, lastLinePassed, 0)];
      errDeco = [];
    }
  } else {
    if (lastLinePassed >= 0)
      sucDeco = [new vscode.Range(0, 0, lastLinePassed, 0)];
    else
      sucDeco = [];
    errDeco = [new vscode.Range(lastLineFailed, 0, lastLineFailed, 0)];
  }
  editor.setDecorations(successDecoration, sucDeco);
  editor.setDecorations(errorDecoration, errDeco);
}

async function runToLine(lineNum: number) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'deduck') return;

  if (lineNum < 0) {
    lastLine.set(editor.document.uri, {failed: -1, passed: -1});
    panel.updateOnSuccess("");
    setTextDecorations();
    return;
  }

  // If lineNum exceeds the number of lines in the document, set it to the last line
  if (lineNum >= editor.document.lineCount)
    lineNum = editor.document.lineCount - 1;

  const range = new vscode.Range(0, 0, lineNum + 1, 0);
  const lines = editor.document.getText(range);

  try {
    const result = await runner.run(lines);
    
    switch (result.type) {
      case 'success':
        panel.updateOnSuccess(result.output);
        lastLine.set(editor.document.uri, {failed: -1, passed: lineNum});
        setTextDecorations();
        break;
      case 'error':
        panel.updateOnError(result.err);
        lastLine.set(editor.document.uri, {failed: result.err.lineFailed, passed: result.err.lineChecked});
        setTextDecorations();
        break;
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Deduck runner error: ${err.message || err}`);
    // Clear both decorations on error
    editor.setDecorations(successDecoration, []);
    editor.setDecorations(errorDecoration, []);
  }
}

async function runToCursor() {
  const editor = vscode.window.activeTextEditor;
  const lineNum = editor.selection.active.line;
  await runToLine(lineNum);
}

async function stepForward() {
  const editor = vscode.window.activeTextEditor;
  const lastLineFailed = lastLine.get(editor.document.uri)?.failed;
  const lastLinePassed = lastLine.get(editor.document.uri)?.passed;
  let lineNum: number; 
  if (lastLineFailed >= 0) {
    lineNum = lastLineFailed;
  } else if (lastLinePassed >= 0) {
    lineNum = lastLinePassed + 1;
  } else {
    lineNum = 0;
  }
  await runToLine(lineNum);
}

async function stepBackward() {
  const editor = vscode.window.activeTextEditor;
  const lastLineFailed = lastLine.get(editor.document.uri)?.failed;
  const lastLinePassed = lastLine.get(editor.document.uri)?.passed;
  let lineNum: number;
  if (lastLineFailed >= 0) {
    lineNum = lastLineFailed - 1;
  } else if (lastLinePassed >= 0) {
    lineNum = lastLinePassed - 1;
  } else {
    lineNum = -1;
  }
  await runToLine(lineNum);
}

async function runToEnd() {
  const editor = vscode.window.activeTextEditor;
  const lineCount = editor.document.lineCount;
  await runToLine(lineCount - 1);
}

async function reset() {
  await runToLine(-1);
}

async function handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== event.document || editor.document.languageId !== 'deduck') {
    return;
  }
  const lastLinePassed = lastLine.get(editor.document.uri)?.passed;

  // Check if any change occurred before or at lastLinePassed
  const changes = event.contentChanges;
  for (const change of changes) {
    const changeStartLine = change.range.start.line;
    const changeText = change.text;
    const changeRangeStart = change.range.start;

    let lineToRunTo;
    if (changeRangeStart.character == editor.document.lineAt(changeRangeStart.line).text.length &&
     (changeText.startsWith('\n') || changeText.length == 0 && change.range.end.character == 0)) {
      // The change happens at the end of the line and is creating a newline or deleting an empty line
      lineToRunTo = changeStartLine;
    } else {
      lineToRunTo = changeStartLine - 1;
    }

    if (lineToRunTo <= lastLinePassed) {
      // Run to the line before the change
      await runToLine(lineToRunTo);
      break; // Only need to handle the first relevant change
    }
  }
}

async function handleTextEditorChange(editor: vscode.TextEditor) {
  const isDeduck = !!editor && editor.document && editor.document.languageId === 'deduck';
  vscode.commands.executeCommand('setContext', 'deduckEditorFocus', isDeduck);

  if (editor.document.languageId !== 'deduck') {
    return;
  }

  if (!lastLine.has(editor.document.uri)) {
    // If the document is new, initialize
    lastLine.set(editor.document.uri, {failed: -1, passed: -1});
    await runToLine(-1);
  } else {
    // If the document is not new, run to the last line visited
    const lastLineFailed = lastLine.get(editor.document.uri)?.failed;
    const lastLinePassed = lastLine.get(editor.document.uri)?.passed;
    if (lastLineFailed < 0) {
      await runToLine(lastLinePassed);
    } else {
      await runToLine(lastLineFailed);
    }
  }
}
