import { ParseError } from './internal.ts';

/**
 * An element as a selector sees it: a lower-cased tag name and its attributes.
 *
 * @category Parsing
 */
export interface HtmlTagMatch {
	/** The lower-cased tag name. */
	tag: string;
	/** The attributes, keyed by lower-cased name; a valueless one holds `''`. */
	attrs: Readonly<Record<string, string | undefined>>;
}

/**
 * The shape every element handler shares, and the bound of the `H` parameters below.
 *
 * Each parser hands its handlers a different description of the element — the classic one
 * has only the tag name and the attributes, the rich one has the parsed node — so there
 * is no common argument type, and the parameter is typed `never` to accept any of them.
 * What the bound does pin down is that a handler is a one-argument function, which is
 * what rules out a table of plain values.
 */
export type HtmlTagHandlerLike = (element: never) => unknown;

/**
 * A selector naming the elements a handler applies to.
 *
 * A deliberately small subset of CSS, because the parsers walk a tag stream rather than a
 * document: a selector is one or more comma-separated alternatives, each a tag name or
 * `*`, optionally followed by attribute filters.
 *
 * ```text
 * ul              every <ul>
 * ul, ol          either kind of list
 * *               any element, as a fallback
 * a[name]         an <a> that carries a name attribute
 * input[type=checkbox]
 * td[align="right"]
 * ```
 *
 * The most specific match wins: an alternative with attribute filters beats a bare tag
 * name, which beats `*`. Ties go to whichever was declared first.
 *
 * @category Parsing
 */
export type HtmlSelector = string;

/**
 * One compiled alternative of a selector.
 *
 * @internal
 */
interface CompiledSelector {
	tag: string;
	attrs: { name: string; value?: string }[];
	specificity: number;
	order: number;
}

/** @internal */
const SIMPLE_SELECTOR = /^(\*|[a-zA-Z][\w-]*)((?:\[[^\]]*\])*)$/;

/** @internal */
const ATTRIBUTE_FILTER =
	/\[\s*([^\]=\s]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*))\s*)?\]/g;

/**
 * Compiles one alternative of a selector.
 *
 * @internal
 */
function compile(source: string, order: number): CompiledSelector {
	const match = SIMPLE_SELECTOR.exec(source.trim());
	if (!match) {
		throw new ParseError(`Unsupported selector "${source.trim()}"`);
	}

	const tag = (match[1] ?? '*').toLowerCase();
	const attrs: { name: string; value?: string }[] = [];
	for (const filter of (match[2] ?? '').matchAll(ATTRIBUTE_FILTER)) {
		const name = (filter[1] ?? '').toLowerCase();
		const value = filter[2] ?? filter[3] ?? filter[4];
		attrs.push(value === undefined ? { name } : { name, value });
	}

	return {
		tag,
		attrs,
		specificity: attrs.length * 2 + (tag === '*' ? 0 : 1),
		order,
	};
}

/**
 * A table of selectors and the handlers they select, resolved most-specific first.
 *
 * @typeParam H - The handler type; the parsers each have their own.
 *
 * @category Parsing
 */
export class HtmlSelectorMap<H extends HtmlTagHandlerLike> {
	#entries: { selector: CompiledSelector; handler: H }[] = [];
	#order = 0;

	/**
	 * Creates a table out of a selector-keyed object.
	 *
	 * @param handlers - The handlers, keyed by {@link HtmlSelector}.
	 */
	public constructor(handlers: Readonly<Record<HtmlSelector, H>> = {}) {
		for (const [selector, handler] of Object.entries(handlers)) {
			this.add(selector, handler);
		}
	}

	/**
	 * Registers one handler.
	 *
	 * @param selector - The selector, which may list several alternatives.
	 * @param handler - The handler to run for a matching element.
	 * @returns This table, for chaining.
	 * @throws {ParseError} If the selector is not of the supported shape.
	 */
	public add(selector: HtmlSelector, handler: H): this {
		for (const alternative of selector.split(',')) {
			if (alternative.trim() === '') {
				continue;
			}
			this.#entries.push({ selector: compile(alternative, this.#order++), handler });
		}
		this.#entries.sort(
			(a, b) =>
				b.selector.specificity - a.selector.specificity ||
				a.selector.order - b.selector.order,
		);
		return this;
	}

	/**
	 * Indicates whether any handler is registered.
	 */
	public get isEmpty(): boolean {
		return this.#entries.length === 0;
	}

	/**
	 * Finds the handler for an element.
	 *
	 * @param element - The element to match.
	 * @returns The most specific matching handler, or `undefined` for no match.
	 */
	public find(element: HtmlTagMatch): H | undefined {
		for (const { selector, handler } of this.#entries) {
			if (selector.tag !== '*' && selector.tag !== element.tag) {
				continue;
			}
			const matches = selector.attrs.every(({ name, value }) => {
				const actual = element.attrs[name];
				return actual !== undefined && (value === undefined || actual === value);
			});
			if (matches) {
				return handler;
			}
		}
		return undefined;
	}
}

/**
 * The options every HTML parser in this package takes.
 *
 * @typeParam H - The handler type of the parser being configured.
 *
 * @category Parsing
 */
export interface HtmlTransformOptions<H extends HtmlTagHandlerLike> {
	/**
	 * Pass `true` to drop whatever cannot be represented instead of raising.
	 *
	 * In weak mode the parser never throws a {@link ParseError}: an unsupported tag keeps
	 * its text and loses its markup, an entity that cannot be built is left out, a stray
	 * end tag is ignored, an unclosed one is closed at the end of the input, and a
	 * malformed tag is skipped. Use it for markup you did not produce.
	 */
	weak?: boolean;
	/**
	 * Handlers that rewrite elements the parser has no representation for, keyed by
	 * {@link HtmlSelector}.
	 *
	 * A handler also overrides the built-in handling of a tag, so `{ 'b': … }` replaces
	 * the bold entity rather than adding to it.
	 */
	on?: Readonly<Record<HtmlSelector, H>>;
}

/**
 * Base class of the parser configurations.
 *
 * Both parsers accept a plain options object, so this only earns its keep when a
 * configuration is shared across calls or when the lookup itself needs replacing:
 * subclass it and override {@link HtmlTransform.handlerFor} to resolve elements any way
 * you like, selectors included or not.
 *
 * @typeParam H - The handler type of the parser being configured.
 *
 * @example
 * ```typescript
 * class MyHtml extends EntityTransform {
 * 	public constructor() {
 * 		super({ weak: true, on: { 'li': () => ({ before: '• ', after: '\n' }) } });
 * 	}
 * }
 *
 * parseHtml(html, new MyHtml());
 * ```
 *
 * @category Parsing
 */
export abstract class HtmlTransform<H extends HtmlTagHandlerLike> {
	/** Whether to drop what cannot be represented instead of raising. */
	public weak: boolean;

	/** The compiled handler table backing {@link HtmlTransform.handlerFor}. */
	protected readonly handlers: HtmlSelectorMap<H>;

	/**
	 * @param options - The options to compile.
	 */
	protected constructor(options: HtmlTransformOptions<H> = {}) {
		this.weak = options.weak ?? false;
		this.handlers = new HtmlSelectorMap<H>(options.on ?? {});
	}

	/**
	 * Indicates whether any handler is registered, so a parser can skip the lookup.
	 */
	public get hasHandlers(): boolean {
		return !this.handlers.isEmpty;
	}

	/**
	 * Resolves the handler for an element.
	 *
	 * @param element - The element being parsed.
	 * @returns The handler to run, or `undefined` to fall back to the built-in handling.
	 */
	public handlerFor(element: HtmlTagMatch): H | undefined {
		return this.handlers.find(element);
	}
}
