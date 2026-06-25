/**
 * Numbering template format, per explicit decision: "manual input,
 * template only for format validation" (not auto-generation). A
 * Document Controller still TYPES the document number by hand when
 * creating a document — this module's only job is to check that what
 * they typed matches the org's configured pattern for that document
 * type, catching typos/inconsistency before the document is saved.
 *
 * Template syntax: a literal string with exactly one `{number}`
 * placeholder, e.g. "QM-{number}", "PRO-{number}-2025", "{number}/WI/REV".
 * `{number}` matches one or more digits. Everything else in the
 * template is matched LITERALLY (case-sensitive) against the typed
 * document number.
 *
 * This is deliberately simple — no zero-padding enforcement, no
 * sequence tracking, no per-department sub-templates. If GIN/DBG needs
 * those, that's a richer template language, not a tweak to this file.
 */

const PLACEHOLDER = "{number}";

export interface TemplateValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates a template string itself (used when Super Admin configures
 * the template in Settings) — must contain exactly one {number}
 * placeholder, and the literal parts must not contain regex-special
 * characters that would make the resulting pattern behave unexpectedly.
 */
export function validateTemplateSyntax(template: string): TemplateValidationResult {
  const occurrences = template.split(PLACEHOLDER).length - 1;
  if (occurrences === 0) {
    return { valid: false, reason: `Template must contain the placeholder ${PLACEHOLDER}.` };
  }
  if (occurrences > 1) {
    return { valid: false, reason: `Template must contain ${PLACEHOLDER} exactly once.` };
  }

  const literalParts = template.split(PLACEHOLDER);
  const hasUnsafeChars = literalParts.some((part) => /[.*+?^${}()|[\]\\]/.test(part));
  if (hasUnsafeChars) {
    return {
      valid: false,
      reason:
        "Template can only contain letters, numbers, hyphens, slashes, and the {number} placeholder.",
    };
  }

  return { valid: true };
}

/**
 * Builds a RegExp from a validated template. Caller must have already
 * confirmed validateTemplateSyntax(template).valid — this function does
 * not re-validate, to avoid doing the same check twice on every document
 * creation call.
 */
function templateToRegex(template: string): RegExp {
  const [prefix, suffix] = template.split(PLACEHOLDER);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escape(prefix)}\\d+${escape(suffix)}$`);
}

/**
 * Validates a TYPED document number against the org's template for a
 * given document type. Returns { valid: true } if there is no template
 * configured for that type — an org that hasn't set up numbering yet
 * should not be blocked from creating documents; numbering enforcement
 * is opt-in per type, not a hard requirement of the system.
 */
export function validateDocumentNumber(
  documentNumber: string,
  template: string | undefined
): TemplateValidationResult {
  if (!template) {
    return { valid: true };
  }

  const syntaxCheck = validateTemplateSyntax(template);
  if (!syntaxCheck.valid) {
    return {
      valid: false,
      reason: `This document type's numbering template is misconfigured (${syntaxCheck.reason}). Contact a Super Admin.`,
    };
  }

  const regex = templateToRegex(template);
  if (!regex.test(documentNumber)) {
    return {
      valid: false,
      reason: `Document number must match the pattern "${template}" (e.g. ${template.replace(PLACEHOLDER, "001")}).`,
    };
  }

  return { valid: true };
}
