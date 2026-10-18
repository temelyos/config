import { defineConfig } from 'oxlint';

import temelyos from '@temelyos/oxlint-config';

export default defineConfig({
	extends: [temelyos],
	ignorePatterns: ['**/dist/**'],
	options: { typeAware: true }
});
