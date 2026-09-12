import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    clampMpvDb,
    getMpvProperties,
    getMpvSetting,
    normalizeMpvSampleRate,
} from './mpv-properties.ts';

const baseProperties = {
    audioExclusiveMode: 'no',
    audioSampleRateHz: 0,
    gaplessAudio: 'weak',
    replayGainClip: 'no',
    replayGainFallbackDB: 0,
    replayGainMode: 'no',
    replayGainPreampDB: 0,
} as unknown as Parameters<typeof getMpvProperties>[0];

describe('normalizeMpvSampleRate', () => {
    it('treats a rate below mpv\'s floor as "use the source rate"', () => {
        assert.equal(normalizeMpvSampleRate(4800), 0);
        assert.equal(normalizeMpvSampleRate(7999), 0);
    });

    it('passes a normal rate through unchanged', () => {
        assert.equal(normalizeMpvSampleRate(8000), 8000);
        assert.equal(normalizeMpvSampleRate(44100), 44100);
        assert.equal(normalizeMpvSampleRate(48000), 48000);
        assert.equal(normalizeMpvSampleRate(192000), 192000);
    });

    it('clamps above the input max instead of sending a rate mpv rejects', () => {
        assert.equal(normalizeMpvSampleRate(1920000), 192000);
        assert.equal(normalizeMpvSampleRate(768000), 192000);
    });

    it('rejects non-finite and non-numeric values', () => {
        assert.equal(normalizeMpvSampleRate(undefined), 0);
        assert.equal(normalizeMpvSampleRate(null), 0);
        assert.equal(normalizeMpvSampleRate(NaN), 0);
        assert.equal(normalizeMpvSampleRate(Infinity), 0);
        assert.equal(normalizeMpvSampleRate('48000'), 0);
    });

    it('never returns a negative rate', () => {
        assert.equal(normalizeMpvSampleRate(-48000), 0);
    });
});

describe('getMpvSetting audioSampleRateHz', () => {
    it('coerces a mistyped low rate to the source rate', () => {
        assert.deepEqual(getMpvSetting('audioSampleRateHz', 4800), { 'audio-samplerate': 0 });
    });

    it('clamps a mistyped high rate rather than letting mpv reject it', () => {
        assert.deepEqual(getMpvSetting('audioSampleRateHz', 1920000), {
            'audio-samplerate': 192000,
        });
    });

    it('leaves a valid rate alone', () => {
        assert.deepEqual(getMpvSetting('audioSampleRateHz', 48000), {
            'audio-samplerate': 48000,
        });
    });
});

describe('clampMpvDb', () => {
    it('clamps a preamp above what mpv accepts', () => {
        assert.equal(clampMpvDb('replayGainPreampDB', 200), 150);
    });

    it('clamps a fallback below what mpv accepts', () => {
        assert.equal(clampMpvDb('replayGainFallbackDB', -500), -200);
    });

    it('leaves in-range values alone, including zero and negatives', () => {
        assert.equal(clampMpvDb('replayGainPreampDB', 0), 0);
        assert.equal(clampMpvDb('replayGainPreampDB', -12.5), -12.5);
        assert.equal(clampMpvDb('replayGainFallbackDB', 60), 60);
    });

    it('leaves an unset value unset rather than inventing a default', () => {
        assert.equal(clampMpvDb('replayGainFallbackDB', undefined), undefined);
        assert.equal(clampMpvDb('replayGainFallbackDB', null), undefined);
    });

    it('treats a non-numeric value as unset', () => {
        assert.equal(clampMpvDb('replayGainPreampDB', 'loud'), undefined);
        assert.equal(clampMpvDb('replayGainPreampDB', NaN), undefined);
    });
});

describe('getMpvSetting replaygain', () => {
    it('clamps the preamp mpv would otherwise reject', () => {
        assert.deepEqual(getMpvSetting('replayGainPreampDB', 200), {
            'replaygain-preamp': 150,
        });
    });

    it('clamps the fallback mpv would otherwise reject', () => {
        assert.deepEqual(getMpvSetting('replayGainFallbackDB', -500), {
            'replaygain-fallback': -200,
        });
    });

    it('keeps a preamp of 0 as 0 rather than dropping it', () => {
        assert.deepEqual(getMpvSetting('replayGainPreampDB', 0), { 'replaygain-preamp': 0 });
    });
});

describe('getMpvProperties audio-samplerate', () => {
    it('drops the key entirely when the stored rate is unusable', () => {
        const properties = getMpvProperties({ ...baseProperties, audioSampleRateHz: 4800 });
        assert.equal('audio-samplerate' in properties, false);
    });

    it('drops the key when the rate is the 0 default', () => {
        const properties = getMpvProperties({ ...baseProperties, audioSampleRateHz: 0 });
        assert.equal('audio-samplerate' in properties, false);
    });

    it('keeps a valid rate', () => {
        const properties = getMpvProperties({ ...baseProperties, audioSampleRateHz: 96000 });
        assert.equal(properties['audio-samplerate'], 96000);
    });
});
