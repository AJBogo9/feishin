import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSameEntryDocument } from './navigation.ts';

const ENTRY = 'file:///opt/feishin/resources/app.asar/out/renderer/index.html';

describe('isSameEntryDocument', () => {
    it('allows navigating to the identical URL', () => {
        assert.equal(isSameEntryDocument(ENTRY, ENTRY), true);
    });

    it('allows an in-app hash route change', () => {
        assert.equal(isSameEntryDocument(ENTRY, `${ENTRY}#/playlists`), true);
        assert.equal(isSameEntryDocument(`${ENTRY}#/home`, `${ENTRY}#/settings`), true);
    });

    it('allows a query-string change, which is what a reload looks like', () => {
        assert.equal(isSameEntryDocument(ENTRY, `${ENTRY}?t=123`), true);
    });

    it('blocks a dropped audio file, the bug this guards', () => {
        // Both sides have origin "null" under file://, so pathname is what decides.
        assert.equal(isSameEntryDocument(ENTRY, 'file:///home/user/Music/song.mp3'), false);
    });

    it('blocks navigating to an external site', () => {
        assert.equal(isSameEntryDocument(ENTRY, 'https://example.com'), false);
    });

    it('blocks a data: URL', () => {
        assert.equal(isSameEntryDocument(ENTRY, 'data:text/html,x'), false);
    });

    it('blocks an unparseable or empty target without throwing', () => {
        assert.doesNotThrow(() => isSameEntryDocument(ENTRY, ''));
        assert.equal(isSameEntryDocument(ENTRY, ''), false);
        assert.equal(isSameEntryDocument(ENTRY, 'not a url'), false);
    });

    it('blocks when the current URL is unparseable', () => {
        assert.equal(isSameEntryDocument('', ENTRY), false);
    });

    it('allows the dev server reloading its own entry point', () => {
        assert.equal(
            isSameEntryDocument(
                'http://localhost:5173/index.html',
                'http://localhost:5173/index.html?x=1',
            ),
            true,
        );
    });

    it('blocks a different origin on the same pathname', () => {
        assert.equal(
            isSameEntryDocument('http://localhost:5173/index.html', 'http://evil.test/index.html'),
            false,
        );
    });
});
