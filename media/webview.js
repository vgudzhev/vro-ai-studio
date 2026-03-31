// @ts-nocheck
/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();
const ALL_TABS = ['gen', 'rev', 'test', 'exp', 'ob'];

// ── Tab switching ────────────────────────────────────────────────────────────
function showTab(id) {
  document.querySelectorAll('.tab').forEach(function(t, i) {
    t.classList.toggle('active', ALL_TABS[i] === id);
  });
  document.querySelectorAll('.panel').forEach(function(p) {
    p.classList.remove('active');
  });
  document.getElementById('tab-' + id).classList.add('active');
  if (id === 'ob' && document.getElementById('ob-msgs').children.length === 0) {
    vscode.postMessage({ type: 'obInit' });
  }
}

// ── Chip toggles ─────────────────────────────────────────────────────────────
document.querySelectorAll('.chip').forEach(function(c) {
  c.addEventListener('click', function() { c.classList.toggle('on'); });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function getChips(group) {
  var selector = '.chip[data-group="' + group + '"].on';
  return Array.from(document.querySelectorAll(selector)).map(function(c) {
    return c.textContent.trim();
  });
}

function setLoading(btnId, outId, msg) {
  var btn = document.getElementById(btnId);
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Working...';
  var el = document.getElementById(outId);
  if (el) { el.className = 'output loading'; el.textContent = msg; }
}

function resetBtn(btnId, label) {
  var b = document.getElementById(btnId);
  if (b) { b.disabled = false; b.textContent = label; }
}

function copyText(id) {
  navigator.clipboard.writeText(document.getElementById(id).textContent);
}

function insertToEditor(id) {
  vscode.postMessage({ type: 'insertCode', code: document.getElementById(id).textContent });
}

function saveTestFile() {
  vscode.postMessage({ type: 'saveTestFile', code: document.getElementById('test-out').textContent });
}

// ── Tab actions ───────────────────────────────────────────────────────────────
function generate() {
  var p = document.getElementById('gen-prompt').value.trim();
  if (!p) return;
  setLoading('gen-btn', 'gen-out', 'Generating...');
  vscode.postMessage({
    type: 'generate',
    prompt: p,
    inputs: document.getElementById('gen-inputs').value,
    returnType: document.getElementById('gen-return').value,
    chips: getChips('gen')
  });
}

function review() {
  var c = document.getElementById('rev-code').value.trim();
  if (!c) return;
  var btn = document.getElementById('rev-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Working...';
  document.getElementById('rev-out').innerHTML = '<div class="output loading">Analyzing...</div>';
  vscode.postMessage({ type: 'review', code: c, chips: getChips('rev') });
}

function genTests() {
  var c = document.getElementById('test-code').value.trim();
  if (!c) return;
  setLoading('test-btn', 'test-out', 'Generating test suite...');
  vscode.postMessage({ type: 'genTests', code: c, chips: getChips('test') });
}

function explain() {
  var c = document.getElementById('exp-code').value.trim();
  if (!c) return;
  setLoading('exp-btn', 'exp-out', 'Analyzing workflow...');
  vscode.postMessage({
    type: 'explain',
    code: c,
    format: document.getElementById('exp-format').value
  });
}

// ── Onboarding chat ───────────────────────────────────────────────────────────
var OB_CHIPS = [
  ['Check my Java version', 'Run health script', 'Windows setup', 'Mac/Linux setup'],
  ['Show settings.xml template', 'Where is ~/.m2?', 'Add vRO connection profile', 'What is the packaging profile?'],
  ['Create TypeScript project', 'Which archetype for vRA+vRO?', 'Show project structure', 'Polyglot project'],
  ['Get a refresh token', 'SSL certificate error', 'Test my connection', 'Embedded vs standalone vRO'],
  ['Run mvn vro:push', 'Compile errors help', 'Push failed — diagnose', 'What does vro:pull do?']
];
var obStage = 0;
var obBusy = false;

function obSetStage(n) {
  obStage = Math.min(n, 4);
  for (var i = 0; i < 5; i++) {
    var el = document.getElementById('obs' + i);
    if (el) el.className = 'ob-stage' + (i < obStage ? ' done' : i === obStage ? ' active' : '');
  }
  obRenderChips();
}

function obRenderChips() {
  var q = document.getElementById('ob-quick');
  if (!q) return;
  q.innerHTML = '';
  OB_CHIPS[obStage].forEach(function(c) {
    var b = document.createElement('button');
    b.className = 'ob-qchip';
    b.textContent = c;
    b.onclick = function() { document.getElementById('ob-inp').value = c; obSend(); };
    q.appendChild(b);
  });
}

function obFmt(text) {
  var t = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // code blocks
  t = t.replace(/```([\s\S]*?)```/g, function(_, c) { return '<pre>' + c.trim() + '</pre>'; });
  // inline code
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  // newlines
  t = t.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  return t;
}

function obAddMsg(role, html) {
  var msgs = document.getElementById('ob-msgs');
  var wrap = document.createElement('div');
  wrap.className = 'ob-msg ' + role;
  var av = document.createElement('div');
  av.className = 'ob-av ' + role;
  av.textContent = role === 'bot' ? 'vRO' : 'You';
  var bub = document.createElement('div');
  bub.className = 'ob-bubble ' + role;
  bub.innerHTML = html;
  wrap.appendChild(av);
  wrap.appendChild(bub);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function obTyping(show) {
  if (show) {
    var msgs = document.getElementById('ob-msgs');
    var wrap = document.createElement('div');
    wrap.className = 'ob-msg bot';
    wrap.id = 'ob-typ';
    var av = document.createElement('div');
    av.className = 'ob-av bot';
    av.textContent = 'vRO';
    var bub = document.createElement('div');
    bub.className = 'ob-bubble bot';
    bub.style.padding = '10px 14px';
    bub.innerHTML = '<span class="ob-dot"></span><span class="ob-dot"></span><span class="ob-dot"></span>';
    wrap.appendChild(av);
    wrap.appendChild(bub);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  } else {
    var el = document.getElementById('ob-typ');
    if (el) el.remove();
  }
}

function obDetect(text) {
  var l = text.toLowerCase();
  if (obStage < 1 && (l.indexOf('settings.xml') >= 0 || l.indexOf('packaging profile') >= 0 || l.indexOf('~/.m2') >= 0)) obSetStage(1);
  else if (obStage < 2 && (l.indexOf('archetype') >= 0 || l.indexOf('first project') >= 0)) obSetStage(2);
  else if (obStage < 3 && (l.indexOf('refresh token') >= 0 || l.indexOf('vro.host') >= 0 || l.indexOf('vro:pull') >= 0)) obSetStage(3);
  else if (obStage < 4 && (l.indexOf('vro:push') >= 0 || l.indexOf('first push') >= 0)) obSetStage(4);
}

function obSend() {
  if (obBusy) return;
  var inp = document.getElementById('ob-inp');
  var text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  obBusy = true;
  document.getElementById('ob-send').disabled = true;
  obAddMsg('user', obFmt(text));
  obDetect(text);
  obTyping(true);
  vscode.postMessage({ type: 'obChat', text: text });
}

document.getElementById('ob-inp').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); obSend(); }
});

// ── Message handler ───────────────────────────────────────────────────────────
window.addEventListener('message', function(e) {
  var msg = e.data;

  if (msg.type === 'result') {
    var el = document.getElementById(msg.target);
    if (el) { el.className = 'output'; el.textContent = msg.text; }
    resetBtn(msg.btn, msg.label);
    return;
  }

  if (msg.type === 'reviewResult') {
    resetBtn('rev-btn', 'Review Code');
    var issues = msg.issues || [];
    if (!issues.length) {
      document.getElementById('rev-out').innerHTML = '<div class="output" style="color:var(--vscode-testing-iconPassed)">No issues found!</div>';
      return;
    }
    var sev = { error: 'Error', warning: 'Warning', info: 'Info' };
    var html = '';
    issues.forEach(function(i) {
      html += '<div class="issue ' + i.severity + '">'
            + '<div class="issue-title">' + (sev[i.severity] || 'Info') + ': ' + i.title + '</div>'
            + '<div class="issue-desc">' + i.description + '</div>'
            + '</div>';
    });
    document.getElementById('rev-out').innerHTML = html;
    return;
  }

  if (msg.type === 'fillCode') {
    var tabMap = { review: 'rev', tests: 'test', explain: 'exp' };
    var codeMap = { review: 'rev-code', tests: 'test-code', explain: 'exp-code' };
    if (tabMap[msg.source]) showTab(tabMap[msg.source]);
    if (codeMap[msg.source]) document.getElementById(codeMap[msg.source]).value = msg.code;
    return;
  }

  if (msg.type === 'obGreet') {
    obAddMsg('bot', obFmt(msg.text));
    obRenderChips();
    if (msg.health) {
      var h = document.getElementById('ob-health');
      h.className = 'ob-health ' + (msg.healthOk ? 'ok' : 'warn');
      h.textContent = msg.health;
    }
    return;
  }

  if (msg.type === 'obReply') {
    obTyping(false);
    obAddMsg('bot', obFmt(msg.text));
    obDetect(msg.text);
    obBusy = false;
    document.getElementById('ob-send').disabled = false;
    return;
  }

  if (msg.type === 'error') {
    var errMsg = 'Error: ' + msg.message;
    // Always reset all output areas and buttons — never depend on CSS class state
    ['gen-out', 'test-out', 'exp-out'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.className = 'output'; el.textContent = errMsg; }
    });
    document.getElementById('rev-out').innerHTML =
      '<div class="output" style="color:var(--vscode-editorError-foreground)">' + errMsg + '</div>';
    obTyping(false);
    if (obBusy) {
      obAddMsg('bot', obFmt(errMsg));
      obBusy = false;
      document.getElementById('ob-send').disabled = false;
    }
    ['gen-btn', 'rev-btn', 'test-btn', 'exp-btn'].forEach(function(id) {
      var b = document.getElementById(id);
      if (b) {
        b.disabled = false;
        if (id === 'gen-btn') b.textContent = 'Generate Action';
        else if (id === 'rev-btn') b.textContent = 'Review Code';
        else if (id === 'test-btn') b.textContent = 'Generate Tests';
        else b.textContent = 'Explain';
      }
    });
    return;
  }
});
