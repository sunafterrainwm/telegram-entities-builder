import type * as TT from '@grammyjs/types';

import { ParseError, decodeHtmlReference } from './internal.ts';
import { type ParseRichOptions, parseRichHtml } from './rich-html.ts';

/**
 * Escapes text so that it survives the rich HTML parser verbatim.
 *
 * @internal
 */
function escape(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escapes an attribute value.
 *
 * @internal
 */
function escapeAttr(value: string): string {
	return escape(value).replace(/"/g, '&quot;');
}

/**
 * The inline delimiters of rich Markdown, longest first so that `**` wins over `*`.
 *
 * @internal
 */
const DELIMITERS: [delimiter: string, tag: string][] = [
	['**', 'b'],
	['__', 'b'],
	['~~', 's'],
	['==', 'mark'],
	['||', 'tg-spoiler'],
	['*', 'i'],
	['_', 'i'],
];

/**
 * Characters a backslash may escape.
 *
 * @internal
 */
const ESCAPABLE = '\\`*_{}[]<>()#+-.!|~=$&"\'';

/**
 * Matches the start of a raw HTML tag, which rich Markdown passes through untouched.
 *
 * @internal
 */
const RAW_TAG = /^<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^<>]*)?\/?>/;

/**
 * Finds the index of the next unescaped occurrence of `needle`, skipping code spans.
 *
 * @internal
 */
function findClosing(text: string, from: number, needle: string): number {
	for (let i = from; i < text.length; i++) {
		if (text[i] === '\\') {
			i++;
			continue;
		}
		if (text[i] === '`') {
			const end = text.indexOf('`', i + 1);
			if (end === -1) {
				return -1;
			}
			i = end;
			continue;
		}
		if (text.startsWith(needle, i)) {
			return i;
		}
	}
	return -1;
}

/**
 * Reads a `](…)` destination starting at the `]`.
 *
 * @internal
 */
function readDestination(
	text: string,
	closeBracket: number,
): { url: string; title?: string; next: number } | undefined {
	if (text[closeBracket + 1] !== '(') {
		return undefined;
	}
	let depth = 1;
	let i = closeBracket + 2;
	let raw = '';
	while (i < text.length && depth > 0) {
		if (text[i] === '\\') {
			raw += text[i + 1] ?? '';
			i += 2;
			continue;
		}
		if (text[i] === '(') {
			depth++;
		} else if (text[i] === ')') {
			depth--;
			if (depth === 0) {
				break;
			}
		}
		raw += text[i];
		i++;
	}
	if (depth !== 0) {
		return undefined;
	}

	const match = /^\s*(\S*)(?:\s+"([^"]*)")?\s*$/.exec(raw);
	if (!match) {
		return undefined;
	}
	return {
		url: match[1] ?? '',
		title: match[2],
		next: i + 1,
	};
}

/**
 * Translates rich Markdown inline syntax into rich HTML.
 *
 * @internal
 */
function inlineToHtml(markdown: string): string {
	let out = '';

	for (let i = 0; i < markdown.length; i++) {
		const c = markdown[i];

		if (c === '\\' && i + 1 < markdown.length && ESCAPABLE.includes(markdown[i + 1])) {
			out += escape(markdown[i + 1]);
			i++;
			continue;
		}

		if (c === '`') {
			const end = markdown.indexOf('`', i + 1);
			if (end !== -1) {
				out += `<code>${escape(markdown.slice(i + 1, end))}</code>`;
				i = end;
				continue;
			}
		}

		if (c === '$') {
			const end = markdown.indexOf('$', i + 1);
			if (end !== -1 && end !== i + 1) {
				out += `<tg-math>${escape(markdown.slice(i + 1, end))}</tg-math>`;
				i = end;
				continue;
			}
		}

		if (c === '&') {
			const decoded = decodeHtmlReference(markdown, i, true);
			if (decoded) {
				out += markdown.slice(i, decoded.next);
				i = decoded.next - 1;
				continue;
			}
		}

		if (c === '<') {
			const match = RAW_TAG.exec(markdown.slice(i));
			if (match) {
				out += match[0];
				i += match[0].length - 1;
				continue;
			}
		}

		if (c === '!' && markdown[i + 1] === '[') {
			const close = findClosing(markdown, i + 2, ']');
			const destination = close === -1 ? undefined : readDestination(markdown, close);
			if (destination) {
				const alt = markdown.slice(i + 2, close);
				const url = destination.url;
				if (/^tg:(\/\/)?emoji\?/i.test(url)) {
					const id = /[?&]id=(\d+)/.exec(url)?.[1] ?? '';
					out += `<tg-emoji emoji-id="${escapeAttr(id)}">${escape(alt)}</tg-emoji>`;
				} else if (/^tg:(\/\/)?time\?/i.test(url)) {
					const unix = /[?&]unix=(\d+)/.exec(url)?.[1] ?? '';
					const format = /[?&]format=([^&]*)/.exec(url)?.[1] ?? '';
					out += `<tg-time unix="${escapeAttr(unix)}" format="${escapeAttr(format)}">${escape(alt)}</tg-time>`;
				} else {
					throw new ParseError('Media can be specified only as a separate block', i);
				}
				i = destination.next - 1;
				continue;
			}
		}

		if (c === '[') {
			if (markdown[i + 1] === '^') {
				const close = markdown.indexOf(']', i + 2);
				if (close !== -1 && markdown[close + 1] !== ':') {
					const name = markdown.slice(i + 2, close);
					out += `<a href="#${escapeAttr(name)}">${escape(name)}</a>`;
					i = close;
					continue;
				}
			}
			const close = findClosing(markdown, i + 1, ']');
			const destination = close === -1 ? undefined : readDestination(markdown, close);
			if (destination) {
				const label = markdown.slice(i + 1, close);
				out += `<a href="${escapeAttr(destination.url)}">${inlineToHtml(label)}</a>`;
				i = destination.next - 1;
				continue;
			}
		}

		const delimiter = DELIMITERS.find(([text]) => markdown.startsWith(text, i));
		if (delimiter) {
			const [text, tag] = delimiter;
			const end = findClosing(markdown, i + text.length, text);
			if (end !== -1 && end > i + text.length) {
				const inner = markdown.slice(i + text.length, end);
				out += `<${tag}>${inlineToHtml(inner)}</${tag}>`;
				i = end + text.length - 1;
				continue;
			}
		}

		out += escape(c);
	}

	return out;
}

/**
 * Chooses the media tag for a URL, following the Bot API rule that the media type is
 * determined by the file the URL points at.
 *
 * @internal
 */
function mediaTagFor(url: string): string {
	const path = url.split(/[?#]/, 1)[0] ?? '';
	const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
	switch (extension) {
		case 'jpg':
		case 'jpeg':
		case 'png':
		case 'webp':
			return 'img';
		case 'gif':
		case 'mp4':
		case 'mov':
		case 'webm':
		case 'mkv':
			return 'video';
		case 'mp3':
		case 'm4a':
		case 'flac':
		case 'wav':
		case 'ogg':
		case 'oga':
		case 'opus':
			return 'audio';
		default:
			return 'tg-document';
	}
}

/** @internal */
const MEDIA_LINE = /^!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)$/;

/** @internal */
const HEADING_LINE = /^(#{1,6})\s+(.*)$/;

/** @internal */
const BREAK_LINE = /^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/;

/** @internal */
const BULLET_LINE = /^(\s*)([-*+])\s+(.*)$/;

/** @internal */
const ORDERED_LINE = /^(\s*)(\d+)([.)])\s+(.*)$/;

/** @internal */
const TASK_PREFIX = /^\[([ xX])\]\s*(.*)$/;

/** @internal */
const FOOTNOTE_LINE = /^\[\^([^\]]+)\]:\s*(.*)$/;

/** @internal */
const TABLE_DELIMITER = /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/;

/** @internal */
const RAW_BLOCK_LINE = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/;

/**
 * Tags whose body is rich Markdown rather than rich HTML.
 *
 * @internal
 */
const MARKDOWN_BODY_TAGS = new Set(['details', 'tg-collage', 'tg-slideshow']);

/**
 * Splits a table row into its cells.
 *
 * @internal
 */
function tableCells(line: string): string[] {
	let row = line.trim();
	if (row.startsWith('|')) {
		row = row.slice(1);
	}
	if (row.endsWith('|') && !row.endsWith('\\|')) {
		row = row.slice(0, -1);
	}
	return row.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/**
 * Reads the alignment of each column out of a table delimiter row.
 *
 * @internal
 */
function tableAlignments(line: string): ('left' | 'center' | 'right')[] {
	return tableCells(line).map((cell) => {
		const left = cell.startsWith(':');
		const right = cell.endsWith(':');
		if (left && right) {
			return 'center';
		}
		return right ? 'right' : 'left';
	});
}

/**
 * Translates rich Markdown into rich HTML.
 *
 * @internal
 */
function blocksToHtml(lines: string[]): string {
	let out = '';
	let i = 0;

	const indentOf = (line: string): number => /^\s*/.exec(line)?.[0].length ?? 0;

	while (i < lines.length) {
		const line = lines[i] ?? '';

		if (line.trim() === '') {
			i++;
			continue;
		}

		// Fenced code, including ```math blocks.
		const fence = /^\s*(`{3,}|~{3,})\s*(\S*)\s*$/.exec(line);
		if (fence) {
			const marker = fence[1] ?? '```';
			const language = fence[2] ?? '';
			const body: string[] = [];
			i++;
			while (i < lines.length && !(lines[i] ?? '').trim().startsWith(marker)) {
				body.push(lines[i] ?? '');
				i++;
			}
			i++;
			out +=
				language === 'math'
					? `<tg-math-block>${escape(body.join('\n'))}</tg-math-block>`
					: language === ''
						? `<pre>${escape(body.join('\n'))}</pre>`
						: `<pre><code class="language-${escapeAttr(language)}">${escape(body.join('\n'))}</code></pre>`;
			continue;
		}

		// Display formula.
		if (line.trim().startsWith('$$')) {
			const body: string[] = [];
			const first = line.trim().slice(2);
			if (first.endsWith('$$') && first.length >= 2) {
				out += `<tg-math-block>${escape(first.slice(0, -2))}</tg-math-block>`;
				i++;
				continue;
			}
			if (first !== '') {
				body.push(first);
			}
			i++;
			while (i < lines.length && !(lines[i] ?? '').trim().endsWith('$$')) {
				body.push(lines[i] ?? '');
				i++;
			}
			if (i < lines.length) {
				const last = (lines[i] ?? '').trim();
				body.push(last.slice(0, -2));
				i++;
			}
			out += `<tg-math-block>${escape(body.join('\n'))}</tg-math-block>`;
			continue;
		}

		if (BREAK_LINE.test(line.trim())) {
			out += '<hr/>';
			i++;
			continue;
		}

		const heading = HEADING_LINE.exec(line.trim());
		if (heading) {
			const level = (heading[1] ?? '#').length;
			out += `<h${level}>${inlineToHtml((heading[2] ?? '').trim())}</h${level}>`;
			i++;
			continue;
		}

		const footnote = FOOTNOTE_LINE.exec(line.trim());
		if (footnote) {
			out += `<footer><tg-reference name="${escapeAttr(footnote[1] ?? '')}">${inlineToHtml(footnote[2] ?? '')}</tg-reference></footer>`;
			i++;
			continue;
		}

		// Only an HTTP(S) media line is a block; a tg:// one is an inline custom emoji
		// or formatted date, so it falls through to the paragraph branch.
		const media = MEDIA_LINE.exec(line.trim());
		if (media && /^https?:\/\//i.test(media[2] ?? '')) {
			const url = media[2] ?? '';
			const title = media[3];
			const tag = mediaTagFor(url);
			const element =
				tag === 'img'
					? `<img src="${escapeAttr(url)}"/>`
					: `<${tag} src="${escapeAttr(url)}"></${tag}>`;
			out +=
				title === undefined
					? element
					: `<figure>${element}<figcaption>${inlineToHtml(title)}</figcaption></figure>`;
			i++;
			continue;
		}

		// Block quotation.
		if (line.trimStart().startsWith('>')) {
			const body: string[] = [];
			while (i < lines.length && (lines[i] ?? '').trimStart().startsWith('>')) {
				body.push((lines[i] ?? '').trimStart().replace(/^>\s?/, ''));
				i++;
			}
			out += `<blockquote>${blocksToHtml(body)}</blockquote>`;
			continue;
		}

		// Lists.
		const bullet = BULLET_LINE.exec(line);
		const ordered = ORDERED_LINE.exec(line);
		if (bullet ?? ordered) {
			const baseIndent = indentOf(line);
			const isOrdered = ordered !== null && bullet === null;
			const items: { content: string[]; value?: number }[] = [];

			while (i < lines.length) {
				const current = lines[i] ?? '';
				if (current.trim() === '') {
					// A blank line only continues the list if an indented line follows.
					const next = lines[i + 1] ?? '';
					if (next.trim() === '' || indentOf(next) <= baseIndent) {
						break;
					}
					items[items.length - 1]?.content.push('');
					i++;
					continue;
				}
				const currentBullet = BULLET_LINE.exec(current);
				const currentOrdered = ORDERED_LINE.exec(current);
				const marker = isOrdered ? currentOrdered : currentBullet;
				if (marker && indentOf(current) === baseIndent) {
					items.push({
						content: [isOrdered ? (marker[4] ?? '') : (marker[3] ?? '')],
						value: isOrdered ? Number(marker[2]) : undefined,
					});
					i++;
					continue;
				}
				if (indentOf(current) > baseIndent && items.length > 0) {
					items[items.length - 1]?.content.push(current.slice(baseIndent + 2));
					i++;
					continue;
				}
				break;
			}

			const tag = isOrdered ? 'ol' : 'ul';
			const start = items[0]?.value;
			const startAttr =
				isOrdered && start !== undefined && start !== 1 ? ` start="${start}"` : '';
			out += `<${tag}${startAttr}>`;
			for (const item of items) {
				const first = item.content[0] ?? '';
				const task = TASK_PREFIX.exec(first);
				const checkbox = task
					? `<input type="checkbox"${(task[1] ?? ' ').toLowerCase() === 'x' ? ' checked' : ''}>`
					: '';
				const content = task ? [task[2] ?? '', ...item.content.slice(1)] : item.content;
				const rest = content.slice(1).join('\n').trim();
				out += `<li>${checkbox}${
					rest === ''
						? inlineToHtml((content[0] ?? '').trim())
						: `<p>${inlineToHtml((content[0] ?? '').trim())}</p>${blocksToHtml(content.slice(1))}`
				}</li>`;
			}
			out += `</${tag}>`;
			continue;
		}

		// Table.
		if (line.trim().includes('|') && TABLE_DELIMITER.test((lines[i + 1] ?? '').trim())) {
			const header = tableCells(line);
			const alignments = tableAlignments(lines[i + 1] ?? '');
			i += 2;
			const rows: string[][] = [];
			while (i < lines.length && (lines[i] ?? '').trim().includes('|')) {
				rows.push(tableCells(lines[i] ?? ''));
				i++;
			}

			const cell = (content: string, index: number, isHeader: boolean): string => {
				const tag = isHeader ? 'th' : 'td';
				const align = alignments[index] ?? 'left';
				return `<${tag} align="${align}">${inlineToHtml(content)}</${tag}>`;
			};

			out += '<table>';
			out += `<tr>${header.map((text, index) => cell(text, index, true)).join('')}</tr>`;
			for (const row of rows) {
				out += `<tr>${row.map((text, index) => cell(text, index, false)).join('')}</tr>`;
			}
			out += '</table>';
			continue;
		}

		// Raw HTML block.
		const rawBlock = RAW_BLOCK_LINE.exec(line.trim());
		if (rawBlock) {
			const tag = (rawBlock[2] ?? '').toLowerCase();
			if (MARKDOWN_BODY_TAGS.has(tag)) {
				const closing = `</${tag}>`;
				const body: string[] = [];
				out += line.trim();
				i++;
				while (i < lines.length && !(lines[i] ?? '').trim().startsWith(closing)) {
					body.push(lines[i] ?? '');
					i++;
				}
				out += blocksToHtml(body);
				out += closing;
				i++;
				continue;
			}
			// Everything else is copied verbatim up to the next blank line.
			while (i < lines.length && (lines[i] ?? '').trim() !== '') {
				out += lines[i] ?? '';
				i++;
			}
			continue;
		}

		// Paragraph.
		const paragraph: string[] = [];
		while (i < lines.length) {
			const current = lines[i] ?? '';
			if (
				current.trim() === '' ||
				BREAK_LINE.test(current.trim()) ||
				HEADING_LINE.test(current.trim()) ||
				BULLET_LINE.test(current) ||
				ORDERED_LINE.test(current) ||
				current.trimStart().startsWith('>') ||
				RAW_BLOCK_LINE.test(current.trim()) ||
				/^\s*(`{3,}|~{3,})/.test(current)
			) {
				break;
			}
			paragraph.push(current.trim());
			i++;
		}
		out += `<p>${paragraph.map(inlineToHtml).join('\n')}</p>`;
	}

	return out;
}

/**
 * Translates rich Markdown into the equivalent rich message HTML.
 *
 * Exposed because the translation is the whole of {@link parseRichMarkdown}, and the
 * intermediate HTML is the most direct way to see how a document was understood.
 *
 * @param markdown - The rich Markdown document.
 * @returns The equivalent rich HTML.
 *
 * @example
 * ```typescript
 * import { richMarkdownToHtml } from "@sunafterrainwm/telegram-entities-builder";
 *
 * richMarkdownToHtml('# Title'); // "<h1>Title</h1>"
 * ```
 *
 * @category Parsing
 */
export function richMarkdownToHtml(markdown: string): string {
	return blocksToHtml(markdown.replace(/\r\n?/g, '\n').split('\n'));
}

/**
 * Parses rich message Markdown into the blocks of an `InputRichMessage`.
 *
 * The document is translated into the equivalent rich HTML and then parsed with
 * {@link parseRichHtml}, which mirrors how the Bot API documents the two syntaxes: rich
 * Markdown is GitHub Flavored Markdown that may contain arbitrary rich message HTML.
 *
 * Telegram parses the `markdown` field server-side, so this exists for the cases where
 * the blocks themselves are needed locally.
 *
 * @param markdown - The rich Markdown document.
 * @param options - Message-level options, weak mode and element handlers; these reach
 *   the HTML stage, so `weak` and `on` work the same way here.
 * @returns An `InputRichMessage` carrying the parsed blocks.
 * @throws {ParseError} If an embedded HTML tag is malformed or unsupported and `weak`
 *   is not set.
 *
 * @example
 * ```typescript
 * import { parseRichMarkdown } from "@sunafterrainwm/telegram-entities-builder";
 *
 * parseRichMarkdown('# Title\n\nBody with **bold**.');
 * // { blocks: [ { type: "heading", … }, { type: "paragraph", … } ] }
 * ```
 *
 * @category Parsing
 * @useWhen - You hold rich Markdown and need the structured blocks locally.
 * @avoidWhen - You can send the document as `rich_message.markdown`.
 * @never - NEVER assume byte-for-byte agreement with the server parser; `agents/rich-parsers.md` lists the known gaps.
 */
export function parseRichMarkdown(
	markdown: string,
	options?: ParseRichOptions,
): TT.InputRichMessage<never> {
	return parseRichHtml(richMarkdownToHtml(markdown), options);
}
