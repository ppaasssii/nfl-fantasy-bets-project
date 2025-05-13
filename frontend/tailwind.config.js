// tailwind.config.js
const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors'); // To access default Tailwind colors

/** @type {import('tailwindcss').Config} */
export default {
  // darkMode: 'class', // Enable if you use the class strategy for dark mode toggle (we added 'dark' to html)
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans], // Set Inter as the primary sans-serif font
      },
      colors: {
        // Sleeper-inspired palette (adjust these hex codes to your liking)
        'sleeper-bg': '#101014',          // Very dark background (almost black)
        'sleeper-bg-secondary': '#18181B', // Slightly lighter for surfaces
        'sleeper-surface': '#202024',     // For cards, inputs
        'sleeper-border': '#36363B',      // Borders, dividers
        'sleeper-text-primary': '#E4E4E7', // Main text (off-white)
        'sleeper-text-secondary': '#A1A1AA',// Muted text
        'sleeper-primary': '#7C3AED',     // Vibrant Purple (like Tailwind's violet-600)
        'sleeper-primary-hover': '#6D28D9',// Darker Purple for hover
        'sleeper-accent': '#10B981',      // Teal/Green accent (like Tailwind's emerald-500)
        'sleeper-accent-hover': '#059669', // Darker Teal/Green
        'sleeper-success': '#22C55E',     // Green for success (like Tailwind's green-500)
        'sleeper-error': '#EF4444',       // Red for errors (like Tailwind's red-500)
        'sleeper-warning': '#F59E0B',     // Amber/Yellow for warnings (like Tailwind's amber-500)

        // You can also directly use Tailwind's existing color palette
        // e.g., if you like indigo, green, red from default Tailwind:
        // primary: colors.indigo,
        // success: colors.green,
        // error: colors.red,
        // You can also create shades:
        // gray: {
        //   ...colors.neutral, // or zinc, stone etc.
        //   750: '#30363d', // Custom shade we used before
        //   850: '#1c1c20', // Another custom dark shade
        //   950: '#0a0a0c', // Very dark
        // },
      },
      // Example: Adding a subtle glow effect (can be used with ring or shadow utilities)
      boxShadow: {
        'glow-primary': '0 0 15px 0px rgba(124, 58, 237, 0.5)', // Using sleeper-primary color
        'glow-accent': '0 0 15px 0px rgba(16, 185, 129, 0.5)',  // Using sleeper-accent color
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'), // Useful for pre-styling form elements
  ],
}