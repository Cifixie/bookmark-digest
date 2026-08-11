// ---------------------------------------------------------------------------
// validateDigestSpec — structural + per-type props validation for a Spec
//
// Runs catalog.validate() for structural checks (valid types, valid tree,
// no orphans), then walks spec.elements, looks up each element's type in
// digestBlockProps, and safeParses its props — catching empty-props blocks
// that catalog.zodSchema() would let through.
// ---------------------------------------------------------------------------

import { validateSpec, type Spec } from "@json-render/core";
import catalog from "./catalog";
import { digestBlockProps } from "./digestBlockProps";

export interface DigestValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Validate a Spec for use in digest generation.
 * Returns `{ valid: true }` when both structural and per-type props checks pass.
 */
export function validateDigestSpec(spec: unknown): DigestValidationResult {
  const issues: string[] = [];

  // --- Structural validation (catalog) ---
  const catalogResult = catalog.validate(spec);
  if (!catalogResult.success) {
    const zodError = catalogResult.error;
    if (zodError && zodError.issues) {
      for (const issue of zodError.issues) {
        const pathStr = issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
        issues.push(`[catalog] ${pathStr}: ${issue.message}`);
      }
    } else {
      issues.push("[catalog] validation failed (unknown error)");
    }
  }

  // Also run core validateSpec for additional structural checks
  const coreResult = validateSpec(spec as Spec);
  for (const issue of coreResult.issues) {
    if (!issues.some((i) => i.includes(issue.code ?? "unknown"))) {
      issues.push(`[spec] ${issue.message ?? issue.code ?? "unknown"}`);
    }
  }

  // --- Per-type props validation ---
  const typedSpec = spec as Spec;
  if (typedSpec?.elements) {
    for (const [key, element] of Object.entries(typedSpec.elements)) {
      const elemType = element?.type as string | undefined;
      if (!elemType) continue;

      const propsSchema = digestBlockProps[elemType];
      if (propsSchema) {
        const props = (element as { props?: Record<string, unknown> }).props ?? {};
        const parsed = propsSchema.safeParse(props);
        if (!parsed.success && parsed.error?.issues) {
          const fieldErrors = parsed.error.issues
            .map((e) => {
              const pathStr = e.path.length > 0 ? e.path.map(String).join(".") : "(root)";
              return `${pathStr}: ${e.message}`;
            })
            .join("; ");
          issues.push(`[${elemType} ${key}]: ${fieldErrors}`);
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
