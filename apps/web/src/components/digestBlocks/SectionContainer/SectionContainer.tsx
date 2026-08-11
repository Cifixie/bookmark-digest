import type { SectionContainerProps } from "@bookmark-digest/catalog";

/**
 * SectionContainer — rendered via Registry's Wrapped wrapper which injects
 * { children } as a prop. The Zod props schema only has className/accentColor.
 */
export function SectionContainer({
  className,
  accentColor,
  children,
}: SectionContainerProps & { children?: React.ReactNode }) {
  return (
    <div
      className={className}
      style={{
        marginBottom: 24,
        marginTop: 24,
        ...(accentColor
          ? { borderTop: `3px solid ${accentColor}`, paddingLeft: 16, borderLeft: `1px solid ${accentColor}30` }
          : {}),
      }}
    >
      {children}
    </div>
  );
}
