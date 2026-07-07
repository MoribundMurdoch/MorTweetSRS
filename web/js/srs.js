/** @typedef {'new' | 'learning' | 'review'} CardState */
/** @typedef {1 | 2 | 3 | 4} Grade 1=Again 2=Hard 3=Good 4=Easy */

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

const LEARNING_STEPS = [
  { minutes: 1, label: "1m" },
  { minutes: 10, label: "10m" },
];

const GRADUATING_INTERVAL_DAYS = 1;
const EASY_INTERVAL_DAYS = 4;
const LAPSE_INTERVAL_MINUTES = 10;

/**
 * @param {Date} from
 * @param {{ days?: number, minutes?: number }} delta
 */
export function addTime(from, delta) {
  const result = new Date(from);
  if (delta.days) {
    result.setDate(result.getDate() + delta.days);
  }
  if (delta.minutes) {
    result.setMinutes(result.getMinutes() + delta.minutes);
  }
  return result;
}

/**
 * @param {import('./store.js').SrsState} srs
 * @param {Date} now
 */
export function isDue(srs, now = new Date()) {
  return new Date(srs.due) <= now;
}

/**
 * @param {import('./store.js').SrsState} srs
 * @param {Grade} grade
 * @param {Date} now
 */
export function previewInterval(srs, grade, now = new Date()) {
  const next = scheduleReview(srs, grade, now);
  return formatInterval(now, new Date(next.due), next.state);
}

/**
 * @param {Date} from
 * @param {Date} to
 * @param {CardState} state
 */
export function formatInterval(from, to, state) {
  const ms = to - from;
  if (ms < 60_000) return "<1m";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(ms / 86_400_000);
  if (days < 60) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 24) return `${months}mo`;
  const years = Math.round(days / 365);
  return `${years}y`;
}

/**
 * @param {import('./store.js').SrsState} srs
 * @param {Grade} grade
 * @param {Date} now
 * @returns {import('./store.js').SrsState}
 */
export function scheduleReview(srs, grade, now = new Date()) {
  const next = { ...srs };

  if (srs.state === "new" || srs.state === "learning") {
    return scheduleLearning(next, grade, now);
  }
  return scheduleReviewCard(next, grade, now);
}

/**
 * @param {import('./store.js').SrsState} srs
 * @param {Grade} grade
 * @param {Date} now
 */
function scheduleLearning(srs, grade, now) {
  const step = srs.learningStep ?? 0;

  if (grade === 1) {
    return {
      ...srs,
      state: "learning",
      learningStep: 0,
      due: addTime(now, { minutes: LEARNING_STEPS[0].minutes }).toISOString(),
    };
  }

  if (grade === 2) {
    const hardMinutes = Math.max(6, LEARNING_STEPS[step]?.minutes ?? 10);
    return {
      ...srs,
      state: "learning",
      learningStep: step,
      due: addTime(now, { minutes: hardMinutes }).toISOString(),
    };
  }

  if (grade === 4) {
    return graduate(srs, EASY_INTERVAL_DAYS, now, DEFAULT_EASE + 0.15);
  }

  if (step + 1 < LEARNING_STEPS.length) {
    return {
      ...srs,
      state: "learning",
      learningStep: step + 1,
      due: addTime(now, { minutes: LEARNING_STEPS[step + 1].minutes }).toISOString(),
    };
  }

  return graduate(srs, GRADUATING_INTERVAL_DAYS, now, DEFAULT_EASE);
}

/**
 * @param {import('./store.js').SrsState} srs
 * @param {Grade} grade
 * @param {Date} now
 */
function scheduleReviewCard(srs, grade, now) {
  let ease = srs.ease ?? DEFAULT_EASE;
  let interval = srs.intervalDays ?? 1;
  let reps = srs.reps ?? 0;
  let lapses = srs.lapses ?? 0;

  if (grade === 1) {
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    return {
      ...srs,
      state: "learning",
      learningStep: 0,
      ease,
      intervalDays: 0,
      reps,
      lapses,
      due: addTime(now, { minutes: LAPSE_INTERVAL_MINUTES }).toISOString(),
    };
  }

  if (grade === 2) {
    ease = Math.max(MIN_EASE, ease - 0.15);
    interval = Math.max(1, interval * 1.2);
    reps += 1;
  } else if (grade === 3) {
    interval = Math.max(1, interval * ease);
    reps += 1;
  } else if (grade === 4) {
    ease += 0.15;
    interval = Math.max(1, interval * ease * 1.3);
    reps += 1;
  }

  return {
    ...srs,
    state: "review",
    learningStep: 0,
    ease,
    intervalDays: interval,
    reps,
    lapses,
    due: addTime(now, { days: interval }).toISOString(),
  };
}

/**
 * @param {import('./store.js').SrsState} srs
 * @param {number} days
 * @param {Date} now
 * @param {number} ease
 */
function graduate(srs, days, now, ease) {
  return {
    ...srs,
    state: "review",
    learningStep: 0,
    ease,
    intervalDays: days,
    reps: 1,
    lapses: srs.lapses ?? 0,
    due: addTime(now, { days }).toISOString(),
  };
}

/** @returns {import('./store.js').SrsState} */
export function newSrsState(now = new Date()) {
  return {
    state: "new",
    learningStep: 0,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    reps: 0,
    lapses: 0,
    due: now.toISOString(),
  };
}

export const GRADES = [
  { grade: 1, key: "1", label: "Again", className: "again" },
  { grade: 2, key: "2", label: "Hard", className: "hard" },
  { grade: 3, key: "3", label: "Good", className: "good" },
  { grade: 4, key: "4", label: "Easy", className: "easy" },
];