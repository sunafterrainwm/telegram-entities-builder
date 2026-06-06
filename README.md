# telegram-entities-builder

A highly robust, dynamic, and powerful builder library designed for composing, slicing, and merging Telegram message text entities with complete ease and safety. This package seamlessly integrates with Grammy types and provides advanced features for complex messaging needs.

## Features

- Dynamic text and entity composition
- Safe entity offset/length recalculation
- Built-in TypeScript support with extensive TSDoc
- Works seamlessly with Grammy.js types

## Example

Here is a quick example of how to use the builder in your project:

```typescript
import { EntityBuilder } from '@sunafterrainwm/telegram-entities-builder';

// Setup
const builder = new EntityBuilder();

// Call
builder.addTextEntity('Hello World', { type: 'bold' });
const payload = builder.buildTextPayload();

// Assertion/Output
console.log(payload.text); // "Hello World"
```

## Troubleshooting

- **Entity overlaps:** Ensure entities do not inappropriately overlap or break platform boundaries.
- **Merge errors:** If you see "Cannot merge: This builder is not a fork", verify your builder instance lifecycle.
