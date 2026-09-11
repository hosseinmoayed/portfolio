/** @type {import('tailwindcss').Config} */
module.exports = {
  // Listed explicitly (not ./*.html): admin pages and scratch files deliberately
  // avoid Tailwind, and only these three pages link the compiled stylesheet.
  content: ["./index.html", "./web-experiences.html", "./cinematic-ads.html"],
  theme: {
    fontFamily: {
      sans: ['"Space Mono"', "monospace"],
      serif: ['"Space Mono"', "monospace"],
      mono: ['"Space Mono"', "monospace"],
    },
  },
  plugins: [],
};