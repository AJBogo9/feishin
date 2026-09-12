import type { SynchronizedLyrics } from '/@/shared/types/domain-types';

/**
 * Leading run of timestamps on one LRC line, including any whitespace between them, so that a
 * compressed line like `[00:12.00] [01:20.00]chorus` is recognised as two cues for one text.
 */
const TAG_RUN = /^\s*(?:\[\d+:\d{1,2}(?:\.\d{1,3})?]\s*)+/;

/** One timestamp inside that run. */
const TAG = /\[(\d+):(\d{1,2}(?:\.\d{1,3})?)]/g;

/**
 * Parse LRC into timed lines.
 *
 * Two things the previous single-regex version got wrong:
 *
 * - A whole-second timestamp (`[00:12]`) produced NaN, because the fraction group is optional but
 *   was fed to parseInt unconditionally. Every comparison against NaN is false, so the line never
 *   became a scroll candidate, and the line BEFORE it died too because its end time was NaN.
 *   Parsing `seconds` as a single decimal number removes the special case entirely.
 * - A greedy text group swallowed any further timestamps, so a compressed line parsed as one cue
 *   whose text contained a literal `[01:20.00]`.
 *
 * Splitting the tag run off the front and then matching within it avoids both, and avoids the
 * backtracking a combined pattern invites.
 */
export const parseLrc = (lyrics: string): SynchronizedLyrics => {
    const lines: SynchronizedLyrics = [];

    for (const rawLine of lyrics.split('\n')) {
        // Tolerate CRLF files; the trailing \r would otherwise become part of the text.
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        const tags = TAG_RUN.exec(line);

        if (!tags) continue;

        const text = line.slice(tags[0].length);

        // Keeps today's line set: a bare timestamp with no text is a gap cue, and an empty line
        // renders zero-height, which would make autoscroll centre on nothing.
        if (!text) continue;

        for (const [, minutes, seconds] of tags[0].matchAll(TAG)) {
            lines.push({
                startMs: Math.round((Number(minutes) * 60 + Number(seconds)) * 1000),
                text,
            });
        }
    }

    // Expanding a compressed tag run puts entries out of file order, and the animation engine
    // treats the following entry's time as the current line's end. Sort is stable, so cues that
    // share a timestamp keep file order.
    return lines.sort((a, b) => a.startMs - b.startMs);
};
