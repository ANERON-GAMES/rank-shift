# @aneron/rank-shift

Elo-style rating updates for a two-player match.

## Purpose

`@aneron/rank-shift` turns two ratings and a match outcome into expected scores and new ratings. The update follows the Elo logistic. The K factor can be a fixed number or a function of rating and games played. An optional floor keeps a rating from ending below a chosen value. Point changes are integers, and a two-player match moves the same number of points from one rating to the other whenever the ratings can still meet the floor.

The package has no runtime dependencies.

## Install

```bash
npm install @aneron/rank-shift
```

The package is ESM and runs on Node 20 and Node 22.

## Usage

```js
import { expectedScore, rate } from '@aneron/rank-shift';

const even = rate({ rating: 1500 }, { rating: 1500 }, 'win');

const upset = rate({ rating: 1400, games: 12 }, { rating: 1800, games: 80 }, 'win', {
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

expectedScore(1400, 1800);
```

`even` is a win between equal ratings at the default K of 32:

```text
even.player.rating      1516
even.player.expected    0.5
even.player.score       1
even.player.delta       16
even.opponent.rating    1484
even.opponent.delta     -16
```

`upset` is a win by the lower rating. That player has fewer than 30 games, so the K function returns 40 and 20. The match uses the mean, 30:

```text
upset.player.rating     1427
upset.player.expected   0.09090909090909091
upset.player.score      1
upset.player.delta      27
upset.opponent.rating   1773
upset.opponent.delta    -27
```

## API

### `expectedScore(rating, opponentRating)`

Returns the expected score for `rating` against `opponentRating`, in the range 0 to 1.

```text
1 / (1 + 10 ** ((opponentRating - rating) / 400))
```

Throws `TypeError` if either argument is not a finite number.

### `rate(player, opponent, outcome, options?)`

Computes expected scores and updated ratings for one match. `outcome` is from the first player's point of view.

`player` and `opponent` are objects:

| Field    | Required | Meaning                                               |
| -------- | -------- | ----------------------------------------------------- |
| `rating` | yes      | Finite number.                                        |
| `games`  | no       | Non-negative integer. Omitted games are treated as 0. |

`outcome` is `'win'`, `'loss'`, or `'draw'`. The actual scores are 1, 0.5, and 0.

`options`:

| Field   | Default | Meaning                                                     |
| ------- | ------- | ----------------------------------------------------------- |
| `k`     | `32`    | Non-negative finite number, or `(rating, games) => number`. |
| `floor` | none    | Finite number. Updated ratings do not end below it.         |

A K function is called once for each player, in player then opponent order, as `k(rating, games)`.

The return value:

```text
{
  player: { rating, expected, score, delta },
  opponent: { rating, expected, score, delta }
}
```

`rating` is the updated rating. `expected` is the expected score before the result. `score` is the actual score. `delta` is the updated rating minus the input rating.

Throws `TypeError` when a player, outcome, K, floor, or options value is invalid. Throws `RangeError` when the point change is not finite.

## Design notes

The logistic uses a 400-point scale: a rating that is 400 points higher is expected to score 10 / 11.

The raw change is `((kPlayer + kOpponent) / 2) * (score - expected)`. That value is rounded half away from zero to an integer. The first rating gains the integer and the second rating loses it. 12.5 rounds to 13, and -12.5 rounds to -13. Rounding one transfer, instead of rounding each new rating on its own, keeps the sum of the two ratings unchanged for safe-integer inputs.

When both players resolve to the same K, the mean is that K, which is the usual `K * (score - expected)` update. When the function returns two different values, the mean is what lets one shared transfer stand in for both players.

If `floor` is set and the transfer would put a rating below it, the transfer shrinks until that rating lands on the floor. The other rating changes by the same smaller amount, so the sum stays the same when it is at least twice the floor. If the sum is lower than twice the floor, both results are the floor: no pair on the floor can add up to the previous total.

Ratings and games are read before either K function runs. The objects passed in are not modified. Calls do not share saved results.

## License

Released under the MIT License.

Copyright (c) 2026 Vadim Gubin
