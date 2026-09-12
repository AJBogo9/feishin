import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveRemovalSuccessor } from './queue-removal.ts';

const set = (...ids: string[]) => new Set(ids);

describe('resolveRemovalSuccessor', () => {
    it('reports nothing when the playing track survives', () => {
        const result = resolveRemovalSuccessor(['a', 'b', 'c'], 1, set('a', 'c'));

        assert.deepEqual(result, { currentRemoved: false, successor: undefined });
    });

    it('hands over to the next surviving track', () => {
        const result = resolveRemovalSuccessor(['a', 'b', 'c', 'd'], 1, set('b'));

        assert.deepEqual(result, { currentRemoved: true, successor: 'c' });
    });

    it('skips over other removed tracks to find the successor', () => {
        const result = resolveRemovalSuccessor(['a', 'b', 'c', 'd'], 1, set('b', 'c'));

        assert.deepEqual(result, { currentRemoved: true, successor: 'd' });
    });

    it('clamps backwards when the playing track was last', () => {
        const result = resolveRemovalSuccessor(['a', 'b', 'c'], 2, set('c'));

        assert.deepEqual(result, { currentRemoved: true, successor: 'b' });
    });

    it('returns no successor when the whole queue is removed', () => {
        const result = resolveRemovalSuccessor(['a', 'b'], 0, set('a', 'b'));

        assert.deepEqual(result, { currentRemoved: true, successor: undefined });
    });

    it('tolerates holes left by a stale shuffled permutation', () => {
        const result = resolveRemovalSuccessor(['a', undefined, 'c'], 0, set('a'));

        assert.deepEqual(result, { currentRemoved: true, successor: 'c' });
    });

    it('treats an unset player index as nothing playing', () => {
        const result = resolveRemovalSuccessor(['a', 'b'], -1, set('a'));

        assert.deepEqual(result, { currentRemoved: false, successor: undefined });
    });

    it('works in shuffled play order, not queue order', () => {
        // queue.default is [a,b,c,d]; shuffled order plays c,a,d,b and c is playing.
        const result = resolveRemovalSuccessor(['c', 'a', 'd', 'b'], 0, set('c'));

        assert.deepEqual(result, { currentRemoved: true, successor: 'a' });
    });
});
