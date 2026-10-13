/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        canvas: "#F4F6FB",
        muted: "#667085",
        line: "#E6EAF2",
        brand: {
          DEFAULT: "#155EEF",
          dark: "#1047C4",
          soft: "#E8F0FE",
          sky: "#1290F9",
          navy: "#012668",
        },
        express: "#FF5A36",
        food: "#F97316",
        grocery: "#059669",
      },
    },
  },
  plugins: [],
};
