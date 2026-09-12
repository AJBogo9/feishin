import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSeek } from './seek-detect.ts';

const THRESHOLD = 500;

describe('isSeek', () => {
    it('does not fire on a normal poll that arrives exactly on time', () => {
        assert.equal(isSeek(500, 500, THRESHOLD), false);
    });

    it('does not fire on a late poll, which is what the raw-delta test got wrong', () => {
        // The 500 ms mpv poll plus timer lateness used to cross a bare `delta > 500` bound on
        // roughly half of all samples, forcing a full reset about twice a second.
        assert.equal(isSeek(505, 505, THRESHOLD), false);
        assert.equal(isSeek(620, 620, THRESHOLD), false);
        assert.equal(isSeek(1000, 1000, THRESHOLD), false);
    });

    it('does not fire when the window was throttled and samples bunched up', () => {
        assert.equal(isSeek(4000, 4000, THRESHOLD), false);
    });

    it('fires on a real forward seek', () => {
        assert.equal(isSeek(5000, 16, THRESHOLD), true);
    });

    it('fires on a real backward seek', () => {
        assert.equal(isSeek(-30000, 500, THRESHOLD), true);
    });

    it('fires when playback stalls but wall clock advances', () => {
        assert.equal(isSeek(0, 5000, THRESHOLD), true);
    });

    it('respects the threshold boundary exactly', () => {
        assert.equal(isSeek(1000, 500, THRESHOLD), false);
        assert.equal(isSeek(1001, 500, THRESHOLD), true);
    });

    it('never fires on non-finite input', () => {
        assert.equal(isSeek(NaN, 500, THRESHOLD), false);
        assert.equal(isSeek(500, NaN, THRESHOLD), false);
        assert.equal(isSeek(Infinity, 500, THRESHOLD), false);
    });
});
