/**
 * Section lists for the on-page index rail.
 *
 * Pages declare every section they *could* render, each with the condition that
 * puts it on the page. Sections whose data is missing drop out here so the index
 * never links to an anchor that was never rendered.
 */

/** Fewer links than this is not an index, just a distraction. */
export const MIN_INDEX_SECTIONS = 3;

export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @param {Array<{
 *   id?: string,
 *   label: string,
 *   when?: unknown,
 *   count?: number | null,
 *   depth?: number,
 * } | null | undefined>} sections
 * @returns {Array<{ id: string, label: string, count: number | null, depth: number }>}
 */
export function buildPageIndex(sections) {
  const seen = new Set();
  const kept = [];

  for (const section of sections || []) {
    if (!section) continue;
    if ('when' in section && !section.when) continue;

    const label = String(section.label ?? '').trim();
    if (!label) continue;

    const id = uniqueId(section.id ? slugify(section.id) : slugify(label), seen);
    if (!id) continue;
    seen.add(id);

    kept.push({
      id,
      label,
      count: Number.isFinite(section.count) ? Number(section.count) : null,
      depth: section.depth === 1 ? 1 : 0,
    });
  }

  // A nested entry whose parent section dropped off the page would read as a
  // stray indent, so promote it until something sits above it.
  let hasParent = false;
  for (const entry of kept) {
    if (!hasParent) entry.depth = 0;
    if (entry.depth === 0) hasParent = true;
  }

  return kept.length >= MIN_INDEX_SECTIONS ? kept : [];
}

function uniqueId(base, seen) {
  if (!base) return '';
  if (!seen.has(base)) return base;
  let n = 2;
  while (seen.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
