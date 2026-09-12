import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getPlaylistRowId, reorderPlaylistItems } from './playlist-reorder.ts';

const row = (playlistItemId: string, id = playlistItemId) => ({ id, playlistItemId });
const ids = (items: { playlistItemId?: string }[]) => items.map((i) => i.playlistItemId);

describe('getPlaylistRowId', () => {
    it('prefers the playlist row id over the track id', () => {
        assert.equal(getPlaylistRowId({ id: 'track', playlistItemId: 'row' }), 'row');
    });

    it('falls back to the track id when there is no row id', () => {
        assert.equal(getPlaylistRowId({ id: 'track' }), 'track');
    });
});

describe('reorderPlaylistItems', () => {
    const items = [row('a'), row('b'), row('c'), row('d')];

    it('moves a row above the target', () => {
        const result = reorderPlaylistItems(items, {
            edge: 'top',
            sourceIds: ['d'],
            targetId: 'b',
        });

        assert.deepEqual(ids(result), ['a', 'd', 'b', 'c']);
    });

    it('moves a row below the target', () => {
        const result = reorderPlaylistItems(items, {
            edge: 'bottom',
            sourceIds: ['a'],
            targetId: 'c',
        });

        assert.deepEqual(ids(result), ['b', 'c', 'a', 'd']);
    });

    it('moves a multi-row selection and keeps its order', () => {
        const result = reorderPlaylistItems(items, {
            edge: 'top',
            sourceIds: ['a', 'b'],
            targetId: 'd',
        });

        assert.deepEqual(ids(result), ['c', 'a', 'b', 'd']);
    });

    it('is a no-op with no edge', () => {
        const result = reorderPlaylistItems(items, {
            edge: null,
            sourceIds: ['a'],
            targetId: 'b',
        });

        assert.deepEqual(ids(result), ['a', 'b', 'c', 'd']);
    });

    it('is a no-op when the target is not in the list', () => {
        const result = reorderPlaylistItems(items, {
            edge: 'top',
            sourceIds: ['a'],
            targetId: 'nope',
        });

        assert.deepEqual(ids(result), ['a', 'b', 'c', 'd']);
    });

    it('keeps both copies of a duplicated track', () => {
        // Same track twice: distinct row ids, identical track id. This is the case that
        // used to collapse the two rows into one and lose a track.
        const withDupe = [row('r1', 'song'), row('r2', 'other'), row('r3', 'song')];

        const result = reorderPlaylistItems(withDupe, {
            edge: 'bottom',
            sourceIds: ['r1'],
            targetId: 'r3',
        });

        assert.equal(result.length, 3, 'no row may be dropped');
        assert.deepEqual(ids(result), ['r2', 'r3', 'r1']);
    });

    it('never drops rows, even when given ambiguous track ids', () => {
        const withDupe = [row('r1', 'song'), row('r2', 'other'), row('r3', 'song')];

        // 'song' matches no row id, so this is refused rather than applied destructively.
        const result = reorderPlaylistItems(withDupe, {
            edge: 'top',
            sourceIds: ['song'],
            targetId: 'r2',
        });

        assert.equal(result.length, withDupe.length);
    });

    it('preserves row count for every single-row move', () => {
        for (const source of ['a', 'b', 'c', 'd']) {
            for (const target of ['a', 'b', 'c', 'd']) {
                for (const edge of ['top', 'bottom'] as const) {
                    const result = reorderPlaylistItems(items, {
                        edge,
                        sourceIds: [source],
                        targetId: target,
                    });

                    assert.equal(
                        result.length,
                        items.length,
                        `${source} -> ${edge} of ${target} changed the row count`,
                    );
                    assert.deepEqual(
                        [...ids(result)].sort(),
                        ['a', 'b', 'c', 'd'],
                        `${source} -> ${edge} of ${target} lost or duplicated a row`,
                    );
                }
            }
        }
    });
});
