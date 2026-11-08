import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-stale-translation-memo.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: { lang: 'tsx' },
		sourceType: 'module'
	}
});

ruleTester.run(
	'no-stale-translation-memo',
	rule as unknown as Rule,
	{
		invalid: [
			{ code: `useMemo(() => t('Draft', 'Draft'), [t]);`, errors: [{ messageId: 'staleMemo' }] },
			{ code: `useMemo(() => ({ draft: t('Draft'), review: t('Review') }), [t]);`, errors: [{ messageId: 'staleMemo' }] },
			{ code: `React.useMemo(() => t('Draft'), [t]);`, errors: [{ messageId: 'staleMemo' }] },
			{ code: `useMemo(() => getColumns(t), [t]);`, errors: [{ messageId: 'staleMemo' }] },
			{ code: `useMemo(() => getColumns(t, locale), [locale, t]);`, errors: [{ messageId: 'staleMemo' }] },
			{ code: `useMemo(() => tabs.map(tab => ({ ...tab, title: t(tab.key) })), [tabs, t]);`, errors: [{ messageId: 'staleMemo' }] },
			{ code: `useMemo(() => shifts.flatMap(shift => days.map(day => ({ day, title: t('Shift') }))), [days, shifts, t]);`, errors: [{ messageId: 'staleMemo' }] },
			{ code: `useMemo(() => z.string().min(1, t('Required')), [t]);`, errors: [{ messageId: 'staleMemo' }] },
			{ code: `useMemo(function build() { return <span>{t('Draft')}</span>; }, [t]);`, errors: [{ messageId: 'staleMemo' }] }
		],
		valid: [
			{ code: `useMemo(() => t('Draft'), [dictionary, t]);` },
			{ code: `useMemo(() => t('Draft'), [context.dictionary, t]);` },
			{ code: `useTranslated(t => t('Draft'));` },
			{ code: `useTranslated(t => getColumns(t), [items]);` },
			{ code: `useCallback(() => toast(t('Saved')), [t]);` },
			{ code: `useCallback((item) => t(item.key), [t]);` },
			{ code: `useMemo(() => () => t('Draft'), [t]);` },
			{ code: `useMemo(() => new Controller({ onLoaded: () => setTitle(t('New')) }), [id, t]);` },
			{ code: `useMemo(() => schema.superRefine((value, ctx) => ctx.addIssue({ message: t('Bad') })), [t]);` },
			{ code: `useMemo(() => items.map(t => format(t)), [items, t]);` },
			{ code: `useMemo(() => compute(items), [items]);` },
			{ code: `useEffect(() => { setTitle(t('Draft')); }, [t]);` }
		]
	}
);
