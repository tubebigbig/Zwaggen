import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SKIP_PREFIXES = ['Merge ', 'release: v'];

function shouldKeep(subject) {
  for (const p of SKIP_PREFIXES) if (subject.startsWith(p)) return false;
  return true;
}

export function renderEntry(version, dateIso, subjects) {
  const kept = subjects.filter(shouldKeep).map((s) => `- ${s}`);
  const body = kept.length ? kept.join('\n') : '- Initial release';
  return `## v${version} — ${dateIso}\n\n${body}\n`;
}

export function prependEntry(file, version, dateIso, subjects) {
  const raw = readFileSync(file, 'utf8');
  if (!raw.startsWith('# Changelog')) {
    throw new Error(`${file} does not start with "# Changelog" header`);
  }
  const marker = `## v${version} —`;
  if (raw.includes(marker)) return; // idempotent

  const headerEnd = raw.indexOf('\n', raw.indexOf('# Changelog')) + 1;
  const head = raw.slice(0, headerEnd);
  const rest = raw.slice(headerEnd);
  const entry = renderEntry(version, dateIso, subjects);
  const out = `${head}\n${entry}\n${rest.trimStart()}`;
  writeFileSync(file, out);
}

function commitSubjectsSince(prevTag) {
  const range = prevTag ? `${prevTag}..HEAD` : 'HEAD';
  const out = execSync(`git log ${range} --pretty=%s`, { encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

// CLI: node update-changelog.mjs <changelog-file> <version> [<prev-tag>]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , file, version, prevTag] = process.argv;
  if (!file || !version) {
    console.error('usage: node update-changelog.mjs <changelog-file> <version> [<prev-tag>]');
    process.exit(2);
  }
  const dateIso = new Date().toISOString().slice(0, 10);
  const subjects = commitSubjectsSince(prevTag || '');
  prependEntry(file, version, dateIso, subjects);
  console.log(`prepended v${version} entry (${subjects.length} commit subjects considered)`);
}
