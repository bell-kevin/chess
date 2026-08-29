/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        /*
         * Landscape phones are wide but very short, so width-based breakpoints
         * get them wrong: they need the side-by-side layout `lg` provides long
         * before they are ever 1024px wide.
         */
        short: { raw: '(orientation: landscape) and (max-height: 600px)' },
      },
    },
  },
  plugins: [],
};
