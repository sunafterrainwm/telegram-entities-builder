import type * as TT from '@grammyjs/types';

/**
 * Thrown when input cannot be parsed.
 *
 * The Bot API answers a malformed `parse_mode` payload with HTTP 400 and a message of
 * the same shape, so the offending position is reported here as well.
 *
 * @category Parsing
 */
export class ParseError extends Error {
	/** Offset in UTF-16 code units at which parsing failed, when known. */
	public readonly position?: number;

	public constructor(message: string, position?: number) {
		super(position === undefined ? message : `${message} at offset ${position}`);
		this.name = 'ParseError';
		this.position = position;
	}
}

/**
 * Reads one UTF-16 code unit, yielding `"\0"` past the end of the input.
 *
 * tdlib walks NUL-terminated C strings and relies on the terminator to stop its inner
 * loops, so the ports below need the same behaviour.
 *
 * @internal
 */
export function at(text: string, index: number): string {
	return index >= 0 && index < text.length ? text[index] : '\0';
}

/**
 * Whitespace as tdlib defines it, including the string terminator.
 *
 * @internal
 */
export function isSpace(c: string): boolean {
	return c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\0' || c === '\v';
}

/** @internal */
export function isDigit(c: string): boolean {
	return c >= '0' && c <= '9';
}

/** @internal */
export function isHexDigit(c: string): boolean {
	return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

/** @internal */
export function isAlpha(c: string): boolean {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

/** @internal */
export function isAlnum(c: string): boolean {
	return isAlpha(c) || isDigit(c);
}

/**
 * Named character references accepted by the classic `parse_mode: "HTML"`.
 *
 * @internal
 */
const CLASSIC_NAMED_REFERENCES: Record<string, string> = {
	lt: '<',
	gt: '>',
	amp: '&',
	quot: '"',
};

/**
 * Named character references accepted by rich message HTML, which supports a few
 * typographic ones on top of the classic set.
 *
 * @internal
 */
const RICH_NAMED_REFERENCES: Record<string, string> = {
	...CLASSIC_NAMED_REFERENCES,
	apos: "'",
	nbsp: ' ',
	hellip: '…',
	mdash: '—',
	ndash: '–',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
};

/**
 * The outcome of decoding a character reference: the decoded text, and the index just
 * past the reference.
 *
 * @internal
 */
export interface DecodedReference {
	text: string;
	next: number;
}

/**
 * Decodes the character reference starting at `pos` (which must hold `&`).
 *
 * Returns `undefined` for anything that is not a supported reference, in which case the
 * `&` is taken literally — the same fallback the Bot API applies.
 *
 * @internal
 */
export function decodeHtmlReference(
	text: string,
	pos: number,
	rich: boolean,
): DecodedReference | undefined {
	let end = pos + 1;
	let code = 0;

	if (at(text, end) === '#') {
		end++;
		if (at(text, end) === 'x' || at(text, end) === 'X') {
			end++;
			const start = end;
			while (isHexDigit(at(text, end))) {
				code = code * 16 + Number.parseInt(at(text, end), 16);
				end++;
			}
			if (end === start) {
				return undefined;
			}
		} else {
			const start = end;
			while (isDigit(at(text, end))) {
				code = code * 10 + Number(at(text, end));
				end++;
			}
			if (end === start) {
				return undefined;
			}
		}
		// tdlib rejects out-of-range code points and over-long references.
		if (code === 0 || code >= 0x10ffff || end - pos >= 10) {
			return undefined;
		}
		// A lone surrogate cannot be represented, so the reference is left as-is.
		if (code >= 0xd800 && code <= 0xdfff) {
			return undefined;
		}
		return {
			text: String.fromCodePoint(code),
			next: at(text, end) === ';' ? end + 1 : end,
		};
	}

	while (isAlpha(at(text, end))) {
		end++;
	}
	const name = text.slice(pos + 1, end);
	const table = rich ? RICH_NAMED_REFERENCES : CLASSIC_NAMED_REFERENCES;
	const decoded = Object.hasOwn(table, name) ? table[name] : undefined;
	if (decoded === undefined) {
		return undefined;
	}
	return { text: decoded, next: at(text, end) === ';' ? end + 1 : end };
}

/**
 * Normalizes a `tg://time` format string into the canonical Bot API spelling.
 *
 * tdlib treats the format as an unordered flag set (`r`/`R` for relative, otherwise any
 * mix of `t`, `T`, `d`, `D`, `w`, `W`), so the flags are re-emitted in the order the
 * Bot API documents: day of week, date, time.
 *
 * @internal
 */
export function normalizeDateTimeFormat(
	format: string,
): TT.RichTextDateTime['date_time_format'] | undefined {
	if (format === 'r' || format === 'R') {
		return 'r';
	}

	let dayOfWeek = '';
	let date: 'd' | 'D' | '' = '';
	let time: 't' | 'T' | '' = '';

	for (const c of format) {
		switch (c) {
			case 't':
			case 'T':
				time = c;
				break;
			case 'd':
			case 'D':
				date = c;
				break;
			case 'w':
			case 'W':
				dayOfWeek = 'w';
				break;
			default:
				return undefined;
		}
	}

	return `${dayOfWeek}${date}${time}` as TT.RichTextDateTime['date_time_format'];
}

/**
 * Splits the query of a `tg://<host>?…` link, or returns `undefined` for anything else.
 *
 * @internal
 */
function getTgLinkQuery(url: string, host: string): URLSearchParams | undefined {
	let rest = url.trim();
	if (!rest.slice(0, 3).toLowerCase().startsWith('tg:')) {
		return undefined;
	}
	rest = rest.slice(3);
	if (rest.startsWith('//')) {
		rest = rest.slice(2);
	}
	if (rest.slice(0, host.length).toLowerCase() !== host) {
		return undefined;
	}
	rest = rest.slice(host.length);
	if (rest.startsWith('/')) {
		rest = rest.slice(1);
	}
	if (!rest.startsWith('?')) {
		return undefined;
	}
	rest = rest.slice(1);
	const hash = rest.indexOf('#');
	if (hash !== -1) {
		rest = rest.slice(0, hash);
	}
	return new URLSearchParams(rest);
}

/**
 * Extracts the user identifier of a `tg://user?id=…` link.
 *
 * @internal
 */
export function getLinkUserId(url: string): number | undefined {
	const id = getTgLinkQuery(url, 'user')?.get('id');
	if (id === null || id === undefined || !/^-?\d+$/.test(id)) {
		return undefined;
	}
	const userId = Number(id);
	return Number.isSafeInteger(userId) && userId !== 0 ? userId : undefined;
}

/**
 * Extracts the custom emoji identifier of a `tg://emoji?id=…` link.
 *
 * @internal
 */
export function getLinkCustomEmojiId(url: string): string | undefined {
	const id = getTgLinkQuery(url, 'emoji')?.get('id');
	if (id === null || id === undefined || !/^\d+$/.test(id) || /^0+$/.test(id)) {
		return undefined;
	}
	return id;
}

/**
 * Extracts the Unix time and format of a `tg://time?unix=…&format=…` link.
 *
 * @internal
 */
export function getLinkFormattedDate(
	url: string,
):
	| { unix_time: number; date_time_format: TT.RichTextDateTime['date_time_format'] }
	| undefined {
	const query = getTgLinkQuery(url, 'time');
	if (!query) {
		return undefined;
	}
	const unix = query.get('unix');
	if (unix === null || !/^\d+$/.test(unix)) {
		return undefined;
	}
	const unixTime = Number(unix);
	if (unixTime <= 0 || !Number.isSafeInteger(unixTime)) {
		return undefined;
	}
	const format = normalizeDateTimeFormat(query.get('format') ?? '');
	if (format === undefined) {
		return undefined;
	}
	return { unix_time: unixTime, date_time_format: format };
}

/**
 * Validates a link the way tdlib's `get_checked_link` is used here: an empty link makes
 * the surrounding entity be dropped, anything else is passed through trimmed.
 *
 * This is deliberately looser than tdlib, which also normalizes the scheme and IDN
 * hosts; the Bot API re-validates every URL it receives anyway.
 *
 * @internal
 */
export function checkLink(url: string): string {
	return url.trim();
}

/**
 * Orders entities the way tdlib's `sort_entities` does: by offset, then longest first so
 * that an outer entity precedes the entities it contains.
 *
 * @internal
 */
export function sortEntities<E extends { offset: number; length: number }>(
	entities: E[],
): E[] {
	return entities.sort((a, b) => a.offset - b.offset || b.length - a.length);
}

/**
 * Builds the `User` of a `text_mention` entity parsed from a `tg://user?id=…` link.
 *
 * Only the identifier is encoded in such a link, and it is the only field the Bot API
 * reads back when the entity is sent, so the remaining fields are placeholders.
 *
 * @internal
 */
export function mentionedUser(userId: number): TT.User {
	return { id: userId, is_bot: false, first_name: '' };
}
