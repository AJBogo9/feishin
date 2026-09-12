import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shuffledIndexesAnchoredAt, shuffledInsertPosition } from './shuffle.ts';

describe('shuffledIndexesAnchoredAt', () => {
    it('puts the anchor first and keeps a complete permutation', () => {
        const result = shuffledIndexesAnchoredAt(6, 4);

        assert.equal(result[0], 4);
        assert.equal(result.length, 6);
        assert.deepEqual(
            [...result].sort((a, b) => a - b),
            [0, 1, 2, 3, 4, 5],
        );
    });

    it('still returns a complete permutation when the anchor is out of range', () => {
        for (const anchor of [-1, 6, 99]) {
            const result = shuffledIndexesAnchoredAt(6, anchor);

            assert.equal(result.length, 6);
            assert.deepEqual(
                [...result].sort((a, b) => a - b),
                [0, 1, 2, 3, 4, 5],
            );
        }
    });

    it('handles an empty queue', () => {
        assert.deepEqual(shuffledIndexesAnchoredAt(0, 0), []);
    });
});

describe('shuffledInsertPosition', () => {
    it('translates a shuffled position into the queue position after it', () => {
        // player.index 1 -> shuffled[1] === 3 -> insert at 4
        assert.equal(shuffledInsertPosition(1, [2, 3, 0, 1], 4), 4);
    });

    it('never produces NaN when the index is out of range', () => {
        for (const idx of [-1, 4, 99]) {
            const result = shuffledInsertPosition(idx, [2, 3, 0, 1], 4);

            assert.ok(Number.isInteger(result), `expected an integer, got ${result}`);
            assert.ok(result >= 0 && result <= 4, `expected 0..4, got ${result}`);
        }
    });

    it('never produces NaN when shuffled is empty', () => {
        const result = shuffledInsertPosition(0, [], 3);

        assert.ok(Number.isInteger(result));
        assert.equal(result, 1);
    });

    it('clamps to the end of the queue', () => {
        assert.equal(shuffledInsertPosition(0, [9], 3), 3);
    });

    it('clamps to zero rather than going negative', () => {
        assert.equal(shuffledInsertPosition(-5, [], 3), 0);
    });
});
