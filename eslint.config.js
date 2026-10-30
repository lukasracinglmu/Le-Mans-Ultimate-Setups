import js from '@eslint/js';
import htmlPlugin from '@html-eslint/eslint-plugin';
import htmlParser from '@html-eslint/parser';
import { defineConfig } from 'eslint/config';
import inlineScripts from 'eslint-plugin-html';
import globals from 'globals';

const jsRules = {
	// Input sanitizers intentionally strip control characters.
	'no-control-regex': 'off',
	'no-empty': ['error', { allowEmptyCatch: true }],
	// Existing findings are reported as warnings until they are cleaned up.
	'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
	'no-useless-escape': 'warn',
	'preserve-caught-error': 'warn',
};

export default defineConfig([
	{
		ignores: ['setups/', 'audit-logs/'],
	},
	{
		files: ['**/*.{js,mjs}'],
		plugins: { js },
		extends: ['js/recommended'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
		},
		rules: jsRules,
	},
	{
		// Cloudflare Worker modules
		files: ['src/**/*.js'],
		languageOptions: {
			globals: globals.serviceworker,
		},
	},
	{
		// Scripts of the pages, loaded by the browser
		files: ['public/js/**/*.js'],
		languageOptions: {
			globals: globals.browser,
		},
	},
	{
		files: ['discord-presence/**/*.js', 'tests/**/*.mjs', 'tools/**/*.mjs'],
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		// Markup rules from html-eslint plus the JavaScript rules for inline scripts.
		// eslint-plugin-html does not support the ESLint `language` option, so the
		// html-eslint parser is configured manually.
		files: ['**/*.html'],
		plugins: { js, html: htmlPlugin, inlineScripts },
		extends: ['js/recommended', 'html/recommended'],
		languageOptions: {
			parser: htmlParser,
			ecmaVersion: 'latest',
			sourceType: 'script',
			globals: globals.browser,
		},
		rules: {
			...jsRules,
			// Formatting is Prettier's job.
			'html/attrs-newline': 'off',
			'html/element-newline': 'off',
			'html/indent': 'off',
			'html/no-extra-spacing-tags': 'off',
			'html/quotes': 'off',
			'html/require-closing-tags': 'off',
			// Existing findings that would change markup or rendering.
			'html/no-multiple-h1': 'warn',
			'html/use-baseline': 'warn',
		},
	},
]);
