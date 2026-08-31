/**
 * The short form of a sponsor's name, for meta lines that sit beside a title.
 *
 * Congress.gov writes an amendment sponsor as `Sen. Collins, Susan M. [R-ME]`,
 * which is longer than the headline it annotates and repeats the party already
 * carried by the colour the name is tinted with. Everything up to the first
 * comma is the title and family name — `Sen. Collins` — which is what a reader
 * scanning a column of amendments actually needs.
 *
 * Bills are unaffected: they store a plain `sponsor.name` already.
 */
export function shortSponsorName(fullName) {
  const raw = String(fullName || '').trim();
  if (!raw) return '';

  // `Sen. Collins, Susan M. [R-ME]` -> `Sen. Collins`
  const beforeComma = raw.split(',')[0].trim();
  // A name with no comma can still carry the bracketed party-state suffix.
  return beforeComma.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}
