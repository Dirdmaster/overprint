"""Enforce contributor branch names in Git pre-push and CI."""
import argparse
import os
import re
import sys

BRANCH = re.compile(r'(feat|fix|chore|docs|refactor)/[1-9][0-9]*-[a-z0-9]+(?:-[a-z0-9]+)*')
EXCEPTIONS = {'main', 'chore/release-versions'}


def valid_branch(name):
    return name in EXCEPTIONS or BRANCH.fullmatch(name) is not None


def pushed_branches(lines):
    """Check source and destination branches, not the currently checked-out ref."""
    for line in lines:
        fields = line.split()
        if len(fields) != 4:
            raise ValueError('Invalid Git pre-push input: expected four fields per ref.')
        source, oid, destination, _ = fields
        if re.fullmatch(r'0+', oid):
            continue  # Deleting an old branch must remain possible.
        for ref in (source, destination):
            if ref.startswith('refs/heads/'):
                yield ref.removeprefix('refs/heads/')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--push', action='store_true', help='Read Git pre-push ref updates from stdin')
    parser.add_argument('--branch', help='Check a branch name directly; defaults to BRANCH_NAME in CI')
    args = parser.parse_args()
    try:
        names = list(pushed_branches(sys.stdin)) if args.push else [args.branch or os.environ.get('BRANCH_NAME', '')]
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    invalid = sorted({name for name in names if not valid_branch(name)})
    if not invalid:
        return 0
    print('Branch naming check failed: ' + ', '.join(repr(name) for name in invalid), file=sys.stderr)
    print('Use <type>/<issue-number>-<short-description>, for example fix/15-board-import.', file=sys.stderr)
    print('Types: feat, fix, chore, docs, refactor. Exceptions: main, chore/release-versions.', file=sys.stderr)
    print('Rename your branch with git branch -m <valid-name>, then push again.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
