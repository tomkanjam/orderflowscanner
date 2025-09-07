/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "!./node_modules/**"
  ],
  theme: {
    extend: {
      colors: {
        // Neon Terminal color mappings
        gray: {
          50: '#FAFAF9',
          100: '#FAFAF9',
          200: '#FAFAF9',
          300: '#C4C4C0',
          400: '#8A8A86',
          500: '#5A5A57',
          600: '#1F1F22',
          700: '#1A1A1C',
          800: '#111113',
          900: '#0A0A0B',
          950: '#080809'
        },
        blue: {
          300: '#D4FF33',
          400: '#C6FF00',
          500: '#C6FF00',
          600: '#A3D100',
          700: '#7FA300'
        },
        green: {
          300: '#33FFB3',
          400: '#00FF88',
          500: '#00FF88',
          600: '#00CC6E',
          700: '#009954'
        },
        red: {
          300: '#FF336C',
          400: '#FF0040',
          500: '#FF0040',
          600: '#CC0033',
          700: '#990026'
        },
        yellow: {
          300: '#FFE033',
          400: '#FFD700',
          500: '#FFD700',
          600: '#CCAC00',
          700: '#998100'
        },
        cyan: {
          300: '#33F3FF',
          400: '#00F0FF',
          500: '#00F0FF',
          600: '#00C0CC',
          700: '#009099'
        }
      },
      borderColor: {
        DEFAULT: 'rgba(198, 255, 0, 0.15)'
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace']
      }
    }
  },
  plugins: [],
}

