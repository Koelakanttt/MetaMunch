const js = require('@eslint/js')
const reactHooks = require('eslint-plugin-react-hooks')
const tseslint = require('typescript-eslint')

const tsFiles = ['**/*.ts', '**/*.tsx']

module.exports = [
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: tsFiles })),
  { ...reactHooks.configs.flat.recommended, files: tsFiles },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        module: 'writable',
        process: 'readonly',
        require: 'readonly',
      },
    },
  },
]
