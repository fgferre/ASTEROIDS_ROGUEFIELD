/**
 * Tailwind CSS configuration scoped to the UI assets inside src/.
 * The configuration keeps the future start screen work isolated
 * while we integrate the 3D background and new menu overlay.
 */
module.exports = {
  content: ['src/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        orbitron: ['\'Orbitron\'', 'sans-serif'],
      },
      colors: {
        neon: {
          cyan: '#00aaff',
          blue: '#0077ff',
        },
        space: {
          50: '#00000a',
          900: '#020816',
        },
      },
      boxShadow: {
        'neon-glow': '0 0 25px rgba(0, 170, 255, 0.75)',
        'neon-glow-strong': '0 0 35px rgba(0, 170, 255, 0.95)',
      },
    },
  },
  plugins: [],
};
