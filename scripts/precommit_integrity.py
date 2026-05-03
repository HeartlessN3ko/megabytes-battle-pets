#!/usr/bin/env python3
"""
Pre-commit integrity check.

Runs against staged files. Catches the three failure modes that have
actually shipped to this repo via the Cowork Edit-tool truncation bug:

  (1) trailing null bytes  — a file ends with one or more 0x00 bytes
      (the classic null-padded truncation pattern). Hard fail.

  (2) syntax break in JS/JSON — file mid-truncated so the parser
      can't read it. Runs `node --check` on .js / Python json.loads
      on .json. Hard fail.

  (3) drastic shrinkage — staged file is < 70% of its tracked size
      AND the commit is not deleting the file. Soft warning unless
      the env var `ALLOW_SHRINK=1` is set, in which case the warning
      is suppressed.

Skipped paths: node_modules/, .git/, common binary types.

Exit code:
  0 = pass
  1 = hard fail (commit aborted by git)

Use as:
  git config core.hooksPath .githooks
"""
import os
import re
import shutil
import subprocess
import sys

SHRINK_THRESHOLD = 0.70
SKIP_RE = re.compile(r'(^|/)(node_modules|\.git|build|dist|coverage|\.next|\.expo)(/|$)')
BINARY_EXTS = {
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
    '.mp3', '.wav', '.mp4', '.mov', '.webm', '.ogg',
    '.zip', '.tar', '.gz', '.7z', '.pdf',
    '.ttf', '.otf', '.woff', '.woff2',
    '.aseprite', '.psd',
}
HARD_PARSE_EXTS = {'.js', '.cjs', '.mjs', '.json'}


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def staged_files():
    res = run(['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    if res.returncode != 0:
        return []
    return [p for p in res.stdout.splitlines() if p.strip()]


def deleted_files():
    res = run(['git', 'diff', '--cached', '--name-only', '--diff-filter=D'])
    if res.returncode != 0:
        return set()
    return set(p for p in res.stdout.splitlines() if p.strip())


def staged_blob(path):
    res = run(['git', 'show', f':{path}'])
    if res.returncode != 0:
        return None
    # capture_output=True with text=True decodes; we want bytes.
    res2 = subprocess.run(['git', 'show', f':{path}'], capture_output=True)
    return res2.stdout if res2.returncode == 0 else None


def head_size(path):
    res = subprocess.run(['git', 'cat-file', '-s', f'HEAD:{path}'], capture_output=True, text=True)
    if res.returncode != 0:
        return None
    try:
        return int(res.stdout.strip())
    except ValueError:
        return None


def check_trailing_nulls(path, content):
    if content and content.endswith(b'\x00'):
        # Find run length
        i = len(content)
        while i > 0 and content[i - 1] == 0:
            i -= 1
        run_len = len(content) - i
        return f'{path}: file ends with {run_len} trailing null byte(s) — likely truncation'
    return None


def check_js_parse(path, content):
    if not shutil.which('node'):
        return None  # no node available, skip
    # Write to a temp file because node --check expects a path
    tmp = f'/tmp/precommit_{os.getpid()}_{os.path.basename(path)}'
    try:
        with open(tmp, 'wb') as f:
            f.write(content)
        res = run(['node', '--check', tmp])
        if res.returncode != 0:
            err = (res.stderr or res.stdout).strip().splitlines()
            err = err[0] if err else 'parse error'
            return f'{path}: node --check failed — {err}'
        return None
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def check_json_parse(path, content):
    import json
    try:
        json.loads(content.decode('utf-8'))
        return None
    except Exception as e:
        return f'{path}: JSON parse failed — {e}'


def check_shrinkage(path, content, deleted):
    if path in deleted:
        return None
    prior = head_size(path)
    if prior is None or prior == 0:
        return None
    ratio = len(content) / prior
    if ratio < SHRINK_THRESHOLD:
        pct = int(ratio * 100)
        return f'{path}: staged is {pct}% of HEAD ({len(content)} vs {prior}) — large shrink'
    return None


def main():
    files = staged_files()
    if not files:
        return 0

    deleted = deleted_files()
    hard_fails = []
    soft_warns = []
    allow_shrink = os.environ.get('ALLOW_SHRINK', '').strip() in ('1', 'true', 'yes')

    for path in files:
        if SKIP_RE.search(path):
            continue
        ext = os.path.splitext(path)[1].lower()
        if ext in BINARY_EXTS:
            continue

        content = staged_blob(path)
        if content is None:
            continue

        # (1) trailing nulls — always
        msg = check_trailing_nulls(path, content)
        if msg:
            hard_fails.append(msg)
            continue  # truncated file: don't bother parsing

        # (2) parse check for JS/JSON
        if ext in HARD_PARSE_EXTS:
            if ext == '.json':
                msg = check_json_parse(path, content)
            else:
                msg = check_js_parse(path, content)
            if msg:
                hard_fails.append(msg)

        # (3) shrinkage warning
        if not allow_shrink:
            msg = check_shrinkage(path, content, deleted)
            if msg:
                soft_warns.append(msg)

    if soft_warns:
        sys.stderr.write('\n[pre-commit warning] file shrinkage detected:\n')
        for m in soft_warns:
            sys.stderr.write(f'  {m}\n')
        sys.stderr.write("(set ALLOW_SHRINK=1 to suppress, or fix the file)\n\n")

    if hard_fails:
        sys.stderr.write('\n[pre-commit FAIL] integrity check rejected this commit:\n')
        for m in hard_fails:
            sys.stderr.write(f'  {m}\n')
        sys.stderr.write('\nFix the listed files and re-stage. Trailing-null/parse failures usually\n')
        sys.stderr.write('mean the Cowork Edit tool truncated the file — restore via atomic write.\n\n')
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
