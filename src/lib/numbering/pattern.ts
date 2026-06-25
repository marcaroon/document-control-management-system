/**
 * Numbering template format, per explicit decision: "Manual input,
 * template only validates format" — NOT auto-generation. A Document
 * Controller still types the document number by hand; this just tells
 * them (and enforces server-side) whether what they typed matches the
 * org's convention for that document type.
 *
 * Template syntax (kept deliberately small — this is a format checker,
 * not a templating engine):
 *   {seq}   -> one or more digits, e.g. "001", "42"
 *   {dept}  -> one or more uppercase letters, e.g. "QA", "PROD"
 *   {type}  -> one or more uppercase letters, e.g. "QM", "WI", "SOP"
 *   {year}  -> exactly 4 digits, e.g. "2026"
 * Any other literal character in the template (dashes, dots, slashes)
 * must appear literally in the document number at that position.
 *
 * Example: template "QM-{seq}" validates "QM-001" and also "QM-42" —
 * {seq} matches one-or-more digits with no fixed width, so it does NOT
 * enforce zero-padding. If GIN/DBG wants a fixed width (always exactly
 * 3 digits), that's a real but separate decision the spec didn't make —
 * flagging it here rather than silently picking a width, since guessing
 * wrong would be more annoying to unwind later than asking now.
 */

const PLACEHOLDER_PATTERNS: Record<string, string> = {
  "{seq}": "\\d+",
  "{dept}": "[A-Z]+",
  "{type}": "[A-Z]+",
  "{year}": "\\d{4}",
};

const PLACEHOLDER_REGEX = /\{seq\}|\{dept\}|\{type\}|\{year\}/g;

/** Escapes regex-special characters in the LITERAL portions of a template. */
function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Converts a numbering template string into a compiled RegExp that
 * matches a conforming document number end-to-end (anchored).
 *
 * Throws if the template contains an unrecognized placeholder (e.g. a
 * typo like "{seqq}") — better to fail loudly when the template is
 * SAVED (in updateNumberingTemplate) than to silently treat a typo'd
 * placeholder as a literal string forever.
 */
export function compileNumberingPattern(template: string): RegExp {
  const unknownPlaceholder = template.match(/\{[a-zA-Z]+\}/g)?.find(
    (p) => !(p in PLACEHOLDER_PATTERNS)
  );
  if (unknownPlaceholder) {
    throw new Error(
      `Unknown placeholder "${unknownPlaceholder}" in numbering template. ` +
        `Supported placeholders: {seq}, {dept}, {type}, {year}.`
    );
  }

  let pattern = "";
  let lastIndex = 0;
  for (const match of template.matchAll(PLACEHOLDER_REGEX)) {
    pattern += escapeRegexLiteral(template.slice(lastIndex, match.index));
    pattern += PLACEHOLDER_PATTERNS[match[0]];
    lastIndex = match.index! + match[0].length;
  }
  pattern += escapeRegexLiteral(template.slice(lastIndex));

  return new RegExp(`^${pattern}$`);
}

/**
 * Validates a document number against the org's template for the given
 * document type. Returns true if there's no template configured for
 * that type — an org that hasn't set up numbering yet shouldn't have
 * document creation blocked by a check that has nothing to check
 * against. This is a deliberate "fail open" for the no-template case,
 * NOT for a malformed template (compileNumberingPattern throws on that,
 * and that throw is NOT caught here — a saved-but-broken template is a
 * data problem worth surfacing loudly, not silently ignoring).
 */
export function validateDocumentNumber(
  documentNumber: string,
  template: string | undefined
): { valid: true } | { valid: false; reason: string } {
  if (!template) return { valid: true };

  const regex = compileNumberingPattern(template);
  if (regex.test(documentNumber)) return { valid: true };

  return {
    valid: false,
    reason: `Document number "${documentNumber}" doesn't match this organization's ` +
      `numbering convention for this document type ("${template}").`,
  };
}
