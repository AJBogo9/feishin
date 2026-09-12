import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { reconcilePlaylistEditItems } from './reconcile-playlist-edit-items.ts';

const item = (id: string, playlistItemId?: string) => ({ id, playlistItemId });
const ids = (items: { id: string }[]) => items.map((entry) => entry.id);

describe('reconcilePlaylistEditItems', () => {
    it('keeps the local order when nothing changed on the server', () => {
        const local = [item('c'), item('a'), item('b')];
        const server = [item('a'), item('b'), item('c')];

        assert.deepEqual(ids(reconcilePlaylistEditItems(local, server)), ['c', 'a', 'b']);
    });

    it('appends tracks added on the server instead of dropping them', () => {
        // The bug: Save and Replace posted the stale buffer, removing these from the playlist.
        const local = [item('a'), item('b')];
        const server = [item('a'), item('b'), item('c'), item('d')];

        assert.deepEqual(ids(reconcilePlaylistEditItems(local, server)), ['a', 'b', 'c', 'd']);
    });

    it('appends server additions in server order after a local reorder', () => {
        const local = [item('b'), item('a')];
        const server = [item('a'), item('b'), item('new')];

        assert.deepEqual(ids(reconcilePlaylistEditItems(local, server)), ['b', 'a', 'new']);
    });

    it('drops tracks removed on the server', () => {
        const local = [item('a'), item('b'), item('c')];
        const server = [item('a'), item('c')];

        assert.deepEqual(ids(reconcilePlaylistEditItems(local, server)), ['a', 'c']);
    });

    it('pairs duplicates by count rather than collapsing them', () => {
        const local = [item('a'), item('a'), item('b')];
        const server = [item('a'), item('b'), item('a')];

        assert.deepEqual(ids(reconcilePlaylistEditItems(local, server)), ['a', 'a', 'b']);
    });

    it('keeps a server-side extra copy of a duplicated track', () => {
        const local = [item('a'), item('b')];
        const server = [item('a'), item('a'), item('b')];

        assert.deepEqual(ids(reconcilePlaylistEditItems(local, server)), ['a', 'b', 'a']);
    });

    it('drops a copy when the server removed one of a duplicated pair', () => {
        const local = [item('a'), item('a'), item('b')];
        const server = [item('a'), item('b')];

        assert.deepEqual(ids(reconcilePlaylistEditItems(local, server)), ['a', 'b']);
    });

    it('prefers the server entry with the matching playlistItemId', () => {
        const local = [item('a', 'p2'), item('a', 'p1')];
        const server = [item('a', 'p1'), item('a', 'p2')];

        assert.deepEqual(
            reconcilePlaylistEditItems(local, server).map((entry) => entry.playlistItemId),
            ['p2', 'p1'],
        );
    });

    it('handles repeated object references without consuming both at once', () => {
        const shared = item('a');
        const server = [shared, shared];

        assert.deepEqual(ids(reconcilePlaylistEditItems([shared], server)), ['a', 'a']);
    });

    it('returns the server list when the local buffer is empty', () => {
        const server = [item('a'), item('b')];
        assert.deepEqual(ids(reconcilePlaylistEditItems([], server)), ['a', 'b']);
    });

    it('returns nothing when the server list is empty', () => {
        assert.deepEqual(reconcilePlaylistEditItems([item('a')], []), []);
    });

    it('returns the server objects, not the stale local ones', () => {
        const local = [item('a')];
        const server = [item('a')];

        assert.equal(reconcilePlaylistEditItems(local, server)[0], server[0]);
    });
});
