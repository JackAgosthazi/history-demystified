/**
 * Export this project's Claude Code session as readable Markdown.
 *
 * The assignment asks for the AI interaction history. The raw JSONL is 5MB of
 * envelope, so this renders the conversation: what was asked, what was done,
 * and the tool calls in between, trimmed to a legible size.
 *
 * Secrets are redacted. The session contains an Anthropic API key that was
 * pasted into the chat, and shipping that in a submission would be worse than
 * shipping no transcript at all.
 *
 *   npm run transcript
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const PROJECT_DIR = path.join(
  os.homedir(),
  '.claude',
  'projects',
  '-Users-atman-Documents-code',
);
const OUT_DIR = path.join(process.cwd(), 'docs', 'transcripts');
/** Tool results are the bulk of the file and mostly noise for a reader. */
const MAX_TOOL_RESULT_CHARS = 600;
const MAX_TOOL_INPUT_CHARS = 1_200;

/** Anything shaped like a credential never reaches the output. */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // Deliberately matches partial keys too. A debug line printed the first
  // fourteen characters of the key; harmless on its own, but a transcript is
  // not the place to publish any part of a credential.
  [/sk-ant-[A-Za-z0-9_-]*/g, 'sk-ant-REDACTED'],
  [/sk-[A-Za-z0-9]{32,}/g, 'sk-REDACTED'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, 'gh-token-REDACTED'],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, 'jwt-REDACTED'],
];

function redact(text: string): string {
  return SECRET_PATTERNS.reduce((acc, [pattern, mask]) => acc.replace(pattern, mask), text);
}

function truncate(text: string, limit: number): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit)}\n… [${clean.length - limit} more characters]`;
}

interface Entry {
  type?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
}

function renderContent(content: unknown, out: string[]): void {
  if (typeof content === 'string') {
    out.push(redact(content));
    return;
  }
  if (!Array.isArray(content)) return;

  for (const block of content as Array<Record<string, unknown>>) {
    switch (block.type) {
      case 'text':
        out.push(redact(String(block.text ?? '')));
        break;
      case 'thinking':
        // Reasoning is not part of the record being asked for.
        break;
      case 'tool_use':
        out.push(
          `**→ ${String(block.name)}**\n\n\`\`\`json\n` +
            truncate(redact(JSON.stringify(block.input, null, 1)), MAX_TOOL_INPUT_CHARS) +
            '\n```',
        );
        break;
      case 'tool_result': {
        const raw =
          typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? (block.content as Array<Record<string, unknown>>)
                  .map((c) => (c.type === 'text' ? String(c.text) : `[${String(c.type)}]`))
                  .join('\n')
              : '';
        if (!raw.trim()) break;
        out.push(
          `<details><summary>result</summary>\n\n\`\`\`\n${truncate(
            redact(raw),
            MAX_TOOL_RESULT_CHARS,
          )}\n\`\`\`\n</details>`,
        );
        break;
      }
    }
  }
}

async function convert(file: string, title: string): Promise<string> {
  const raw = await readFile(file, 'utf8');
  const lines = raw.split('\n').filter(Boolean);

  const parts: string[] = [`# ${title}`, '', `${lines.length} entries.`, ''];
  let lastRole = '';

  for (const line of lines) {
    let entry: Entry;
    try {
      entry = JSON.parse(line) as Entry;
    } catch {
      continue;
    }
    const role = entry.message?.role;
    if (role !== 'user' && role !== 'assistant') continue;

    const rendered: string[] = [];
    renderContent(entry.message?.content, rendered);
    const body = rendered.filter((p) => p.trim()).join('\n\n');
    if (!body.trim()) continue;

    if (role !== lastRole) {
      parts.push('', '---', '', `### ${role === 'user' ? 'Jack' : 'Claude'}`, '');
      lastRole = role;
    }
    parts.push(body, '');
  }

  return parts.join('\n');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const sessions = (await readdir(PROJECT_DIR)).filter((f) => f.endsWith('.jsonl'));
  const written: string[] = [];

  for (const session of sessions) {
    const markdown = await convert(path.join(PROJECT_DIR, session), 'Claude Code session');
    const name = 'session.md';
    await writeFile(path.join(OUT_DIR, name), markdown);
    written.push(`${name} (${Math.round(markdown.length / 1024)}KB)`);
  }

  const subagentDir = path.join(PROJECT_DIR, sessions[0]?.replace('.jsonl', '') ?? '', 'subagents');
  const subagents = await readdir(subagentDir).catch(() => []);
  for (const file of subagents.filter((f) => f.endsWith('.jsonl'))) {
    const markdown = await convert(
      path.join(subagentDir, file),
      'Subagent — design critique of the grounding pipeline',
    );
    const name = 'subagent-design-critique.md';
    await writeFile(path.join(OUT_DIR, name), markdown);
    written.push(`${name} (${Math.round(markdown.length / 1024)}KB)`);
  }

  // A transcript that still contains a key is worse than none at all.
  for (const name of await readdir(OUT_DIR)) {
    const content = await readFile(path.join(OUT_DIR, name), 'utf8');
    const leak = /sk-ant-(?!REDACTED)[A-Za-z0-9_-]*/.exec(content);
    if (leak) throw new Error(`Redaction failed in ${name}`);
  }

  console.log(`Wrote to docs/transcripts:\n  ${written.join('\n  ')}`);
  console.log('Verified: no live credentials in output.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
