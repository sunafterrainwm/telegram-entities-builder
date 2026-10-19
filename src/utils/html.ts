/**
 * Escapes the characters that Telegram's HTML parse modes treat specially.
 *
 * @example
 * ```typescript
 * import { escapeHtml } from "@sunafterrainwm/telegram-entities-builder";
 * console.log(escapeHtml("<hello>")); // "&lt;hello&gt;"
 * ```
 *
 * @param text - The text to escape.
 * @returns The escaped text.
 *
 * @category Functions
 * @since Bot API 4.5
 * @useWhen - You are assembling Telegram HTML by hand and need to insert untrusted text.
 * @avoidWhen - You are building `entities` or rich message blocks, where text is never markup.
 * @never - NEVER assume the output is safe to embed in a web page; this targets Telegram's HTML subset, not a browser.
 */
export function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (m) => {
		switch (m) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			case "'":
				return '&#39;';
			default:
				return m;
		}
	});
}
