import { describe, it, expect } from 'vitest'
import { extractExecutables, containsDestructiveCommand, getDestructiveExecutables, isDestructiveExecutable, extractFilesToDelete } from './extractExecutables'

describe('extractExecutables', () => {
  describe('basic commands', () => {
    it('extracts simple command', () => {
      expect(extractExecutables('ls -la')).toEqual(['ls'])
    })

    it('extracts piped commands', () => {
      expect(extractExecutables('ls -la | grep test')).toEqual(['ls', 'grep'])
    })

    it('extracts chained commands with &&', () => {
      expect(extractExecutables('cd /tmp && ls -la')).toEqual(['cd', 'ls'])
    })

    it('extracts chained commands with ;', () => {
      expect(extractExecutables('echo hello; pwd')).toEqual(['echo', 'pwd'])
    })

    it('extracts commands on multiple lines', () => {
      expect(extractExecutables('echo hello\nls -la\npwd')).toEqual(['echo', 'ls', 'pwd'])
    })
  })

  describe('git and subcommand handling', () => {
    it('extracts git with subcommand', () => {
      expect(extractExecutables('git add .')).toEqual(['git add'])
    })

    it('extracts multiple git commands', () => {
      expect(extractExecutables('git add . && git commit -m "test"')).toEqual(['git add', 'git commit'])
    })

    it('extracts npm with subcommand', () => {
      expect(extractExecutables('npm install lodash')).toEqual(['npm install'])
    })

    it('extracts docker with subcommand', () => {
      expect(extractExecutables('docker run -it ubuntu')).toEqual(['docker run'])
    })

    it('extracts gh with subcommand', () => {
      expect(extractExecutables('gh copilot --help')).toEqual(['gh copilot'])
    })

    it('extracts gh issue subcommand', () => {
      expect(extractExecutables('gh issue list')).toEqual(['gh issue'])
    })

    it('extracts gh pr subcommand', () => {
      expect(extractExecutables('gh pr create --title "test"')).toEqual(['gh pr'])
    })

    it('extracts gh auth subcommand', () => {
      expect(extractExecutables('gh auth login')).toEqual(['gh auth'])
    })

    it('extracts multiple gh commands in chain', () => {
      expect(extractExecutables('gh auth login && gh issue list')).toEqual(['gh auth', 'gh issue'])
    })
  })

  describe('environment variables and paths', () => {
    it('handles PATH export', () => {
      expect(extractExecutables('export PATH="/usr/bin:$PATH"')).toEqual(['export'])
    })

    it('handles env var assignments followed by command', () => {
      expect(extractExecutables('FOO=bar ls')).toEqual(['ls'])
    })

    it('strips path prefixes from commands', () => {
      expect(extractExecutables('/usr/bin/ls -la')).toEqual(['ls'])
    })
  })

  describe('command prefixes', () => {
    it('skips sudo and extracts actual command', () => {
      expect(extractExecutables('sudo apt-get install vim')).toEqual(['apt-get'])
    })

    it('skips env prefix', () => {
      expect(extractExecutables('env VAR=1 python script.py')).toEqual(['python'])
    })
  })

  describe('heredocs - Issue #23', () => {
    it('excludes heredoc content with single-quoted marker', () => {
      const command = `cat > /tmp/file << 'EOF'
content here
more content
EOF
node script.js`
      const result = extractExecutables(command)
      expect(result).toContain('cat')
      expect(result).toContain('node')
      expect(result).not.toContain('content')
      expect(result).not.toContain('EOF')
    })

    it('excludes heredoc content with double-quoted marker', () => {
      const command = `cat > /tmp/file <<"MARKER"
some content
MARKER
next-command`
      const result = extractExecutables(command)
      expect(result).toContain('cat')
      expect(result).toContain('next-command')
      expect(result).not.toContain('some')
      expect(result).not.toContain('MARKER')
    })

    it('excludes heredoc content with unquoted marker', () => {
      const command = `cat > /tmp/file <<EOF
content
EOF
next`
      const result = extractExecutables(command)
      expect(result).toContain('cat')
      expect(result).toContain('next')
      expect(result).not.toContain('content')
    })

    it('handles heredoc with space after <<', () => {
      const command = `cat > /tmp/file << EOF
content
EOF
next`
      const result = extractExecutables(command)
      expect(result).toContain('cat')
      expect(result).toContain('next')
    })

    it('handles heredoc with trailing spaces after closing marker', () => {
      const command = `cat <<EOF
content
EOF  
next`
      const result = extractExecutables(command)
      expect(result).toContain('cat')
      expect(result).toContain('next')
    })

    it('excludes JavaScript keywords from heredoc content - Issue #23 main example', () => {
      // This is the exact scenario from the bug report
      const command = `export PATH="/opt/homebrew/opt/node.js/bin:/opt/homebrew/bin:$PATH" && cd /Users/idofrizler/Git/openwork && cat > /tmp/test-azure.mjs << 'EOF'
// Test Azure OpenAI API directly
const endpoint = 'https://.openai.azure.com';
const apiKey = '';
const deployments = ['gpt-5-chat', 'gpt-5.2-chat', 'DeepSeek-V3.1'];

async function testDeployment(deployment) {
const url = endpoint + '/openai/deployments/' + deployment;
try {
const response = await fetch(url, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'api-key': apiKey,
},
body: JSON.stringify({
messages: [{ role: 'user', content: 'Say hello in 5 words' }],
max_tokens: 50,
}),
});
const data = await response.json();
if (data.error) {
console.log('error: ' + data.error.message);
} else {
console.log('success: ' + data.choices[0].message.content);
}
} catch (e) {
console.log('error: ' + e.message);
}
}

for (const d of deployments) {
await testDeployment(d);
}
EOF
node /tmp/test-azure.mjs`

      const result = extractExecutables(command)
      
      // Should extract actual shell commands
      expect(result).toContain('export')
      expect(result).toContain('cd')
      expect(result).toContain('cat')
      expect(result).toContain('node')
      
      // Should NOT extract JavaScript keywords from heredoc content
      expect(result).not.toContain('const')
      expect(result).not.toContain('async')
      expect(result).not.toContain('try')
      expect(result).not.toContain('catch')
      expect(result).not.toContain('for')
      expect(result).not.toContain('if')
      expect(result).not.toContain('else')
      expect(result).not.toContain('EOF')
      expect(result).not.toContain('function')
      expect(result).not.toContain('await')
    })

    it('handles heredoc without closing marker (truncated command)', () => {
      const command = `cat > /tmp/file << 'EOF'
const x = 1;
async function test() {}`
      // Heredoc not closed - should remove everything after <<
      const result = extractExecutables(command)
      expect(result).toContain('cat')
      expect(result).not.toContain('const')
      expect(result).not.toContain('async')
    })

    it('handles multiple heredocs in one command', () => {
      const command = `cat > /tmp/a <<'A'
content a
A
cat > /tmp/b <<'B'
content b
B
echo done`
      const result = extractExecutables(command)
      expect(result).toContain('cat')
      expect(result).toContain('echo')
      expect(result).not.toContain('content')
    })
  })

  describe('shell comments - Issue #82', () => {
    it('ignores words in comments', () => {
      const command = `# Get the position of the window and calculate = button position
# Standard calculator layout: = is bottom right
osascript -e 'tell application "System Events" to tell process "Calculator" to get position of window 1'
osascript -e 'tell application "System Events" to tell process "Calculator" to get size of window 1'`
      const result = extractExecutables(command)
      expect(result).toEqual(['osascript'])
      expect(result).not.toContain('Get')
      expect(result).not.toContain('Standard')
    })

    it('ignores inline comments', () => {
      expect(extractExecutables('ls -la # list files')).toEqual(['ls'])
    })

    it('handles comment at end of line', () => {
      expect(extractExecutables('echo hello # print greeting')).toEqual(['echo'])
    })

    it('handles comment-only lines mixed with commands', () => {
      const command = `# first comment
ls -la
# second comment
pwd`
      const result = extractExecutables(command)
      expect(result).toEqual(['ls', 'pwd'])
    })

    it('does not treat # inside double quotes as comment', () => {
      expect(extractExecutables('echo "test #123"')).toEqual(['echo'])
      expect(extractExecutables('git commit -m "fix #456"')).toEqual(['git commit'])
    })

    it('does not treat # inside single quotes as comment', () => {
      expect(extractExecutables("echo '#hashtag'")).toEqual(['echo'])
    })
  })

  describe('string literals', () => {
    it('ignores content in double quotes', () => {
      expect(extractExecutables('echo "hello world"')).toEqual(['echo'])
    })

    it('ignores content in single quotes', () => {
      expect(extractExecutables("echo 'hello world'")).toEqual(['echo'])
    })

    it('ignores content in backticks', () => {
      expect(extractExecutables('echo `date`')).toEqual(['echo'])
    })
  })

  describe('redirections', () => {
    it('handles output redirection', () => {
      expect(extractExecutables('echo hello > file.txt')).toEqual(['echo'])
    })

    it('handles stderr redirection with pipe', () => {
      // Redirection without space is tricky - use with pipe instead
      expect(extractExecutables('command 2>/dev/null | cat')).toContain('cat')
    })

    it('handles stderr to stdout redirection with &&', () => {
      // Redirection at end of command works better with chained commands
      expect(extractExecutables('command 2>&1 && echo done')).toContain('echo')
    })

    it('does not detect numeric arguments as commands - Issue #121', () => {
      // The "1" argument should not be detected as a command
      const command = 'cd /Users/idofrizler/Git/uniclaw && ./scripts/analytics.sh 1 2>&1'
      const result = extractExecutables(command)
      expect(result).toContain('cd')
      expect(result).toContain('analytics.sh')
      expect(result).not.toContain('1')
    })

    it('handles scripts with .sh extension', () => {
      expect(extractExecutables('./run.sh')).toEqual(['run.sh'])
    })

    it('handles scripts with multiple numeric arguments', () => {
      const result = extractExecutables('./process.sh 1 2 3 2>&1')
      expect(result).toEqual(['process.sh'])
      expect(result).not.toContain('1')
      expect(result).not.toContain('2')
      expect(result).not.toContain('3')
    })
  })

  describe('shell builtins - Issue #50', () => {
    it('excludes true from || true pattern', () => {
      const command = 'which node npm 2>&1 || echo "not found"; cat /tmp/.nvmrc 2>&1 || true'
      const result = extractExecutables(command)
      expect(result).toContain('which')
      expect(result).toContain('echo')
      expect(result).toContain('cat')
      expect(result).not.toContain('true')
    })

    it('excludes false from && false pattern', () => {
      expect(extractExecutables('ls -la && false')).toEqual(['ls'])
    })

    it('excludes true when used standalone', () => {
      expect(extractExecutables('ls -la || true')).toEqual(['ls'])
    })

    it('excludes shell keywords from for loops', () => {
      const command = 'for f in ~/.copilot/logs/*.log; do echo "=== $f ==="; head -30 "$f" | grep -i "cwd" || true; done'
      const result = extractExecutables(command)
      expect(result).toContain('echo')
      expect(result).toContain('head')
      expect(result).toContain('grep')
      expect(result).not.toContain('for')
      expect(result).not.toContain('in')
      expect(result).not.toContain('do')
      expect(result).not.toContain('done')
      expect(result).not.toContain('true')
      expect(result).not.toContain('f')
    })

    it('excludes loop variable from for loops with command substitution - Issue #102', () => {
      const command = 'for f in $(ls -t ~/.copilot/session-state/*/events.jsonl 2>/dev/null | head -5); do echo "=== $f ==="; grep "compaction" "$f" 2>/dev/null | tail -3; done'
      const result = extractExecutables(command)
      // Note: ls is inside $(...) which gets stripped as a string literal, so only the loop body commands are extracted
      expect(result).toContain('head')
      expect(result).toContain('echo')
      expect(result).toContain('grep')
      expect(result).toContain('tail')
      expect(result).not.toContain('for')
      expect(result).not.toContain('in')
      expect(result).not.toContain('do')
      expect(result).not.toContain('done')
      // This is the main bug fix - 'f' should not be extracted as a command
      expect(result).not.toContain('f')
    })

    it('excludes loop variable from multiline for loops - Issue #102', () => {
      const command = `for f in $(ls -t ~/.copilot/session-state/*/events.jsonl 2>/dev/null | head -10); do
compaction=$(grep -c "compaction" "$f" 2>/dev/null || echo 0)
if [ "$compaction" -gt "0" ]; then
echo "=== $f (compactions: $compaction) ==="
grep "compaction_complete" "$f" 2>/dev/null | jq -r '.data.success // "N/A"' 2>/dev/null | sort | uniq -c
fi
done`
      const result = extractExecutables(command)
      expect(result).toContain('head')
      expect(result).toContain('echo')
      expect(result).toContain('grep')
      expect(result).toContain('jq')
      expect(result).toContain('sort')
      expect(result).toContain('uniq')
      // Loop variable 'f' should not be extracted
      expect(result).not.toContain('f')
      // Shell keywords should not be extracted
      expect(result).not.toContain('for')
      expect(result).not.toContain('in')
      expect(result).not.toContain('do')
      expect(result).not.toContain('done')
      expect(result).not.toContain('if')
      expect(result).not.toContain('then')
      expect(result).not.toContain('fi')
    })

    it('excludes loop variable from for loops with comments - Issue #102', () => {
      const command = `for f in $(ls -t ~/.copilot/session-state/*/events.jsonl 2>/dev/null | head -20); do
  # Find compaction with success: null (not true)
  if grep -q '"session.compaction_complete".*"success":null' "$f" 2>/dev/null; then
    session=$(basename $(dirname "$f"))
    echo "=== $session has null compaction ==="
    # Show last few events
    tail -5 "$f" | jq -r '.type' 2>/dev/null | head -5
  fi
done`
      const result = extractExecutables(command)
      expect(result).toContain('head')
      expect(result).toContain('grep')
      expect(result).toContain('echo')
      expect(result).toContain('tail')
      expect(result).toContain('jq')
      // Loop variable 'f' should not be extracted
      expect(result).not.toContain('f')
      // Words from comments should not be extracted
      expect(result).not.toContain('Find')
      expect(result).not.toContain('Show')
    })

    it('excludes shell keywords from if statements', () => {
      const command = 'if test -f file.txt; then cat file.txt; else echo missing; fi'
      const result = extractExecutables(command)
      expect(result).toContain('test')
      expect(result).toContain('cat')
      expect(result).toContain('echo')
      expect(result).not.toContain('if')
      expect(result).not.toContain('then')
      expect(result).not.toContain('else')
      expect(result).not.toContain('fi')
    })
  })

  describe('destructive command detection - Issue #65', () => {
    describe('isDestructiveExecutable', () => {
      it('detects rm as destructive', () => {
        expect(isDestructiveExecutable('rm')).toBe(true)
      })

      it('detects rmdir as destructive', () => {
        expect(isDestructiveExecutable('rmdir')).toBe(true)
      })

      it('detects shred as destructive', () => {
        expect(isDestructiveExecutable('shred')).toBe(true)
      })

      it('detects unlink as destructive', () => {
        expect(isDestructiveExecutable('unlink')).toBe(true)
      })

      it('does not detect ls as destructive', () => {
        expect(isDestructiveExecutable('ls')).toBe(false)
      })

      it('does not detect cat as destructive', () => {
        expect(isDestructiveExecutable('cat')).toBe(false)
      })

      it('detects git reset as destructive', () => {
        expect(isDestructiveExecutable('git reset')).toBe(true)
      })

      it('detects git clean as destructive', () => {
        expect(isDestructiveExecutable('git clean')).toBe(true)
      })
    })

    describe('containsDestructiveCommand', () => {
      it('detects rm command', () => {
        expect(containsDestructiveCommand('rm -rf /tmp/test')).toBe(true)
      })

      it('detects rm with full path', () => {
        expect(containsDestructiveCommand('/bin/rm -rf /tmp/test')).toBe(true)
      })

      it('detects rm in pipeline', () => {
        expect(containsDestructiveCommand('ls | xargs rm')).toBe(true)
      })

      it('detects rm in chained commands', () => {
        expect(containsDestructiveCommand('cd /tmp && rm -rf test')).toBe(true)
      })

      it('detects find with -delete', () => {
        expect(containsDestructiveCommand('find /tmp -name "*.tmp" -delete')).toBe(true)
      })

      it('detects find with -exec rm', () => {
        expect(containsDestructiveCommand('find /tmp -name "*.tmp" -exec rm {} \\;')).toBe(true)
      })

      it('detects find with -exec /bin/rm', () => {
        expect(containsDestructiveCommand('find /tmp -name "*.tmp" -exec /bin/rm {} \\;')).toBe(true)
      })

      it('does not flag find without -delete or -exec rm', () => {
        expect(containsDestructiveCommand('find /tmp -name "*.log"')).toBe(false)
      })

      it('does not flag safe commands', () => {
        expect(containsDestructiveCommand('ls -la')).toBe(false)
        expect(containsDestructiveCommand('cat file.txt')).toBe(false)
        expect(containsDestructiveCommand('grep pattern file.txt')).toBe(false)
      })

      it('detects shred command', () => {
        expect(containsDestructiveCommand('shred -u secret.txt')).toBe(true)
      })

      it('detects rmdir command', () => {
        expect(containsDestructiveCommand('rmdir /tmp/emptydir')).toBe(true)
      })

      it('detects the exact command from Issue #65', () => {
        const command = "find . -maxdepth 1 -type d -name '*-*-*-*-*' ! -name '1f8034d3-...' -exec rm -rf {} +"
        expect(containsDestructiveCommand(command)).toBe(true)
      })
    })

    describe('getDestructiveExecutables', () => {
      it('returns rm for rm command', () => {
        expect(getDestructiveExecutables('rm -rf /tmp/test')).toContain('rm')
      })

      it('returns multiple destructive commands', () => {
        const result = getDestructiveExecutables('rm file1 && shred file2')
        expect(result).toContain('rm')
        expect(result).toContain('shred')
      })

      it('returns find -delete for find with -delete', () => {
        const result = getDestructiveExecutables('find /tmp -name "*.tmp" -delete')
        expect(result).toContain('find -delete')
      })

      it('returns find -delete for find with -exec rm', () => {
        const result = getDestructiveExecutables('find /tmp -exec rm {} \\;')
        expect(result).toContain('find -delete')
      })

      it('returns empty array for safe commands', () => {
        expect(getDestructiveExecutables('ls -la')).toEqual([])
      })
    })
  })

  describe('extractFilesToDelete - Issue #101', () => {
    it('extracts single file from rm', () => {
      expect(extractFilesToDelete('rm file.txt')).toEqual(['file.txt'])
    })

    it('extracts multiple files from rm', () => {
      expect(extractFilesToDelete('rm file1.txt file2.txt')).toEqual(['file1.txt', 'file2.txt'])
    })

    it('ignores flags with rm', () => {
      expect(extractFilesToDelete('rm -rf /tmp/test')).toEqual(['/tmp/test'])
    })

    it('handles multiple flags', () => {
      expect(extractFilesToDelete('rm -r -f /tmp/test')).toEqual(['/tmp/test'])
    })

    it('handles combined flags', () => {
      expect(extractFilesToDelete('rm -rf dir1 dir2')).toEqual(['dir1', 'dir2'])
    })

    it('handles rmdir', () => {
      expect(extractFilesToDelete('rmdir /tmp/empty')).toEqual(['/tmp/empty'])
    })

    it('handles unlink', () => {
      expect(extractFilesToDelete('unlink /tmp/link')).toEqual(['/tmp/link'])
    })

    it('handles shred', () => {
      expect(extractFilesToDelete('shred -u secret.txt')).toEqual(['secret.txt'])
    })

    it('handles quoted paths with spaces', () => {
      expect(extractFilesToDelete('rm "file with spaces.txt"')).toEqual(['file with spaces.txt'])
    })

    it('handles single-quoted paths', () => {
      expect(extractFilesToDelete("rm 'my file.txt'")).toEqual(['my file.txt'])
    })

    it('handles sudo prefix', () => {
      expect(extractFilesToDelete('sudo rm -rf /etc/test')).toEqual(['/etc/test'])
    })

    it('handles chained rm commands', () => {
      expect(extractFilesToDelete('rm file1.txt && rm file2.txt')).toEqual(['file1.txt', 'file2.txt'])
    })

    it('extracts from multiple commands with semicolon', () => {
      expect(extractFilesToDelete('rm file1.txt; rm file2.txt')).toEqual(['file1.txt', 'file2.txt'])
    })

    it('returns empty array for non-rm commands', () => {
      expect(extractFilesToDelete('ls -la')).toEqual([])
    })

    it('handles glob patterns', () => {
      expect(extractFilesToDelete('rm *.tmp')).toEqual(['*.tmp'])
    })

    it('handles paths with special characters', () => {
      expect(extractFilesToDelete('rm /tmp/test-file_v1.2.3.txt')).toEqual(['/tmp/test-file_v1.2.3.txt'])
    })

    it('handles escaped spaces', () => {
      expect(extractFilesToDelete('rm my\\ file.txt')).toEqual(['my file.txt'])
    })
  })
})
