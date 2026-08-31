/**
 * Reads a bill's latest action into the three parts an index row can show.
 *
 * The problem this solves is repetition. On the bills index, the latest-action
 * line was about 90% boilerplate: twenty rows all reading "Referred to the
 * House Committee on …", truncated mid-word, saying the same thing the stage
 * badge beside them already said. The information a reader actually wants out
 * of that sentence is *which committee* — and that is the one part the
 * boilerplate buries at the end.
 *
 * So the sentence is split: a quiet mono verb ("Referred to"), the object
 * promoted to readable body text ("Energy and Commerce"), and any remainder
 * demoted to a footnote ("+ 2 more committees"). The column then reads
 * Energy and Commerce / Armed Services / the Judiciary down the page instead
 * of the same sentence twenty-five times.
 *
 * Anything unrecognized falls through to `Latest action` with the string
 * intact, so a wording we have not seen degrades to what the page showed
 * before rather than to nothing.
 */

/** @typedef {{ verb: string, object: string, extra: string }} Referral */

/**
 * Congress.gov writes the chamber into some referrals and not others, and the
 * Senate prefixes its own with the reading: "Read twice and referred to the
 * Committee on the Judiciary." That is the same fact as a House referral and
 * belongs in the same column — without it, 71 of the bills currently indexed
 * would fall through to the raw-string branch and print the boilerplate this
 * helper exists to strip.
 */
const COMMITTEE_PREFIX =
  /^(?:Read twice and )?referred to the (?:House |Senate )?(?:Committee on |Subcommittee on )?/i;

/**
 * @param {string | null | undefined} latestAction
 * @returns {Referral}
 */
export function referral(latestAction) {
  const raw = String(latestAction || '').trim();
  if (!raw) return { verb: 'Latest action', object: '', extra: '' };

  // "Became Public Law No: 119-42." — the one outcome that outranks a referral.
  const law = raw.match(/Became Public Law No:?\s*([\d-]+)/i);
  if (law) {
    return { verb: 'Enacted', object: `Public Law ${law[1].replace(/\.$/, '')}`, extra: '' };
  }

  // "Placed on the Union Calendar, Calendar No. 660."
  const union = raw.match(/Placed on the Union Calendar,?\s*Calendar No\.?\s*([\d-]+)/i);
  if (union) {
    return { verb: 'Placed on', object: 'Union Calendar', extra: `No. ${union[1].replace(/\.$/, '')}` };
  }

  // "Placed on Senate Legislative Calendar under General Orders. Calendar No. 12."
  const senate = raw.match(/Placed on Senate Legislative Calendar under ([^.]+)/i);
  if (senate) {
    return { verb: 'Placed on', object: 'Senate Calendar', extra: senate[1].trim() };
  }

  if (COMMITTEE_PREFIX.test(raw)) {
    const body = raw.replace(COMMITTEE_PREFIX, '').replace(/\.\s*$/, '');

    // A multi-committee referral names the rest after ", and in addition to".
    const split = body.split(/,?\s*and in addition to the Committees? on\s*/i);
    const first = split[0].replace(/,\s*$/, '').trim();

    if (split.length > 1 && split[1]) {
      // "Ways and Means, and Energy and Commerce" -> two more committees. The
      // names themselves contain "and", so the count comes from the commas
      // rather than from splitting on the conjunction.
      const rest = split[1].trim();
      const count = rest.split(/,(?![^(]*\))/).filter(part => part.trim()).length;
      return {
        verb: 'Referred to',
        object: first,
        extra: `+ ${count} more committee${count === 1 ? '' : 's'}`,
      };
    }

    return { verb: 'Referred to', object: first, extra: '' };
  }

  return { verb: 'Latest action', object: raw.replace(/\.\s*$/, ''), extra: '' };
}
