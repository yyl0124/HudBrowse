/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3b82f6',
          dark: '#2563eb',
        },
        dark: {
          bg: '#1a1a1a',
          surface: '#2d2d2d',
          border: '#404040',
        }
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}

