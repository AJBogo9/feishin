/**
 * Pure queue-removal helpers. Kept free of aliases, enums and store imports so the unit test
 * can load it directly through Node's test runner, the same way mpv-lifecycle.ts is split out.
 */

export interface RemovalSuccessor {
    /** True when the track that was playing is among the removed ids. */
    currentRemoved: boolean;
    /** The id that should play next, or undefined when nothing is left to play. */
    successor: string | undefined;
}

/**
 * Decide which track should take over when a selection is removed from the queue.
 *
 * `playOrder` must be in PLAY order (shuffled order when shuffle is on) and `currentIndex` a
 * position within it, because that is the space `player.index` lives in. Holes are tolerated:
 * a shuffled array can reference a position that no longer exists.
 *
 * When the playing track is removed, the next surviving track after it wins; at the end of the
 * queue we clamp backwards instead. Only when nothing survives is `successor` undefined.
 */
export function resolveRemovalSuccessor(
    playOrder: (string | undefined)[],
    currentIndex: number,
    removed: ReadonlySet<string>,
): RemovalSuccessor {
    const currentId = currentIndex >= 0 ? playOrder[currentIndex] : undefined;

    if (currentId === undefined || !removed.has(currentId)) {
        return { currentRemoved: false, successor: undefined };
    }

    for (let i = currentIndex + 1; i < playOrder.length; i += 1) {
        const id = playOrder[i];
        if (id !== undefined && !removed.has(id)) {
            return { currentRemoved: true, successor: id };
        }
    }

    for (let i = currentIndex - 1; i >= 0; i -= 1) {
        const id = playOrder[i];
        if (id !== undefined && !removed.has(id)) {
            return { currentRemoved: true, successor: id };
        }
    }

    return { currentRemoved: true, successor: undefined };
}
