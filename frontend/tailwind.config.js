const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: withOpacity('--color-bg'),
        surface: withOpacity('--color-surface'),
        surface2: withOpacity('--color-surface-2'),
        surface3: withOpacity('--color-surface-3'),
        surface4: withOpacity('--color-surface-4'),
        ink: withOpacity('--color-ink'),
        ink2: withOpacity('--color-ink-2'),
        ink3: withOpacity('--color-ink-3'),
        border: withOpacity('--color-border'),
        'border-strong': withOpacity('--color-border-strong'),
        accent: withOpacity('--color-accent'),
        'accent-hover': withOpacity('--color-accent-hover'),
        header: withOpacity('--color-header'),
        'header-2': withOpacity('--color-header-2'),
        overlay: withOpacity('--color-overlay'),
        tooltip: withOpacity('--color-tooltip'),
        'code-bg': withOpacity('--color-code-bg'),
        violet: withOpacity('--color-violet'),
        'violet-bg': withOpacity('--color-violet-bg'),
        'violet-ink': withOpacity('--color-violet-ink'),
        'status-ok': withOpacity('--color-status-ok'),
        'status-ok-bg': withOpacity('--color-status-ok-bg'),
        'status-warn': withOpacity('--color-status-warn'),
        'status-warn-bg': withOpacity('--color-status-warn-bg'),
        'status-danger': withOpacity('--color-status-danger'),
        'status-danger-bg': withOpacity('--color-status-danger-bg'),
      },
      fontFamily: {
        body: ['"Noto Serif SC"', 'serif'],
        mono: ['"DM Mono"', 'monospace'],
        display: ['Fraunces', 'serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        panel: 'var(--shadow-panel)',
        alert: 'var(--shadow-alert)',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        flashField: {
          '0%': { boxShadow: '0 0 0 0 rgba(58, 107, 74, 0.35)' },
          '50%': { boxShadow: '0 0 0 4px rgba(58, 107, 74, 0.18)' },
          '100%': { boxShadow: '0 0 0 0 rgba(58, 107, 74, 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.7)' },
        },
        blinkCursor: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        softGlow: {
          '0%, 100%': {
            boxShadow: '0 14px 28px rgba(200, 75, 47, 0.06)',
            transform: 'translateY(0)',
          },
          '50%': {
            boxShadow: '0 20px 42px rgba(200, 75, 47, 0.14)',
            transform: 'translateY(-1px)',
          },
        },
        collapseBox: {
          '0%': {
            opacity: '1',
            transform: 'scaleY(1) translateY(0)',
            maxHeight: '600px',
            paddingTop: '14px',
            paddingBottom: '14px',
          },
          '30%': { opacity: '0.6', transform: 'scaleY(0.96) translateY(-2px)' },
          '100%': {
            opacity: '0',
            transform: 'scaleY(0.85) translateY(-6px)',
            maxHeight: '0',
            paddingTop: '0',
            paddingBottom: '0',
            marginBottom: '-16px',
          },
        },
        onboardingExit: {
          '0%': { opacity: '1', transform: 'scale(1) translateY(0)', filter: 'blur(0px)' },
          '100%': { opacity: '0', transform: 'scale(0.93) translateY(-24px)', filter: 'blur(8px)' },
        },
        heroTitleEnter: {
          '0%': { opacity: '0', transform: 'translateY(32px) scale(0.95)', filter: 'blur(6px)' },
          '60%': { opacity: '1', transform: 'translateY(-3px) scale(1.005)', filter: 'blur(0px)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0px)' },
        },
        searchBarEnter: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        confettiPop: {
          '0%': { opacity: '0', transform: 'translate(0px, 0px) scale(0)' },
          '25%': { opacity: '1', transform: 'translate(calc(var(--confetti-tx) * 0.5), calc(var(--confetti-ty) * 0.5)) scale(1.2)' },
          '65%': { opacity: '0.85', transform: 'translate(var(--confetti-tx), var(--confetti-ty)) scale(0.95)' },
          '100%': { opacity: '0', transform: 'translate(var(--confetti-tx), calc(var(--confetti-ty) + 14px)) scale(0.25)' },
        },
        centerGlow: {
          '0%': { opacity: '0', transform: 'scale(0)' },
          '35%': { opacity: '0.5', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(2.2)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.45s ease forwards',
        flashField: 'flashField 0.5s ease',
        shimmer: 'shimmer 1.4s infinite',
        pulseDot: 'pulseDot 1s ease-in-out infinite',
        blinkCursor: 'blinkCursor 0.7s step-end infinite',
        softGlow: 'softGlow 1.8s ease-in-out infinite',
        collapseBox: 'collapseBox 0.55s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        onboardingExit: 'onboardingExit 0.5s cubic-bezier(0.4, 0, 0.6, 1) forwards',
        heroTitleEnter: 'heroTitleEnter 0.75s cubic-bezier(0.16, 1, 0.3, 1) both',
        searchBarEnter: 'searchBarEnter 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.18s both',
        confettiPop: 'confettiPop 0.65s ease-out both',
        centerGlow: 'centerGlow 0.55s ease-out forwards',
        shake: 'shake 0.4s ease',
      },
    },
  },
  plugins: [],
};
