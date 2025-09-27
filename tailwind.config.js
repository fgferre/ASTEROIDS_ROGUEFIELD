module.exports = {
  content: ['./src/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        'menu-bg': '#00000a',
        'menu-primary': '#00aaff',
      },
      fontFamily: {
        orbitron: ['"Orbitron"', 'sans-serif'],
      },
      dropShadow: {
        neon: ['0 0 12px rgba(0, 170, 255, 0.75)'],
      },
    },
  },
  plugins: [],
};
