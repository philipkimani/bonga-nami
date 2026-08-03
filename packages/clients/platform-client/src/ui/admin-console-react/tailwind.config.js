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
          DEFAULT: '#2B1552',
          2: '#3A1E6E',
          deep: '#1F0F3E',
        },
        paper: '#FBF8FF',
        muted: '#C4B5DE',
        line: 'rgba(196,181,222,0.26)',
        flare: '#FF2E88',
        sun: '#FFC94A',
        mint: '#23D9B0',
        whatsapp: '#25D366',
      },
      // A bare `border` class defaults to gray-200, which glows on the dark
      // canvas. One override catches every one of them.
      borderColor: {
        DEFAULT: 'rgba(196,181,222,0.26)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
