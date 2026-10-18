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

## 🏷️ `@temelyos/naming-convention`

Oxlint has no `naming-convention`, so this package ships a port of typescript-eslint's rule as a JS plugin, registered as `@temelyos` (`@typescript-eslint` is reserved for Oxlint's own rules). It takes typescript-eslint's options unchanged and reports the same messages; the config passes it the options `@temelyos/eslint-config` uses.

Everything but `types` behaves as in typescript-eslint: selectors, modifiers, formats, affixes, underscores, filters, and the order configs are tried in. `types` needs the type checker, which JS plugins do not get, so the port infers types from syntax: annotations, literals, operators, well-known built-ins, and local declarations. When syntax cannot settle a type, a config with `types` neither passes nor fails a name on its own: the name is accepted if that config would allow it. So the port can miss a name typescript-eslint would report (typically a constant holding the result of an imported function), but it does not report one typescript-eslint would accept.

The `unused` modifier is approximated as "never read and not exported".

Suppression comments name the new rule: `// eslint-disable-next-line @temelyos/naming-convention`.

## ⚠️ Differences from `@temelyos/eslint-config`

- `naming-convention` is `@temelyos/naming-convention`, with types inferred from syntax (above).
- `no-dupe-args` and `no-octal` are dropped: Oxlint does not implement them, since both are already syntax errors in strict mode. Only non-module scripts (CommonJS) lose the check.
- `typescript/no-unnecessary-condition` runs only with `options.typeAware` (or `--type-aware`).
