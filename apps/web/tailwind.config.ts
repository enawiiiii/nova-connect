import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#090b14',
        panel: '#10131f',
        violet: '#8b5cf6',
        nova: '#a78bfa',
        mint: '#5eead4',
      },
      fontFamily: {
        sans: ['Manrope', 'Noto Sans Arabic', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Noto Sans Arabic', 'system-ui', 'sans-serif'],
      },
      boxShadow: { glow: '0 0 45px rgba(139,92,246,.22)' },
      animation: { 'float-slow': 'float 7s ease-in-out infinite', 'pulse-soft': 'pulseSoft 2.8s ease-in-out infinite' },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        pulseSoft: { '0%,100%': { opacity: '.55' }, '50%': { opacity: '1' } },
      },
    },
  },
  plugins: [],
} satisfies Config;
