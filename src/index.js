const SCORES = new Map([
  ['win', 1],
  ['draw', 0.5],
  ['loss', 0],
]);

const DEFAULT_K = 32;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readPlayer(value, label) {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  if (typeof value.rating !== 'number' || !Number.isFinite(value.rating)) {
    throw new TypeError(`${label}.rating must be a finite number`);
  }
  const games = value.games === undefined ? 0 : value.games;
  if (!Number.isInteger(games) || games < 0) {
    throw new TypeError(`${label}.games must be a non-negative integer`);
  }
  return { rating: value.rating, games };
}

function roundHalfAwayFromZero(value) {
  return Math.sign(value) * Math.round(Math.abs(value));
}

function resolveK(k, rating, games) {
  const resolved = typeof k === 'function' ? k(rating, games) : k;
  if (typeof resolved !== 'number' || !Number.isFinite(resolved) || resolved < 0) {
    throw new TypeError(
      'k must be a non-negative finite number or a function that returns one',
    );
  }
  return resolved;
}

export function expectedScore(rating, opponentRating) {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) {
    throw new TypeError('rating must be a finite number');
  }
  if (typeof opponentRating !== 'number' || !Number.isFinite(opponentRating)) {
    throw new TypeError('opponent rating must be a finite number');
  }
  const power = 10 ** ((opponentRating - rating) / 400);
  if (power === Infinity) {
    return 0;
  }
  if (power === 0) {
    return 1;
  }
  return 1 / (1 + power);
}

export function rate(player, opponent, outcome, options = {}) {
  const left = readPlayer(player, 'player');
  const right = readPlayer(opponent, 'opponent');
  if (typeof outcome !== 'string' || !SCORES.has(outcome)) {
    throw new TypeError('outcome must be "win", "loss", or "draw"');
  }
  if (!isRecord(options)) {
    throw new TypeError('options must be an object');
  }

  const k = options.k === undefined ? DEFAULT_K : options.k;
  if (typeof k !== 'number' && typeof k !== 'function') {
    throw new TypeError(
      'k must be a non-negative finite number or a function that returns one',
    );
  }
  if (
    options.floor !== undefined &&
    (typeof options.floor !== 'number' || !Number.isFinite(options.floor))
  ) {
    throw new TypeError('floor must be a finite number');
  }

  const leftK = resolveK(k, left.rating, left.games);
  const rightK = resolveK(k, right.rating, right.games);
  const leftExpected = expectedScore(left.rating, right.rating);
  const rightExpected = 1 - leftExpected;
  const leftScore = SCORES.get(outcome);
  const rightScore = 1 - leftScore;
  const rawDelta = ((leftK + rightK) / 2) * (leftScore - leftExpected);
  if (!Number.isFinite(rawDelta)) {
    throw new RangeError('rating change is not finite');
  }

  const delta = roundHalfAwayFromZero(rawDelta);
  let leftRating = left.rating + delta;
  let rightRating = right.rating - delta;
  const floor = options.floor;
  if (floor !== undefined && (leftRating < floor || rightRating < floor)) {
    const total = left.rating + right.rating;
    if (total < floor * 2) {
      leftRating = floor;
      rightRating = floor;
    } else if (leftRating < floor) {
      leftRating = floor;
      rightRating = total - floor;
    } else {
      rightRating = floor;
      leftRating = total - floor;
    }
  }

  return {
    player: {
      rating: leftRating,
      expected: leftExpected,
      score: leftScore,
      delta: leftRating - left.rating,
    },
    opponent: {
      rating: rightRating,
      expected: rightExpected,
      score: rightScore,
      delta: rightRating - right.rating,
    },
  };
}
