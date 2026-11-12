#!/usr/bin/env node
// PreToolUse hook (Bash) for Claude Code. Ported from the Mar de Estrelas
// repo (Python) to Node so it runs on Windows + Git Bash too.
//
// Blocks, without asking:
//   * `git push` to `main` — every push to main publishes the site
//     (.github/workflows/deploy.yml runs on it). Allowed without asking:
//     `git push origin main:backup` and `git push [-u] origin <branch>`
//     (or `HEAD:<branch>`) for any branch that is not main.
//   * force push, deleting a remote branch, `+refspec`, `--all/--tags/--mirror`
//     and pushes whose destination cannot be judged (no refspec, bare HEAD).
//     One deletion is let through (owner, 12/11/2026: keep the project clean):
//     `git push <remote> --delete <branch>` of ONE branch, written out, that
//     is not main or backup and whose commits are all in another branch of
//     that remote (as last fetched), so nothing leaves the remote.
//   * `git add -f/--force` — the only ignored paths here are ignored on purpose
//     (.planning/, .claude/settings.local.json, logs).
//
// Input: JSON on stdin ({tool_name, tool_input:{command}}).
// Output: exit 0 lets it through; exit 2 blocks and shows the reason (stderr).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ALLOWED =
  "Allowed without asking: 'git push origin main:backup' and 'git push [-u] origin <branch>' " +
  "(or 'HEAD:<branch>') for any branch other than main, and 'git push origin --delete <branch>' for one branch " +
  'already contained in another remote branch. Pushing main publishes the site: ask the owner.';
const FORCE = new Set([
  '-f',
  '--force',
  '--delete',
  '-d',
  '--force-if-includes',
]);
const HARMLESS = new Set([
  '-u',
  '--set-upstream',
  '-q',
  '--quiet',
  '-v',
  '--verbose',
]);
const REF_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const REDIRECT_ATTACHED = /^(\d*>&\d+|\d*>>?\S+|\d*<\S+|&>>?\S+)$/;
const REDIRECT_LOOSE = /^(\d*>>?|\d*<|&>>?)$/;
const EXECUTORS = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'eval',
  'exec',
  'env',
  'command',
  'xargs',
  'sudo',
  'nohup',
  'timeout',
  'time',
  'nice',
  'script',
]);

function block(reason, hint = ALLOWED) {
  process.stderr.write(
    `BLOCKED by bloqueia-git-perigoso: ${reason}\n${hint}\n`
  );
  process.exit(2);
}

function segments(command) {
  return command
    .split(/\n|;|&&|\|\||\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// shlex-like split: respects single/double quotes
function tokens(segment) {
  const out = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      has = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

function withoutRedirects(args) {
  const out = [];
  let skip = false;
  for (const a of args) {
    if (skip) {
      skip = false;
      continue;
    }
    if (REDIRECT_LOOSE.test(a)) {
      skip = true;
      continue;
    }
    if (REDIRECT_ATTACHED.test(a)) continue;
    out.push(a);
  }
  return out;
}

function destinationOf(refspec) {
  if (refspec.includes(':')) {
    const [src, dst] = refspec.split(/:(.*)/s);
    if (!src || !dst) return null; // `:branch` deletes; `branch:` is not a refspec
    return dst;
  }
  if (refspec === 'HEAD') return null; // current branch: could be main
  return refspec;
}

// True for `<remote> --delete <branch>` (any order of the flag) when the
// branch is safe to drop: not main or backup, and contained in another
// remote-tracking branch of the same remote.
function deletesMergedBranch(args, cwd) {
  const flags = args.filter((a) => a.startsWith('-'));
  const targets = args.filter((a) => !a.startsWith('-'));
  if (flags.length !== 1 || !['--delete', '-d'].includes(flags[0]))
    return false;
  if (targets.length !== 2 || !targets.every((t) => REF_NAME.test(t))) {
    return false;
  }
  const [remote, branch] = targets;
  if (['main', 'backup', 'HEAD'].includes(branch)) return false;
  const ref = `refs/remotes/${remote}/${branch}`;
  try {
    const holders = execFileSync(
      'git',
      [
        'for-each-ref',
        '--contains',
        ref,
        '--format=%(refname)',
        `refs/remotes/${remote}`,
      ],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
      .split('\n')
      .filter((name) => name && name !== ref && !name.endsWith('/HEAD'));
    return holders.length > 0;
  } catch {
    return false; // unknown branch or not a repository: not provably merged
  }
}

function judgePush(seg, args, cwd) {
  if (deletesMergedBranch(args, cwd)) return;
  if (args.some((a) => FORCE.has(a) || a.startsWith('--force-with-lease'))) {
    block(`force push or remote branch deletion -> '${seg}'`);
  }
  if (args.some((a) => a.startsWith('+')))
    block(`'+' refspec forces the push -> '${seg}'`);
  const opts = args.filter((a) => a.startsWith('-'));
  if (opts.some((o) => !HARMLESS.has(o)))
    block(`push option that hides the destination -> '${seg}'`);
  const targets = args.filter((a) => !a.startsWith('-'));
  if (targets.length !== 2)
    block(`push without explicit remote and refspec -> '${seg}'`);
  const dest = destinationOf(targets[1]);
  if (dest === null || !REF_NAME.test(dest))
    block(`push destination cannot be judged -> '${seg}'`);
  if (dest === 'main' || dest.endsWith('/main'))
    block(`pushing main publishes the site -> '${seg}'`);
}

function judgeAdd(seg, args) {
  if (
    args.some(
      (a) => a === '-f' || a === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a)
    )
  ) {
    block(
      `'git add --force' adds an ignored path -> '${seg}'`,
      'Ignored paths (.planning/, .claude/settings.local.json, logs) are ignored on purpose; ask the owner.'
    );
  }
}

function main() {
  let data;
  try {
    data = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return;
  }
  if (data?.tool_name !== 'Bash') return;
  const command = data?.tool_input?.command ?? '';
  if (!/\bgit\b/.test(command)) return;
  if (!/\b(push|add)\b/.test(command)) return;

  for (const seg of segments(command)) {
    const toks = tokens(seg);
    if (!toks.length) continue;
    if (toks[0] === 'git') {
      // the subcommand is the first token after `git` and its global
      // options; `-c k=v`, `-C dir`, `--git-dir x` take a value. A later
      // `push` (as in `git stash push`) is an argument, not a push.
      let sub = 1;
      while (sub < toks.length && toks[sub].startsWith('-')) {
        const opt = toks[sub];
        const takesValue =
          ['-c', '-C', '--git-dir', '--work-tree', '--namespace'].includes(
            opt
          ) && !opt.includes('=');
        sub += takesValue ? 2 : 1;
      }
      if (sub >= toks.length) continue;
      if (toks[sub] !== 'push' && toks[sub] !== 'add') continue;
      const args = withoutRedirects(toks.slice(sub + 1));
      if (toks[sub] === 'push')
        judgePush(seg, args, data?.cwd || process.cwd());
      else judgeAdd(seg, args);
    } else if (
      EXECUTORS.has(toks[0].split('/').pop()) &&
      /\bgit\s+(-\S+\s+(\S+\s+)?)*push\b/.test(seg)
    ) {
      block(`push inside a subshell, destination cannot be judged -> '${seg}'`);
    }
  }
}

main();
