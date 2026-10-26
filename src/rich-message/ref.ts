/**
 * Shared freeze state of a block reference.
 *
 * Every reference composes one of these rather than inheriting it, because the
 * reference classes extend three different builders (text, block list and list items)
 * and so cannot share a base class. The cascade in {@link RefState.finish} is the one
 * piece of behaviour they all need, so it lives here.
 *
 * @internal
 */
export class RefState {
	#finished = false;
	readonly #children: RefState[] = [];

	/** Indicates whether this reference has been frozen. */
	public get isFinished(): boolean {
		return this.#finished;
	}

	/**
	 * Registers a nested reference, so that freezing this one freezes that one too.
	 *
	 * @param child - State of the nested reference.
	 */
	public adopt(child: RefState): void {
		this.#children.push(child);
	}

	/** Freezes this reference and, recursively, every reference nested inside it. */
	public finish(): void {
		this.#finished = true;
		for (const child of this.#children) {
			child.finish();
		}
	}

	/**
	 * Throws when the reference has been frozen.
	 *
	 * @throws {TypeError} If {@link RefState.finish} has been called.
	 */
	public assertWritable(): void {
		if (this.#finished) {
			throw new TypeError(
				'Cannot modify a finished block reference. Finishing a reference freezes it ' +
					'and everything nested inside it.',
			);
		}
	}
}

/**
 * Carries the freeze state of a reference, so that a reference to something which is not
 * a block — the summary of a `details` block — still says in its type that it belongs to
 * a reference and can refuse a write.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export interface RichRef {
	/** Indicates whether the reference has been frozen. */
	readonly isFinished: boolean;
	/**
	 * Freezes this reference and everything nested inside it, so that any further write
	 * throws.
	 *
	 * @returns Nothing.
	 */
	finish(): void;
}

/**
 * The freeze state behind a reference.
 *
 * Symbol-keyed so that it stays off the public surface: a caller never needs it, and
 * leaking {@link RefState} into the documented API would advertise an internal class.
 *
 * @internal
 */
export const kState = Symbol('richRefState');

/**
 * A handle on one block of a rich message, which keeps its position in the block list
 * while its content is still being filled in.
 *
 * A reference is handed out by the block methods of `RichBlockBuilder`, which insert
 * the block immediately; writing through the reference afterwards only changes the
 * block's content, never its position. Resolution happens when the message is built,
 * so a reference may be written to for as long as it is not finished.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export interface RichBlockRef extends RichRef {
	/** Type of the block this reference points at. */
	readonly type: string;
}

/**
 * A read-only reference to a block that was appended as plain data, which therefore has
 * no builder behind it.
 *
 * `RichBlockBuilder.lastBlock` returns one of these for a block added through
 * `addBlock`. Only {@link RichBlockRef.type} carries information; the reference is
 * finished from the start, so every write throws.
 *
 * @category Rich Message Types
 * @since Bot API 10.2
 */
export class ReadonlyRichBlockRef implements RichBlockRef {
	readonly #type: string;

	/**
	 * Wraps a block that was appended as plain data.
	 *
	 * @param type - Type of the block being pointed at.
	 */
	public constructor(type: string) {
		this.#type = type;
	}

	/** @inheritDoc */
	public get type(): string {
		return this.#type;
	}

	/** Always `true`: a block appended as plain data can never be written to. */
	public readonly isFinished = true;

	/**
	 * Does nothing, because the reference is finished from the start.
	 */
	public finish(): void {
		// Already finished; kept so that every reference answers the same interface.
	}
}
