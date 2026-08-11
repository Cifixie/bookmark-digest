import { z } from "zod";

export type SectionContainerProps = z.infer<typeof props>;

/**
 * SectionContainer — root layout wrapper for a DigestSection's Spec.
 *
 * This is not content; it's a structural container. It renders {children}
 * inside a margin/padding wrapper and provides an optional accent color
 * or background that affects all nested elements.
 */
export const props = z.object({
  /** Optional CSS class or style hook for section theming. */
  className: z.string().optional(),
  /** Optional accent color string (e.g. "#1a73e8") for section theming. */
  accentColor: z.string().optional(),
});

export const description =
  "Layout container — the root element of a DigestSection's Spec. Renders all children (content blocks) inside a structured wrapper. Use this as the first element in a section's Spec, or let the system auto-wrap content in a SectionContainer.";
