import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export const { chromium } = require('playwright');
export const { transform } = require('esbuild');

const packageDir = (name) => path.dirname(require.resolve(`${name}/package.json`));

export const reactUmdPath = path.join(packageDir('react'), 'umd/react.development.js');
export const reactDomUmdPath = path.join(packageDir('react-dom'), 'umd/react-dom.development.js');
