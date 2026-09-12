interface ReconcilableItem {
    id: string;
    playlistItemId?: string;
}

/**
 * Merge the server's current track list into the in-progress edit buffer.
 *
 * Edit mode snapshots the track list once, with nothing syncing later server state into it. Since
 * Save and Replace posts that buffer as a full replacement, leaving edit mode open while tracks
 * were added to the same playlist from anywhere else meant the save silently removed them.
 *
 * Resolution rules:
 * - the local order wins for tracks the server still has (that is what the user is editing),
 * - tracks removed on the server disappear,
 * - tracks added on the server land at the end, in server order,
 * - duplicates are paired by count, not collapsed.
 *
 * Buckets are keyed on `id` and never on `playlistItemId`, because Subsonic sets playlistItemId
 * to a positional index, which changes on every reorder. Within a bucket the entry whose
 * playlistItemId matches is preferred, which keeps duplicate copies stable on Navidrome and
 * Jellyfin and is simply inert on Subsonic.
 */
export function reconcilePlaylistEditItems<T extends ReconcilableItem>(
    localItems: readonly T[],
    serverItems: readonly T[],
): T[] {
    // Bucket INDICES rather than items: an array can legitimately hold the same object reference
    // twice, and a Set of references would then consume both at once.
    const buckets = new Map<string, number[]>();

    serverItems.forEach((item, index) => {
        const bucket = buckets.get(item.id);
        if (bucket) {
            bucket.push(index);
        } else {
            buckets.set(item.id, [index]);
        }
    });

    const consumed = new Set<number>();
    const result: T[] = [];

    for (const localItem of localItems) {
        const bucket = buckets.get(localItem.id);

        if (!bucket || bucket.length === 0) {
            // Removed on the server since the snapshot.
            continue;
        }

        const preferred = localItem.playlistItemId
            ? bucket.findIndex(
                  (index) => serverItems[index].playlistItemId === localItem.playlistItemId,
              )
            : -1;
        const take = preferred === -1 ? 0 : preferred;
        const [serverIndex] = bucket.splice(take, 1);

        consumed.add(serverIndex);
        result.push(serverItems[serverIndex]);
    }

    serverItems.forEach((item, index) => {
        if (!consumed.has(index)) {
            result.push(item);
        }
    });

    return result;
}
