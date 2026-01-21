/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}'
  ],
  theme: {
    extend: {
      colors: {
        'copilot-bg': 'var(--copilot-bg)',
        'copilot-surface': 'var(--copilot-surface)',
        'copilot-surface-hover': 'var(--copilot-surface-hover)',
        'copilot-border': 'var(--copilot-border)',
        'copilot-border-hover': 'var(--copilot-border-hover)',
        'copilot-accent': 'var(--copilot-accent)',
        'copilot-accent-hover': 'var(--copilot-accent-hover)',
        'copilot-accent-muted': 'var(--copilot-accent-muted)',
        'copilot-text': 'var(--copilot-text)',
        'copilot-text-muted': 'var(--copilot-text-muted)',
        'copilot-text-inverse': 'var(--copilot-text-inverse)',
        'copilot-success': 'var(--copilot-success)',
        'copilot-success-muted': 'var(--copilot-success-muted)',
        'copilot-warning': 'var(--copilot-warning)',
        'copilot-warning-muted': 'var(--copilot-warning-muted)',
        'copilot-error': 'var(--copilot-error)',
        'copilot-error-muted': 'var(--copilot-error-muted)',
        'copilot-scrollbar-thumb': 'var(--copilot-scrollbar-thumb)',
        'copilot-scrollbar-thumb-hover': 'var(--copilot-scrollbar-thumb-hover)',
        'copilot-selection': 'var(--copilot-selection)',
        'copilot-shadow': 'var(--copilot-shadow)',
        'copilot-shadow-strong': 'var(--copilot-shadow-strong)',
        'copilot-terminal-bg': 'var(--copilot-terminal-bg)',
        'copilot-terminal-text': 'var(--copilot-terminal-text)',
        'copilot-terminal-cursor': 'var(--copilot-terminal-cursor)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      backdropBlur: {
        'xl': '24px'
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate'
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px var(--copilot-accent-muted)' },
          '100%': { boxShadow: '0 0 20px var(--copilot-accent)' }
        }
      }
    }
  },
  plugins: []
}
