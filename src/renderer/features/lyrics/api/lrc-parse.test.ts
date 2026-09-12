import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseLrc } from './lrc-parse.ts';

describe('parseLrc', () => {
    it('parses a whole-second timestamp instead of yielding NaN', () => {
        // The bug: the optional fraction group was fed to parseInt unconditionally, so this
        // produced NaN and silently killed both this line and the one before it.
        assert.deepEqual(parseLrc('[00:12]hello'), [{ startMs: 12000, text: 'hello' }]);
    });

    it('parses two-digit and three-digit fractions at the same scale', () => {
        assert.equal(parseLrc('[00:12.34]x')[0].startMs, 12340);
        assert.equal(parseLrc('[00:12.345]x')[0].startMs, 12345);
        assert.equal(parseLrc('[00:12.3]x')[0].startMs, 12300);
    });

    it('matches the old parser on well-formed input', () => {
        assert.equal(parseLrc('[01:02.50]x')[0].startMs, 62500);
        assert.equal(parseLrc('[123:02.007]x')[0].startMs, 7382007);
    });

    it('accepts single-digit minutes', () => {
        assert.equal(parseLrc('[0:12.3]x')[0].startMs, 12300);
    });

    it('expands a compressed multi-timestamp line into one cue per timestamp', () => {
        // Previously parsed as a single cue at 12 s whose text contained a literal [01:20.00].
        assert.deepEqual(parseLrc('[00:12.00][01:20.00]chorus'), [
            { startMs: 12000, text: 'chorus' },
            { startMs: 80000, text: 'chorus' },
        ]);
    });

    it('expands a compressed line that has whitespace between the tags', () => {
        assert.deepEqual(parseLrc('[00:12.00] [01:20.00]chorus'), [
            { startMs: 12000, text: 'chorus' },
            { startMs: 80000, text: 'chorus' },
        ]);
    });

    it('returns entries in ascending time order after expansion', () => {
        const parsed = parseLrc(['[00:30.00]second', '[00:10.00][01:00.00]first'].join('\n'));
        assert.deepEqual(
            parsed.map((line) => line.startMs),
            [10000, 30000, 60000],
        );
    });

    it('handles CRLF input without trapping the carriage return in the text', () => {
        assert.deepEqual(parseLrc('[00:01.00]a\r\n[00:02.00]b'), [
            { startMs: 1000, text: 'a' },
            { startMs: 2000, text: 'b' },
        ]);
    });

    it('skips metadata and untimed lines', () => {
        assert.deepEqual(parseLrc('[ar:Artist]\n[00:01.00]a\nplain text'), [
            { startMs: 1000, text: 'a' },
        ]);
    });

    it('drops a bare timestamp with no text', () => {
        assert.deepEqual(parseLrc('[00:30.00]'), []);
    });

    it('returns nothing for NetEase karaoke input so the caller can fall back', () => {
        assert.deepEqual(parseLrc('[123,456]hello (0,100)wor(100,200)ld'), []);
    });

    it('returns nothing for unsynced plain lyrics', () => {
        assert.deepEqual(parseLrc('just some words\nand more'), []);
    });
});
