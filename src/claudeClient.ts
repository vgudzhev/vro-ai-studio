import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ReviewIssue {
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  line?: number;
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('vroAiStudio');
  const apiKey           = cfg.get<string>('apiKey')           || process.env.ANTHROPIC_API_KEY || '';
  const endpoint         = cfg.get<string>('apiEndpoint')      || 'https://api.anthropic.com/v1/messages';
  const model            = cfg.get<string>('model')            || 'claude-sonnet-4-20250514';
  const llmProvider      = (cfg.get<string>('llmProvider')     || 'claude') as 'claude' | 'local' | 'anythingllm';
  const localLlmEndpoint = cfg.get<string>('localLlmEndpoint') || 'http://localhost:3001';
  const localLlmApiKey   = cfg.get<string>('localLlmApiKey')   || '';
  const localLlmModel    = cfg.get<string>('localLlmModel')    || '';
  return { apiKey, endpoint, model, llmProvider, localLlmEndpoint, localLlmApiKey, localLlmModel };
}

export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const { apiKey, endpoint, model,
          llmProvider, localLlmEndpoint, localLlmApiKey, localLlmModel } = getConfig();

  const isLocal       = llmProvider === 'local';
  const isAnythingLLM = llmProvider === 'anythingllm';

  if (!isLocal && !isAnythingLLM && !apiKey) {
    throw new Error(
      'No API key configured. Set vroAiStudio.apiKey in Settings or export ANTHROPIC_API_KEY.'
    );
  }
  if ((isLocal || isAnythingLLM) && !localLlmEndpoint) {
    throw new Error('No local LLM endpoint configured. Set vroAiStudio.localLlmEndpoint in Settings.');
  }
  if (isAnythingLLM && !localLlmModel) {
    throw new Error('No workspace slug configured. Set vroAiStudio.localLlmModel to your AnythingLLM workspace slug.');
  }

  // ── Request body ──────────────────────────────────────────────────────────
  let body: string;
  if (isAnythingLLM) {
    // Native AnythingLLM workspace API — system prompt prepended to message
    body = JSON.stringify({
      message: `${systemPrompt}\n\n---\n\n${userPrompt}`,
      mode: 'chat',
    });
  } else if (isLocal) {
    // OpenAI-compatible format
    body = JSON.stringify({
      model: localLlmModel || model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      stream: false,
    });
  } else {
    // Anthropic Claude format
    body = JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      stream: false,
    });
  }

  // ── Headers ───────────────────────────────────────────────────────────────
  const headers: Record<string, string | number> = {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
  };
  if (isAnythingLLM || isLocal) {
    if (localLlmApiKey) {
      headers['Authorization'] = `Bearer ${localLlmApiKey}`;
    }
  } else {
    headers['x-api-key']         = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  // ── Endpoint ──────────────────────────────────────────────────────────────
  let activeEndpoint: string;
  if (isAnythingLLM) {
    const base = localLlmEndpoint.replace(/\/$/, '');
    activeEndpoint = `${base}/api/v1/workspace/${localLlmModel}/chat`;
  } else if (isLocal) {
    activeEndpoint = localLlmEndpoint;
  } else {
    activeEndpoint = endpoint;
  }

  return new Promise((resolve, reject) => {
    const url = new URL(activeEndpoint);
    const transport = url.protocol === 'https:' ? https : http;

    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    // 90-second hard timeout
    const timer = setTimeout(() => {
      done(() => reject(new Error('Request timed out after 90 seconds. Check your API key and network.')));
      req.destroy();
    }, 90000);

    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          clearTimeout(timer);
          if (res.statusCode !== 200) {
            try {
              const err = JSON.parse(data);
              done(() => reject(new Error(err.error?.message || `HTTP ${res.statusCode}`)));
            } catch {
              done(() => reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`)));
            }
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (isAnythingLLM) {
              // Native AnythingLLM response: { textResponse: "..." }
              const text = (parsed as { textResponse?: string }).textResponse || '';
              done(() => resolve(text));
            } else if (isLocal) {
              // OpenAI-compatible response: { choices: [{ message: { content: "..." } }] }
              const text = (parsed as { choices?: Array<{ message?: { content?: string } }> })
                .choices?.[0]?.message?.content || '';
              done(() => resolve(text));
            } else {
              // Anthropic response: { content: [{ text: "..." }] }
              done(() => resolve(
                (parsed as { content?: Array<{ text?: string }> }).content?.[0]?.text || ''
              ));
            }
          } catch {
            done(() => reject(new Error('Failed to parse API response: ' + data.slice(0, 200))));
          }
        });
        res.on('error', (err: Error) => { clearTimeout(timer); done(() => reject(err)); });
      }
    );

    req.on('error', (err: Error) => { clearTimeout(timer); done(() => reject(err)); });
    req.write(body);
    req.end();
  });
}

export async function reviewCode(code: string): Promise<ReviewIssue[]> {
  const system = `You are a senior VMware Aria Orchestrator code reviewer. 
Analyze vRO TypeScript/JavaScript code for issues specific to the vRO/Aria platform.
Look for: blocking synchronous calls in async contexts, missing error handling, 
hardcoded credentials or endpoints, incorrect use of vRO APIs (System, Server, VcPlugin),
memory leaks, deprecated vRO patterns, and security issues.
Respond ONLY with a valid JSON array of issues. No markdown, no explanation outside the JSON.
Format: [{"severity":"error"|"warning"|"info","title":"short title","description":"detailed explanation","line":optional_line_number}]`;

  const result = await callClaude(system, `Review this vRO action code:\n\n${code}`);
  try {
    return JSON.parse(result.replace(/```json|```/g, '').trim());
  } catch {
    return [];
  }
}

export const SYSTEM_PROMPTS = {
  generator: `You are an expert VMware Aria Orchestrator (vRO) TypeScript developer.
Generate production-ready vRO action code using vro-types type definitions.
Use proper vRO APIs: System.log(), System.error(), Server.findAllForType(),
VcPlugin for vSphere operations, RESTHost for REST calls.
Output ONLY TypeScript code — no markdown fences, no explanation text.
Code must be ES5-compatible and work inside the vRO runtime.`,

  testGenerator: `You are an expert in testing VMware Aria Orchestrator TypeScript actions using Jasmine.
Generate a complete spec file with proper spies/mocks for vRO global APIs
(System, Server, VcPlugin, RESTHost, etc).
Use beforeEach to set up mocks. Cover happy path, null inputs, empty results, and API errors.
Output ONLY the TypeScript test code — no markdown fences, no explanation.`,

  explainer: `You are a VMware Aria Orchestrator expert.
Explain vRO actions and workflows clearly and accurately.
Reference vRO-specific concepts where relevant (action modules, scriptable tasks,
vRO inventory, workflows vs actions).`,

};
