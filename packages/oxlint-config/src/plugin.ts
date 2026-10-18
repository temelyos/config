import type { Plugin } from '@oxlint/plugins';

import { NamingConvention } from './naming-convention/rule.js';

/** Rules oxlint does not have natively. Registered as `@temelyos`, since `@typescript-eslint` is reserved. */
const TemelyosPlugin: Plugin = {
	meta: { name: '@temelyos' },
	rules: {
		'naming-convention': NamingConvention
	}
};

export default TemelyosPlugin;
