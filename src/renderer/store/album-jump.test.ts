import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findLastAlbumRange, findNextAlbumIndex, findPreviousAlbumIndex } from './album-jump.ts';

// Queue shape used throughout: three albums, unequal run lengths.
//            0    1    2    3    4    5
const QUEUE = ['a', 'a', 'b', 'b', 'b', 'c'];

describe('findLastAlbumRange', () => {
    it('finds the trailing run of one track', () => {
        assert.deepEqual(findLastAlbumRange(QUEUE), [5, 5]);
    });

    it('finds a trailing run of several tracks', () => {
        assert.deepEqual(findLastAlbumRange(['a', 'b', 'b', 'b']), [1, 3]);
    });

    it('covers the whole queue when there is only one album', () => {
        assert.deepEqual(findLastAlbumRange(['a', 'a', 'a']), [0, 2]);
    });

    it('handles a single track', () => {
        assert.deepEqual(findLastAlbumRange(['a']), [0, 0]);
    });

    it('handles an empty queue without pointing at a track', () => {
        const [start, end] = findLastAlbumRange([]);
        assert.equal(start > end, true);
    });
});

describe('findNextAlbumIndex', () => {
    it('jumps to the first track of the following album', () => {
        assert.equal(findNextAlbumIndex(QUEUE, 0), 2);
        assert.equal(findNextAlbumIndex(QUEUE, 1), 2);
    });

    it('jumps from mid-album to the next album', () => {
        assert.equal(findNextAlbumIndex(QUEUE, 3), 5);
    });

    it('wraps to the first album when already on the last one', () => {
        assert.equal(findNextAlbumIndex(QUEUE, 5), 0);
    });

    it('reports no target for a single-album queue instead of returning -1 as an index', () => {
        // This is the blank-player case: the old code wrote findIndex's -1 straight into
        // player.index, leaving getCurrentSong undefined.
        assert.equal(findNextAlbumIndex(['a', 'a', 'a'], 1), -1);
    });

    it('rejects an out-of-range position rather than guessing', () => {
        assert.equal(findNextAlbumIndex(QUEUE, -1), -1);
        assert.equal(findNextAlbumIndex(QUEUE, 99), -1);
        assert.equal(findNextAlbumIndex([], 0), -1);
    });

    it('treats an empty-string album id as a real album', () => {
        assert.equal(findNextAlbumIndex(['', '', 'b'], 0), 2);
    });
});

describe('findPreviousAlbumIndex', () => {
    it('jumps to the START of the previous album, not its last track', () => {
        assert.equal(findPreviousAlbumIndex(QUEUE, 5), 2);
        assert.equal(findPreviousAlbumIndex(QUEUE, 2), 0);
    });

    it('jumps to the previous album from mid-album', () => {
        assert.equal(findPreviousAlbumIndex(QUEUE, 4), 0);
    });

    it('reports no target when already on the first album', () => {
        assert.equal(findPreviousAlbumIndex(QUEUE, 0), -1);
        assert.equal(findPreviousAlbumIndex(QUEUE, 1), -1);
    });

    it('reports no target for a single-album queue', () => {
        assert.equal(findPreviousAlbumIndex(['a', 'a', 'a'], 2), -1);
    });

    it('rejects an out-of-range position', () => {
        assert.equal(findPreviousAlbumIndex(QUEUE, -1), -1);
        assert.equal(findPreviousAlbumIndex(QUEUE, 99), -1);
    });

    it('treats an empty-string album id as a real album', () => {
        assert.equal(findPreviousAlbumIndex(['', '', 'b'], 2), 0);
    });

    it('steps back one album at a time across three albums', () => {
        assert.equal(findPreviousAlbumIndex(QUEUE, 5), 2);
        assert.equal(findPreviousAlbumIndex(QUEUE, 2), 0);
    });
});
