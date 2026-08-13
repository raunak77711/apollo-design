/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#141414',
        panel2: '#1b1b1b',
        edge: '#2a2a2a',
        accent: '#E11D48',
      },
    },
  },
  plugins: [],
};
