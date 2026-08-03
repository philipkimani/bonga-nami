/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#241041',
          2: '#2E1552',
          deep: '#1A0B31',
        },
        paper: '#FBF8FF',
        muted: '#B9A8D4',
        line: 'rgba(185,168,212,0.22)',
        flare: '#FF2E88',
        sun: '#FFC94A',
        mint: '#23D9B0',
        whatsapp: '#25D366',
      },
      // A bare `border` class defaults to gray-200, which glows on the dark
      // canvas. One override catches every one of them.
      borderColor: {
        DEFAULT: 'rgba(185,168,212,0.22)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
