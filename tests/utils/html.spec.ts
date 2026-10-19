import { describe, expect, it } from '@jest/globals';

import { escapeHtml } from '../../src/utils/html.ts';

describe('escapeHtml', () => {
	it('should escape the characters Telegram treats specially', () => {
		expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
	});

	it('should leave other characters alone', () => {
		expect(escapeHtml('a b 中文 🙂')).toBe('a b 中文 🙂');
	});
});
