import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { includeIgnoreFile } from '@eslint/compat';
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, '.gitignore');

export default tseslint.config(
	includeIgnoreFile(gitignorePath),
	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	eslintPluginPrettierRecommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
		rules: {
			'@typescript-eslint/no-empty-object-type': [
				'error',
				{
					allowInterfaces: 'with-single-extends',
				},
			],
			'@typescript-eslint/restrict-template-expressions': [
				'error',
				{
					allowNumber: true,
				},
			],
		},
	},
	{
		// The parsers index strings, arrays and regular-expression capture groups in
		// hot loops. `noUncheckedIndexedAccess` is off, so TypeScript types those
		// accesses as always defined while at runtime they are not, which makes the
		// rule flag the guards that actually keep the parsers from crashing.
		files: ['src/parse/**/*.ts'],
		rules: {
			'@typescript-eslint/no-unnecessary-condition': 'off',
		},
	},
	{
		files: ['**/*.js'],
		extends: [tseslint.configs.disableTypeChecked],
	},
);
