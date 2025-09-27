const autoprefixer = require('autoprefixer');

let tailwindcssPlugin = null;
try {
  // Resolve Tailwind only when it is installed so that `npm run dev` does not
  // explode on setups that have not executed `npm install` yet.
  // eslint-disable-next-line global-require
  tailwindcssPlugin = require('tailwindcss');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') {
    throw error;
  }
  console.warn(
    '[postcss] Tailwind CSS não encontrado. Execute "npm install" para habilitar a recompilação das classes utilitárias.',
  );
}

module.exports = {
  plugins: [tailwindcssPlugin, autoprefixer].filter(Boolean),
};
