/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: {
          base: '#0E1013',
          surface: '#171A1F',
          'surface-raised': '#1F2329',
          'border-subtle': '#2A2F37',
          'text-primary': '#EDEEF0',
          'text-secondary': '#9AA1AC',
          'accent-primary': '#E08A3C',
          'accent-active': '#F2B84B',
          'accent-complete': '#3FA66A',
          'accent-critical': '#D9564B',
          'accent-info': '#4F8FE0',
          'future-node': '#3A3F47',
          'future-node-bg': '#1B1E23',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
