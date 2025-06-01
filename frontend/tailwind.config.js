// frontend/tailwind.config.js
const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // Deine bestehenden Farben hier...
        'sleeper-bg': '#101014',
        'sleeper-bg-secondary': '#18181B',
        'sleeper-surface': '#202024',
        'sleeper-border': '#36363B',
        'sleeper-text-primary': '#E4E4E7',
        'sleeper-text-secondary': '#A1A1AA',
        'sleeper-primary': '#7C3AED',
        'sleeper-primary-hover': '#6D28D9',
        'sleeper-accent': '#10B981',
        'sleeper-accent-hover': '#059669',
        'sleeper-success': '#22C55E',
        'sleeper-error': '#EF4444',
        'sleeper-warning': '#F59E0B',
      },
      // NEU: Kleinere Schriftgrößen definieren
      fontSize: {
        'xxs': ['0.625rem', { lineHeight: '0.875rem' }], // 10px, Zeilenhöhe ~14px
        '3xs': ['0.5rem', { lineHeight: '0.75rem' }],    // 8px, Zeilenhöhe 12px (sehr klein!)
        // Du kannst hier weitere Größen nach Bedarf definieren
      },
      // ... andere Erweiterungen wie boxShadow etc.
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};