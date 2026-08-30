/**
 * Presentation rules for a committee meeting's status.
 *
 * A schedule is the most time-sensitive thing on a site that rebuilds on a
 * cron, and the failure mode is specific: a meeting canceled after the last
 * build still renders as scheduled. Nothing here can fix that — only the fetch
 * cadence narrows the window — so the status is always shown explicitly rather
 * than implied by a meeting's presence in the list, and pages carry the date
 * the schedule was read.
 *
 * Colours follow the bill-stage vocabulary: navy for what is on, red for what
 * is off, goldenrod for what is unsettled, quiet ink for what has passed.
 * Nothing turns green.
 */

export const MEETING_STATUSES = ['Scheduled', 'Rescheduled', 'Postponed', 'Canceled'];

export const MEETING_STATUS_DOT = {
  Scheduled: 'bg-yea',
  Rescheduled: 'bg-[#b8860b]',
  Postponed: 'bg-[#b8860b]',
  Canceled: 'bg-accent',
  Held: 'bg-ink-3',
};

export const MEETING_STATUS_TEXT = {
  Scheduled: 'text-yea',
  Rescheduled: 'text-ink-2',
  Postponed: 'text-ink-2',
  Canceled: 'text-accent',
  Held: 'text-ink-3',
};

/** Falls back to quiet ink so an unrecognized status still renders legibly. */
export function meetingStatusDot(status) {
  return MEETING_STATUS_DOT[status] || 'bg-ink-3';
}

export function meetingStatusText(status) {
  return MEETING_STATUS_TEXT[status] || 'text-ink-3';
}

/**
 * Whether a meeting is still ahead.
 *
 * A meeting with no date is treated as past rather than upcoming: the schedule
 * is the promise this page makes, and listing an undated record among what is
 * coming up would assert a commitment the source never made.
 */
export function isUpcoming(meeting, now = Date.now()) {
  const t = Date.parse(meeting?.date || '');
  return Number.isFinite(t) && t >= now;
}

/**
 * The label to show for a meeting, which is not the same as its raw status.
 *
 * `meetingStatus` answers "was this called off?", not "has this happened?" —
 * Congress.gov leaves a meeting that took place last March sitting at
 * "Scheduled" forever. Printing that verbatim tells a reader a past meeting is
 * still ahead of them, so a meeting whose date has passed reads "Held" instead.
 *
 * Canceled and Postponed are never rewritten this way: those describe something
 * that was decided about the meeting, and they stay true after the date.
 */
export function meetingLabel(meeting, now = Date.now()) {
  const status = meeting?.meetingStatus || '';
  if (status === 'Canceled' || status === 'Postponed') return status;
  if (isUpcoming(meeting, now)) return status || 'Scheduled';
  // No date at all: the source never said when, so neither do we.
  if (!meeting?.date) return status || 'Scheduled';
  return 'Held';
}

/** Sort key: soonest upcoming first, then most recent past, undated last. */
export function compareMeetings(a, b, now = Date.now()) {
  const ta = Date.parse(a?.date || '');
  const tb = Date.parse(b?.date || '');
  const validA = Number.isFinite(ta);
  const validB = Number.isFinite(tb);
  if (validA !== validB) return validA ? -1 : 1;
  if (!validA) return 0;

  const aheadA = ta >= now;
  const aheadB = tb >= now;
  if (aheadA !== aheadB) return aheadA ? -1 : 1;
  return aheadA ? ta - tb : tb - ta;
}
