import type { Plugin } from '@oxlint/plugins';

import { namingConvention } from './naming-convention/rule.js';

/** Rules oxlint does not have natively. Registered as `@temelyos`, since `@typescript-eslint` is reserved. */
const plugin: Plugin = {
	meta: { name: '@temelyos' },
	rules: {
		'naming-convention': namingConvention
	}
};

export default plugin;
