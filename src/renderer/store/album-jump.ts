/**
 * Album-jump search, in QUEUE-INDEX space.
 *
 * Every function here indexes the default queue order, never the shuffled playback order. The
 * caller is responsible for converting `player.index` into a queue index before calling, and for
 * converting the result back. Keeping the search in one coordinate system is the whole point: the
 * bug this module replaces read the default queue with a shuffled position and wrote a default
 * queue index back into `player.index`.
 *
 * Unlike `mapShuffledToQueueIndex`, a miss here returns -1 rather than falling back to identity.
 * An album jump with no answer should leave the caller's already-computed target alone, not
 * silently land on an unrelated track.
 */

/** Index range [start, end] of the trailing run of tracks sharing the last album id. */
export function findLastAlbumRange(albumIds: (string | undefined)[]): [number, number] {
    const rangeEnd = albumIds.length - 1;

    if (rangeEnd < 0) {
        return [0, -1];
    }

    const lastAlbumId = albumIds[rangeEnd];
    let rangeStart = rangeEnd;

    for (let index = rangeEnd; index > -1; index--) {
        rangeStart = index;
        if (albumIds[index] !== lastAlbumId) {
            break;
        }
    }

    // The loop leaves `rangeStart` on the first non-matching track, except when the run reaches
    // the start of the queue, where index 0 is itself part of the run.
    return [albumIds[rangeStart] === lastAlbumId ? rangeStart : rangeStart + 1, rangeEnd];
}

/**
 * First track of the next album, or -1 when the queue holds only one album.
 * Wraps to the first differing album when the current track is inside the trailing album run.
 */
export function findNextAlbumIndex(
    albumIds: (string | undefined)[],
    currentQueueIndex: number,
): number {
    if (currentQueueIndex < 0 || currentQueueIndex >= albumIds.length) {
        return -1;
    }

    const currentAlbumId = albumIds[currentQueueIndex];
    const [start, end] = findLastAlbumRange(albumIds);
    const isOnLastAlbum = start <= currentQueueIndex && currentQueueIndex <= end;

    if (isOnLastAlbum) {
        return albumIds.findIndex((albumId) => albumId !== currentAlbumId);
    }

    for (let index = currentQueueIndex; index < albumIds.length; index++) {
        if (albumIds[index] !== currentAlbumId) {
            return index;
        }
    }

    return -1;
}

/**
 * First track of the album immediately before the current one, or -1 when there is none.
 * Note this returns the START of that album, so a second press steps back a whole album.
 */
export function findPreviousAlbumIndex(
    albumIds: (string | undefined)[],
    currentQueueIndex: number,
): number {
    if (currentQueueIndex <= 0 || currentQueueIndex >= albumIds.length) {
        return -1;
    }

    const currentAlbumId = albumIds[currentQueueIndex];
    let previousAlbumId: string | undefined;
    let hasPrevious = false;

    for (let index = currentQueueIndex - 1; index > -1; index--) {
        if (albumIds[index] !== currentAlbumId) {
            previousAlbumId = albumIds[index];
            hasPrevious = true;
            break;
        }
    }

    // Deliberately a flag rather than a truthiness check: an empty-string album id is a real
    // grouping, and the old truthiness gate made those tracks unreachable.
    if (!hasPrevious) {
        return -1;
    }

    let prevIndex = -1;

    for (let index = currentQueueIndex - 1; index > -1; index--) {
        if (albumIds[index] === previousAlbumId) {
            prevIndex = index;
        } else if (prevIndex > -1) {
            break;
        }
    }

    return prevIndex;
}
