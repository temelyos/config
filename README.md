# @temelyos/tooling

> 🛠 Shared tooling for all Temelyos projects: configuration and lint rules

This monorepo publishes the shared tooling every Temelyos workspace builds and lints with:

- ✅ ESLint
- ✅ TypeScript
- ✅ Oxlint
- ✅ Lint rules for Temelyos code: `@temelyos/eslint-plugin-i18n` (translation and error-message rules) and `@temelyos/eslint-plugin-repository` (repository and API rules), loaded as oxlint JS plugins

Use it to enforce consistent tooling across all frontend, backend, and shared workspaces in the Temelyos ecosystem.
