import type { SettingsState } from '/@/renderer/store/settings.store';

/**
 * Coerce a sample rate into something mpv will actually accept.
 *
 * 0 means "use the source rate", which is what mpv does by default. Anything below 8000 Hz is
 * treated as unset (the behaviour every locale's description already promises), and anything
 * above the input's own `max` is clamped rather than discarded, so a digit slip cannot push a
 * rate mpv rejects. A rejected `set_property` makes node-mpv reject, and an unawaited rejection
 * reaches the process-wide `unhandledRejection` handler, which tears mpv down mid-playback.
 */
export const normalizeMpvSampleRate = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 8000
        ? Math.min(value, 192000)
        : 0;

/**
 * Ranges mpv actually accepts. A value outside these makes mpv reject the `set_property`, and a
 * rejected set is what kills the player (see the comment on the `player-set-properties` handler).
 */
export const MPV_DB_RANGES = {
    replayGainFallbackDB: [-200, 60],
    replayGainPreampDB: [-150, 150],
} as const;

const clampDb = <T>(value: unknown, range: readonly [number, number], fallback: T) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, range[0]), range[1]) : fallback;
};

export const clampMpvDb = (key: keyof typeof MPV_DB_RANGES, value: unknown): number | undefined => {
    if (value === undefined || value === null) return undefined;
    return clampDb(value, MPV_DB_RANGES[key], undefined);
};

export const getMpvSetting = (
    key: keyof SettingsState['playback']['mpvProperties'],
    value: any,
) => {
    switch (key) {
        case 'audioExclusiveMode':
            return { 'audio-exclusive': value || 'no' };
        case 'audioSampleRateHz':
            return { 'audio-samplerate': normalizeMpvSampleRate(value) };
        case 'gaplessAudio':
            return { 'gapless-audio': value || 'weak' };
        case 'replayGainClip':
            return { 'replaygain-clip': value || 'no' };
        case 'replayGainFallbackDB':
            return { 'replaygain-fallback': clampMpvDb('replayGainFallbackDB', value) };
        case 'replayGainMode':
            return { replaygain: value || 'no' };
        case 'replayGainPreampDB':
            return { 'replaygain-preamp': clampMpvDb('replayGainPreampDB', value) ?? 0 };
        default:
            return { 'audio-format': value };
    }
};

export const getMpvProperties = (settings: SettingsState['playback']['mpvProperties']) => {
    const properties: Record<string, any> = {
        'audio-exclusive': settings.audioExclusiveMode || 'no',
        'audio-samplerate': normalizeMpvSampleRate(settings.audioSampleRateHz) || undefined,
        'gapless-audio': settings.gaplessAudio || 'weak',
        replaygain: settings.replayGainMode || 'no',
        'replaygain-clip': settings.replayGainClip || 'no',
        'replaygain-fallback': clampMpvDb('replayGainFallbackDB', settings.replayGainFallbackDB),
        'replaygain-preamp': clampMpvDb('replayGainPreampDB', settings.replayGainPreampDB) ?? 0,
    };

    Object.keys(properties).forEach((key) =>
        properties[key] === undefined ? delete properties[key] : {},
    );

    return properties;
};
