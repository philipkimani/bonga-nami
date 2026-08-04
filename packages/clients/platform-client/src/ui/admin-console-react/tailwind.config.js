/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        canvas: {
          DEFAULT: '#FBF8FF',
          2: '#FFFFFF',
          deep: '#F2ECFB',
        },
        // Text
        paper: '#241041',
        muted: '#6E5D8F',
        line: 'rgba(36,16,65,0.14)',
        // Accents: bright = fills, -ink = text/icons (>= 4.5:1 on canvas)
        flare: '#FF2E88',
        sun: '#FFC94A',
        mint: '#23D9B0',
        'flare-ink': '#B81660',
        'sun-ink': '#8A5A00',
        'mint-ink': '#0B7F65',
        whatsapp: '#128C7E',
      },
      // A bare `border` class defaults to gray-200. One override aligns them all.
      borderColor: {
        DEFAULT: 'rgba(36,16,65,0.14)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
