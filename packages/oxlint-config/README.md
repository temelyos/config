# @temelyos/oxlint-config

> ⚡ Official Oxlint config for Temelyos projects

The [Oxlint](https://oxc.rs/docs/guide/usage/linter) counterpart of `@temelyos/eslint-config`: the same rules, run by Oxlint's native rules where it has them and as JS plugins (`@stylistic`, `perfectionist`) where it does not.

## 📦 Installation

Using **npm**:

```bash
npm add -D oxlint oxlint-tsgolint @temelyos/oxlint-config
```

`oxlint-tsgolint` is only needed for type-aware rules.

## 🚀 Usage

A shared config is extended from an `oxlint.config.ts` (a `.oxlintrc.json` cannot import a package); name it `oxlint.config.mts` when the nearest `package.json` has no `"type": "module"`. Type-aware linting is switched on in the root config, never in a shared one:

```ts
import { defineConfig } from 'oxlint';
import temelyos from '@temelyos/oxlint-config';

export default defineConfig({
	extends: [temelyos],
	options: { typeAware: true }
});
```

TypeScript config files need Node 22.18+ or 24+.

## ⚠️ Differences from `@temelyos/eslint-config`

- `@typescript-eslint/naming-convention` is not ported yet: Oxlint has no equivalent, and its type filters need type information that JS plugins do not get.
- `no-dupe-args` and `no-octal` are dropped: Oxlint does not implement them, since both are already syntax errors in strict mode. Only non-module scripts (CommonJS) lose the check.
- `typescript/no-unnecessary-condition` runs only with `options.typeAware` (or `--type-aware`).
