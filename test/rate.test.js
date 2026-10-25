import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as api from '../src/index.js';

const { expectedScore, rate } = api;

function throws(fn, name, message) {
  assert.throws(fn, { name, message });
}

describe('public surface', () => {
  it('exports the rating functions', () => {
    assert.deepEqual(Object.keys(api).sort(), ['expectedScore', 'rate']);
  });
});

describe('expectedScore', () => {
  it('is one half for equal ratings', () => {
    assert.equal(expectedScore(1500, 1500), 0.5);
    assert.equal(expectedScore(0, 0), 0.5);
    assert.equal(expectedScore(-40, -40), 0.5);
  });

  it('uses a 400-point gap as ten-to-one odds', () => {
    assert.equal(expectedScore(1400, 1800), 1 / 11);
    assert.equal(expectedScore(1800, 1400), 10 / 11);
  });

  it('sums to one in either direction', () => {
    for (const [left, right] of [
      [1500, 1500],
      [1400, 1600],
      [100, 2000],
      [2400, 2399],
      [-20, 20],
    ]) {
      const sum = expectedScore(left, right) + expectedScore(right, left);
      assert.ok(Math.abs(sum - 1) < 1e-12);
      const match = rate({ rating: left }, { rating: right }, 'draw');
      assert.equal(match.player.expected + match.opponent.expected, 1);
    }
  });

  it('approaches the extremes for a very wide gap', () => {
    assert.equal(expectedScore(0, 200000), 0);
    assert.equal(expectedScore(200000, 0), 1);
    const wide = expectedScore(100, 2000);
    assert.ok(wide > 0);
    assert.ok(wide < 0.0001);
  });
});

describe('equal ratings', () => {
  it('splits a win into 16 points at the default K', () => {
    const result = rate({ rating: 1500 }, { rating: 1500 }, 'win');
    assert.equal(result.player.expected, 0.5);
    assert.equal(result.opponent.expected, 0.5);
    assert.equal(result.player.score, 1);
    assert.equal(result.opponent.score, 0);
    assert.equal(result.player.delta, 16);
    assert.equal(result.opponent.delta, -16);
    assert.equal(result.player.rating, 1516);
    assert.equal(result.opponent.rating, 1484);
  });

  it('leaves both ratings unchanged on a draw', () => {
    const result = rate({ rating: 1500, games: 4 }, { rating: 1500, games: 4 }, 'draw');
    assert.equal(result.player.rating, 1500);
    assert.equal(result.opponent.rating, 1500);
    assert.equal(result.player.delta, 0);
    assert.equal(result.opponent.delta, 0);
    assert.equal(result.player.score, 0.5);
    assert.equal(result.opponent.score, 0.5);
  });

  it('mirrors a loss against a win', () => {
    const loss = rate({ rating: 1500 }, { rating: 1500 }, 'loss');
    assert.equal(loss.player.rating, 1484);
    assert.equal(loss.opponent.rating, 1516);
    assert.equal(loss.player.delta, -16);
    assert.equal(loss.opponent.delta, 16);
  });

  it('matches an explicit K of 32 when K is omitted', () => {
    const implied = rate({ rating: 1510 }, { rating: 1480 }, 'win');
    const explicit = rate({ rating: 1510 }, { rating: 1480 }, 'win', { k: 32 });
    assert.deepEqual(implied, explicit);
  });

  it('rounds a half point away from zero', () => {
    const win = rate({ rating: 1500 }, { rating: 1500 }, 'win', { k: 1 });
    const loss = rate({ rating: 1500 }, { rating: 1500 }, 'loss', { k: 1 });
    assert.equal(win.player.delta, 1);
    assert.equal(win.opponent.delta, -1);
    assert.equal(win.player.rating, 1501);
    assert.equal(win.opponent.rating, 1499);
    assert.equal(loss.player.delta, -1);
    assert.equal(loss.opponent.delta, 1);
  });
});

describe('upsets', () => {
  it('awards more points to an underdog win than to a favorite win', () => {
    const underdog = rate({ rating: 1400 }, { rating: 1600 }, 'win', { k: 32 });
    const favorite = rate({ rating: 1600 }, { rating: 1400 }, 'win', { k: 32 });
    assert.equal(underdog.player.rating, 1424);
    assert.equal(underdog.opponent.rating, 1576);
    assert.equal(underdog.player.delta, 24);
    assert.equal(favorite.player.rating, 1608);
    assert.equal(favorite.opponent.rating, 1392);
    assert.equal(favorite.player.delta, 8);
    assert.ok(underdog.player.delta > favorite.player.delta);
    assert.ok(underdog.player.expected < 0.5);
    assert.ok(favorite.player.expected > 0.5);
  });

  it('moves 29 points for a 400-point upset', () => {
    const upset = rate({ rating: 1400 }, { rating: 1800 }, 'win');
    const expected = rate({ rating: 1800 }, { rating: 1400 }, 'win');
    assert.equal(upset.player.expected, 1 / 11);
    assert.equal(upset.opponent.expected, 10 / 11);
    assert.equal(upset.player.delta, 29);
    assert.equal(upset.player.rating, 1429);
    assert.equal(upset.opponent.rating, 1771);
    assert.equal(expected.player.delta, 3);
    assert.equal(expected.player.rating, 1803);
    assert.equal(expected.opponent.rating, 1397);
  });

  it('does not punish a heavy underdog for a loss that was already expected', () => {
    const result = rate({ rating: 100 }, { rating: 2000 }, 'loss');
    assert.equal(result.player.delta, 0);
    assert.equal(result.opponent.delta, 0);
    assert.equal(result.player.rating, 100);
    assert.equal(result.opponent.rating, 2000);
    assert.equal(result.player.score, 0);
  });
});

describe('draws', () => {
  it('moves points from the higher rating toward the lower one', () => {
    const result = rate({ rating: 1400 }, { rating: 1800 }, 'draw');
    assert.equal(result.player.score, 0.5);
    assert.equal(result.opponent.score, 0.5);
    assert.equal(result.player.delta, 13);
    assert.equal(result.opponent.delta, -13);
    assert.equal(result.player.rating, 1413);
    assert.equal(result.opponent.rating, 1787);
  });

  it('gives a lower-rated player the same gain the favorite would lose', () => {
    const lowFirst = rate({ rating: 1400 }, { rating: 1800 }, 'draw', { k: 24 });
    const highFirst = rate({ rating: 1800 }, { rating: 1400 }, 'draw', { k: 24 });
    assert.equal(lowFirst.player.delta, 10);
    assert.equal(lowFirst.opponent.delta, -10);
    assert.equal(highFirst.player.delta, -10);
    assert.equal(highFirst.opponent.delta, 10);
    assert.equal(lowFirst.player.rating, highFirst.opponent.rating);
    assert.equal(lowFirst.opponent.rating, highFirst.player.rating);
  });
});

describe('floor', () => {
  it('shrinks the transfer so a rating lands on the floor', () => {
    const result = rate({ rating: 110 }, { rating: 110 }, 'loss', {
      k: 32,
      floor: 100,
    });
    assert.equal(result.player.rating, 100);
    assert.equal(result.opponent.rating, 120);
    assert.equal(result.player.delta, -10);
    assert.equal(result.opponent.delta, 10);
    assert.equal(result.player.rating + result.opponent.rating, 220);
  });

  it('keeps an idle floor from changing the update', () => {
    const open = rate({ rating: 1500 }, { rating: 1700 }, 'loss', { k: 20 });
    const floored = rate({ rating: 1500 }, { rating: 1700 }, 'loss', {
      k: 20,
      floor: 100,
    });
    assert.deepEqual(floored, open);
    assert.ok(floored.player.rating > 100);
    assert.ok(floored.opponent.rating > 100);
  });

  it('lifts both ratings to the floor when their sum cannot cover it twice', () => {
    const result = rate({ rating: 40 }, { rating: 50 }, 'draw', { floor: 100 });
    assert.equal(result.player.rating, 100);
    assert.equal(result.opponent.rating, 100);
    assert.equal(result.player.delta, 60);
    assert.equal(result.opponent.delta, 50);
  });

  it('redistributes when one rating already starts below the floor', () => {
    const result = rate({ rating: 90 }, { rating: 110 }, 'win', {
      k: 32,
      floor: 100,
    });
    assert.equal(result.player.rating, 100);
    assert.equal(result.opponent.rating, 100);
    assert.equal(result.player.rating + result.opponent.rating, 200);
  });

  it('accepts a floor of zero and a negative floor', () => {
    const nonNegative = rate({ rating: 5 }, { rating: 5 }, 'loss', {
      k: 32,
      floor: 0,
    });
    assert.equal(nonNegative.player.rating, 0);
    assert.equal(nonNegative.opponent.rating, 10);
    const negativeFloor = rate({ rating: -5 }, { rating: -5 }, 'loss', {
      k: 1,
      floor: -10,
    });
    assert.equal(negativeFloor.player.rating, -6);
    assert.equal(negativeFloor.opponent.rating, -4);
  });

  it('holds the floor across a streak of losses', () => {
    let rating = 120;
    let opponent = 120;
    for (let i = 0; i < 8; i += 1) {
      const result = rate({ rating }, { rating: opponent }, 'loss', {
        k: 32,
        floor: 100,
      });
      rating = result.player.rating;
      opponent = result.opponent.rating;
      assert.ok(rating >= 100);
      assert.ok(opponent >= 100);
      assert.equal(rating + opponent, 240);
    }
    assert.equal(rating, 100);
    assert.equal(opponent, 140);
  });
});

describe('K function', () => {
  it('calls the function with each rating and games played', () => {
    const seen = [];
    const result = rate({ rating: 1500, games: 3 }, { rating: 1700, games: 9 }, 'draw', {
      k(rating, games) {
        seen.push([rating, games]);
        return 20;
      },
    });
    assert.deepEqual(seen, [
      [1500, 3],
      [1700, 9],
    ]);
    assert.equal(result.player.score, 0.5);
  });

  it('passes zero games when the count is omitted', () => {
    const seen = [];
    rate({ rating: 1500 }, { rating: 1700 }, 'win', {
      k(rating, games) {
        seen.push([rating, games]);
        return 32;
      },
    });
    assert.deepEqual(seen, [
      [1500, 0],
      [1700, 0],
    ]);
  });

  it('uses the mean K so a half point rounds away from zero', () => {
    function k(_rating, games) {
      return games < 30 ? 40 : 10;
    }
    const loss = rate({ rating: 1500, games: 10 }, { rating: 1500, games: 40 }, 'loss', {
      k,
    });
    const win = rate({ rating: 1500, games: 10 }, { rating: 1500, games: 40 }, 'win', {
      k,
    });
    assert.equal(loss.player.delta, -13);
    assert.equal(loss.opponent.delta, 13);
    assert.equal(loss.player.rating, 1487);
    assert.equal(loss.opponent.rating, 1513);
    assert.equal(win.player.delta, 13);
    assert.equal(win.opponent.delta, -13);
  });

  it('follows the documented provisional-game example', () => {
    const result = rate({ rating: 1400, games: 12 }, { rating: 1800, games: 80 }, 'win', {
      floor: 100,
      k(rating, games) {
        if (games < 30) {
          return 40;
        }
        if (rating >= 2400) {
          return 10;
        }
        return 20;
      },
    });
    assert.equal(result.player.expected, 1 / 11);
    assert.equal(result.player.rating, 1427);
    assert.equal(result.opponent.rating, 1773);
    assert.equal(result.player.delta, 27);
    assert.equal(result.opponent.delta, -27);
  });

  it('averages a zero K with a positive K', () => {
    const result = rate({ rating: 1500, games: 0 }, { rating: 1500, games: 100 }, 'win', {
      k(_rating, games) {
        return games === 0 ? 0 : 32;
      },
    });
    assert.equal(result.player.delta, 8);
    assert.equal(result.opponent.delta, -8);
    assert.equal(result.player.rating, 1508);
    assert.equal(result.opponent.rating, 1492);
  });

  it('treats a K of zero as no rating movement', () => {
    const result = rate({ rating: 1400 }, { rating: 1800 }, 'win', { k: 0 });
    assert.equal(result.player.rating, 1400);
    assert.equal(result.opponent.rating, 1800);
    assert.equal(result.player.expected, 1 / 11);
    assert.equal(result.player.delta, 0);
  });

  it('reads ratings before either call and does not cache K', () => {
    const player = { rating: 1500, games: 2 };
    const opponent = { rating: 1500, games: 2 };
    let calls = 0;
    const result = rate(player, opponent, 'win', {
      k(rating) {
        calls += 1;
        player.rating = 1;
        opponent.rating = 2;
        return rating === 1500 ? 32 : 1;
      },
    });
    assert.equal(result.player.rating, 1516);
    assert.equal(result.opponent.rating, 1484);
    rate({ rating: 1500 }, { rating: 1500 }, 'draw', {
      k() {
        calls += 1;
        return 10;
      },
    });
    assert.equal(calls, 4);
  });

  it('shrinks a function-derived transfer at the floor', () => {
    const result = rate({ rating: 105, games: 4 }, { rating: 105, games: 80 }, 'loss', {
      floor: 100,
      k(_rating, games) {
        return games < 30 ? 40 : 10;
      },
    });
    assert.equal(result.player.rating, 100);
    assert.equal(result.opponent.rating, 110);
    assert.equal(result.player.delta, -5);
    assert.equal(result.opponent.delta, 5);
  });
});

describe('conservation', () => {
  const matches = [
    [1500, 1500, 'win', 32],
    [1500, 1500, 'draw', 32],
    [1500, 1500, 'loss', 10],
    [1200, 2000, 'win', 40],
    [1200, 2000, 'loss', 40],
    [1200, 2000, 'draw', 16],
    [2400, 2400, 'win', 10],
    [900, 1100, 'win', 32],
    [100, 100, 'loss', 32],
    [0, 0, 'draw', 32],
    [-50, 75, 'win', 20],
    [1499, 1500, 'draw', 32],
    [10, 10, 'loss', 1],
    [1800, 1400, 'win', 24],
    [1600, 1600, 'loss', 0],
  ];

  for (const [left, right, outcome, k] of matches) {
    it(`keeps the sum for ${left} vs ${right} ${outcome} at K ${k}`, () => {
      const result = rate({ rating: left }, { rating: right }, outcome, { k });
      assert.equal(result.player.rating + result.opponent.rating, left + right);
      assert.equal(result.player.delta + result.opponent.delta, 0);
      assert.equal(result.player.score + result.opponent.score, 1);
      assert.equal(result.player.expected + result.opponent.expected, 1);
      assert.equal(Number.isInteger(result.player.delta), true);
      assert.equal(Number.isInteger(result.opponent.delta), true);
    });
  }

  it('keeps the sum for fractional ratings when the values are exact', () => {
    const result = rate({ rating: 10.5 }, { rating: 10.5 }, 'win', { k: 1 });
    assert.equal(result.player.delta, 1);
    assert.equal(result.opponent.delta, -1);
    assert.equal(result.player.rating, 11.5);
    assert.equal(result.opponent.rating, 9.5);
    assert.equal(result.player.rating + result.opponent.rating, 21);
  });

  it('keeps the sum across a series of mixed outcomes', () => {
    let left = 1500;
    let right = 1600;
    const outcomes = ['win', 'win', 'loss', 'draw', 'loss', 'draw', 'win'];
    for (const outcome of outcomes) {
      const result = rate(
        { rating: left, games: 1 },
        { rating: right, games: 2 },
        outcome,
        {
          floor: 100,
          k(rating, games) {
            if (games < 2) {
              return 40;
            }
            return rating >= 2400 ? 10 : 20;
          },
        },
      );
      left = result.player.rating;
      right = result.opponent.rating;
      assert.equal(left + right, 3100);
      assert.ok(left >= 100);
      assert.ok(right >= 100);
    }
  });

  it('mirrors win and loss when the players trade places', () => {
    const cases = [
      [{ rating: 1500 }, { rating: 1500 }, { k: 32 }],
      [{ rating: 1400, games: 3 }, { rating: 1800, games: 50 }, { k: 16 }],
      [{ rating: 110 }, { rating: 130 }, { k: 32, floor: 100 }],
      [
        { rating: 1500, games: 10 },
        { rating: 1500, games: 40 },
        {
          k(_rating, games) {
            return games < 30 ? 40 : 10;
          },
        },
      ],
    ];
    for (const [player, opponent, options] of cases) {
      const win = rate(player, opponent, 'win', options);
      const loss = rate(opponent, player, 'loss', options);
      assert.equal(win.player.rating, loss.opponent.rating);
      assert.equal(win.opponent.rating, loss.player.rating);
      assert.equal(win.player.delta, loss.opponent.delta);
      assert.equal(win.opponent.delta, loss.player.delta);
      assert.ok(Math.abs(win.player.expected - loss.opponent.expected) < 1e-12);
      assert.equal(win.player.expected + win.opponent.expected, 1);
    }
  });
});

describe('invalid input', () => {
  const kMessage =
    /k must be a non-negative finite number or a function that returns one/;

  it('rejects players that are missing or not records', () => {
    throws(
      () => rate(null, { rating: 1 }, 'win'),
      'TypeError',
      /player must be an object/,
    );
    throws(
      () => rate({ rating: 1 }, undefined, 'win'),
      'TypeError',
      /opponent must be an object/,
    );
    throws(() => rate([], { rating: 1 }, 'win'), 'TypeError', /player must be an object/);
    throws(
      () => rate({ rating: 1 }, '1600', 'draw'),
      'TypeError',
      /opponent must be an object/,
    );
    throws(
      () => expectedScore(undefined, 1),
      'TypeError',
      /rating must be a finite number/,
    );
    throws(
      () => expectedScore(1, '2'),
      'TypeError',
      /opponent rating must be a finite number/,
    );
  });

  it('rejects ratings that are not finite numbers', () => {
    for (const rating of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      throws(
        () => rate({ rating }, { rating: 1 }, 'win'),
        'TypeError',
        /player\.rating must be a finite number/,
      );
      throws(
        () => rate({ rating: 1 }, { rating }, 'win'),
        'TypeError',
        /opponent\.rating must be a finite number/,
      );
      throws(
        () => expectedScore(rating, 1),
        'TypeError',
        /rating must be a finite number/,
      );
    }
    throws(
      () => rate({ rating: '1500' }, { rating: 1500 }, 'win'),
      'TypeError',
      /player\.rating must be a finite number/,
    );
    throws(
      () => rate({ rating: true }, { rating: 1500 }, 'loss'),
      'TypeError',
      /player\.rating must be a finite number/,
    );
    throws(
      () => rate({}, { rating: 1500 }, 'draw'),
      'TypeError',
      /player\.rating must be a finite number/,
    );
  });

  it('rejects games that are not a non-negative integer', () => {
    for (const games of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '3',
      null,
      true,
    ]) {
      throws(
        () => rate({ rating: 1, games }, { rating: 1 }, 'win'),
        'TypeError',
        /player\.games must be a non-negative integer/,
      );
    }
    throws(
      () => rate({ rating: 1 }, { rating: 1, games: -2 }, 'draw'),
      'TypeError',
      /opponent\.games must be a non-negative integer/,
    );
  });

  it('rejects outcomes outside win, loss, and draw', () => {
    const bad = ['Win', 'WIN', 'tie', 'draw ', '', '1', null, 1, 0, 0.5, undefined, true];
    for (const outcome of bad) {
      throws(
        () => rate({ rating: 1 }, { rating: 1 }, outcome),
        'TypeError',
        /outcome must be "win", "loss", or "draw"/,
      );
    }
  });

  it('rejects a malformed options object', () => {
    throws(() => rate({ rating: 1 }, { rating: 1 }, 'win', null), 'TypeError', /options/);
    throws(() => rate({ rating: 1 }, { rating: 1 }, 'win', []), 'TypeError', /options/);
    throws(() => rate({ rating: 1 }, { rating: 1 }, 'draw', 'k'), 'TypeError', /options/);
  });

  it('rejects a K that is not a non-negative finite number or a valid function', () => {
    for (const k of [-1, Number.NaN, Number.POSITIVE_INFINITY, '32', null, {}, true]) {
      throws(
        () => rate({ rating: 1 }, { rating: 1 }, 'win', { k }),
        'TypeError',
        kMessage,
      );
    }
    for (const returned of [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '10',
      null,
      undefined,
    ]) {
      throws(
        () =>
          rate({ rating: 1 }, { rating: 1 }, 'win', {
            k() {
              return returned;
            },
          }),
        'TypeError',
        kMessage,
      );
    }
    throws(
      () =>
        rate({ rating: 1500, games: 1 }, { rating: 1500, games: 2 }, 'draw', {
          k(_rating, games) {
            return games === 1 ? 20 : -5;
          },
        }),
      'TypeError',
      kMessage,
    );
  });

  it('rejects a floor that is not a finite number', () => {
    for (const floor of [Number.NaN, Number.POSITIVE_INFINITY, '100', null, true]) {
      throws(
        () => rate({ rating: 1 }, { rating: 1 }, 'win', { floor }),
        'TypeError',
        /floor must be a finite number/,
      );
    }
  });

  it('rejects a point change that overflows', () => {
    throws(
      () => rate({ rating: 1500 }, { rating: 1500 }, 'win', { k: Number.MAX_VALUE }),
      'RangeError',
      /rating change is not finite/,
    );
  });
});

describe('purity', () => {
  it('does not modify the arguments', () => {
    const player = { rating: 1500, games: 3 };
    const opponent = { rating: 1600, games: 9 };
    const options = {
      k: 24,
      floor: 100,
    };
    const playerCopy = { ...player };
    const opponentCopy = { ...opponent };
    const optionsCopy = { ...options };
    rate(player, opponent, 'win', options);
    assert.deepEqual(player, playerCopy);
    assert.deepEqual(opponent, opponentCopy);
    assert.deepEqual(options, optionsCopy);
  });

  it('returns a fresh object on every call', () => {
    const first = rate({ rating: 1500 }, { rating: 1500 }, 'draw');
    const second = rate({ rating: 1500 }, { rating: 1500 }, 'draw');
    assert.notEqual(first, second);
    assert.notEqual(first.player, second.player);
    assert.deepEqual(first, second);
    first.player.rating = 0;
    assert.equal(second.player.rating, 1500);
  });

  it('accepts records created without a prototype', () => {
    const player = Object.create(null);
    player.rating = 1500;
    player.games = 0;
    const opponent = Object.create(null);
    opponent.rating = 1500;
    const result = rate(player, opponent, 'draw');
    assert.equal(result.player.rating, 1500);
    assert.equal(result.opponent.rating, 1500);
  });
});
