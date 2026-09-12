/**
 * Did playback jump, or did it just advance normally?
 *
 * The naive test compares the raw sample-to-sample media delta against a threshold, which is
 * wrong whenever the sample interval is itself near that threshold: for playbackType "local" the
 * timestamp store is fed by a 500 ms interval over an IPC round trip, so a plain
 * `mediaDelta > 500` crosses on roughly half of all polls purely from timer jitter, and every
 * crossing forces a full lyrics reset.
 *
 * Comparing the media delta against the WALL delta is jitter-proof: a late sample moves both by
 * the same amount, so their difference stays near zero. Only a real seek moves one without the
 * other.
 */
export function isSeek(mediaDeltaMs: number, wallDeltaMs: number, thresholdMs: number): boolean {
    if (!Number.isFinite(mediaDeltaMs) || !Number.isFinite(wallDeltaMs)) {
        return false;
    }

    return Math.abs(mediaDeltaMs - wallDeltaMs) > thresholdMs;
}
