export function shuffle<T>(array: T[]): T[] {
    return shuffleInPlace(array.slice());
}

/**
 * Random permutation of [0, length) with `anchorIndex` placed first, so a caller that
 * regenerates the shuffle order mid-playback can keep the playing track as position 0
 * and leave the rest of the queue upcoming. Falls back to a plain shuffle when the
 * anchor is out of range.
 */
export function shuffledIndexesAnchoredAt(length: number, anchorIndex: number): number[] {
    const indexes = Array.from({ length }, (_, i) => i);

    if (anchorIndex < 0 || anchorIndex >= length) {
        return shuffleInPlace(indexes);
    }

    return [anchorIndex, ...shuffleInPlace(indexes.filter((i) => i !== anchorIndex))];
}

/**
 * Queue position to insert directly after the playing track.
 *
 * `playerIndex` is a position in `shuffled` when shuffle is on, so it has to be translated
 * back to a queue position. Reading `shuffled[playerIndex]` unguarded yields `undefined + 1`
 * = NaN whenever the index is out of range, and `slice(0, NaN)` silently empties the queue.
 */
export function shuffledInsertPosition(
    playerIndex: number,
    shuffled: number[],
    queueLength: number,
): number {
    const base =
        playerIndex >= 0 && playerIndex < shuffled.length ? shuffled[playerIndex] : playerIndex;

    return Math.min(Math.max(base + 1, 0), queueLength);
}

export function shuffleInPlace<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(cryptoRandom() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const randomBuffer = new Uint32Array(1);

/**
 * Returns a cryptographically secure random float in [0, 1),
 * matching the contract of Math.random().
 */
function cryptoRandom(): number {
    crypto.getRandomValues(randomBuffer);
    return randomBuffer[0] / 0x100000000;
}
