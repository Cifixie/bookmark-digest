import { z } from "zod";
import { writtenSchema, type Written } from "./Written/Written.schema";
import { temporalSchema, type Temporal } from "./Temporal/Temporal.schema";
import { chapterSchema, type Chapter } from "./Chapter/Chapter.schema";
import { speakerSchema, type Speaker } from "./Speaker/Speaker.schema";

// Re-export nested types
export { chapterSchema, speakerSchema };
export type { Chapter, Speaker };

/**
 * Discriminated union of all source variants.
 * The `kind` discriminant determines which schema fills in the remaining fields.
 *
 * Usage in a DigestPage: `source: SourceVariant` selects the appropriate variant.
 * The source variant feeds into `DigestHero` (branch on kind) and nested fields.
 */
export const sourceVariantSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("written"), ...writtenSchema.shape }),
  z.object({ kind: z.literal("temporal"), ...temporalSchema.shape }),
]);
export type SourceVariant = z.infer<typeof sourceVariantSchema>;

// Re-export variant schemas
export { writtenSchema, type Written };
export { temporalSchema, type Temporal };
