const customRules: string[] = [
  'Use "SectionContainer" as the root element',
  "Provide REAL props, never empty {}",
  "This is static one-shot content, not an interactive app: there is no state model, so do not use any stateful or dynamic prop expressions.",
  "Do NOT use 'repeat', 'state', or dynamic prop expressions ({'$state':...}, {'$item':...}, {'$bindState':...}, {'$template':...}, {'$cond':...}).",
  "Every prop value must be a literal string, number, boolean, or array — write out each repeated item (e.g. each Card, Step, GlossaryTerm) as its own element instead.",
  "Every key referenced in a children array must exist as its own element in the output.",
];

export default customRules;
