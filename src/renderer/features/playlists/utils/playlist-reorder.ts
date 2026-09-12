import type { Song } from '/@/shared/types/domain-types';

export interface PlaylistReorderPayload {
    edge: 'bottom' | 'top' | null;
    sourceIds: string[];
    targetId: string;
}

/** Minimal shape needed to identify a playlist row. */
type PlaylistRow = Pick<Song, 'id' | 'playlistItemId'>;

/**
 * Identity of a playlist ROW, not of the track.
 *
 * A playlist can contain the same track twice, so `Song.id` is not unique within one playlist.
 * `playlistItemId` is. This is the same rule the playlist table uses for its React keys
 * (playlist-detail-song-list-table.tsx), and reorder has to agree with it or rows collapse.
 */
export const getPlaylistRowId = (item: PlaylistRow): string => item.playlistItemId || item.id;

/**
 * Move `sourceIds` next to `targetId`, preserving every other row's order.
 *
 * Ids may be row ids or, on the drag path, track ids. Either way the result is only accepted
 * when it still contains exactly as many rows as it started with, so a reorder can never
 * silently drop tracks from the playlist; in the ambiguous case it is refused instead.
 */
export const reorderPlaylistItems = <T extends PlaylistRow>(
    items: T[],
    payload: PlaylistReorderPayload,
): T[] => {
    if (!payload.edge) {
        return items;
    }

    const rowIds = items.map(getPlaylistRowId);
    const targetIndex = rowIds.indexOf(payload.targetId);

    if (targetIndex === -1) {
        return items;
    }

    const sourceIds = new Set(payload.sourceIds);
    const remaining = rowIds.filter((id) => !sourceIds.has(id));

    const sourcesBeforeTarget = rowIds.filter(
        (id, index) => sourceIds.has(id) && index < targetIndex,
    ).length;

    const insertIndexRaw =
        payload.edge === 'top'
            ? targetIndex - sourcesBeforeTarget
            : targetIndex - sourcesBeforeTarget + 1;
    const insertIndex = Math.max(0, Math.min(insertIndexRaw, remaining.length));

    const movedIds = rowIds.filter((id) => sourceIds.has(id));
    const reorderedIds = [
        ...remaining.slice(0, insertIndex),
        ...movedIds,
        ...remaining.slice(insertIndex),
    ];

    const itemsByRowId = new Map(items.map((item) => [getPlaylistRowId(item), item]));
    const reordered = reorderedIds
        .map((id) => itemsByRowId.get(id))
        .filter((item): item is T => item !== undefined);

    // Refuse rather than lose rows. Duplicate track ids on the drag path can otherwise
    // collapse two rows into one.
    if (reordered.length !== items.length) {
        return items;
    }

    return reordered;
};
