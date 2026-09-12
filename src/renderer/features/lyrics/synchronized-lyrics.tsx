import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import styles from './synchronized-lyrics.module.css';

import '/@/renderer/features/lyrics/styles/synchronized-lyrics-animation.css';
import {
    findOverlayLineByTime,
    getLyricLineStartMs,
    getLyricLineText,
    normalizeLyrics,
} from '/@/renderer/features/lyrics/api/lyrics-utils';
import { LyricsScrollContent } from '/@/renderer/features/lyrics/components/lyrics-scroll-content';
import { useLyricsAnimationEngine } from '/@/renderer/features/lyrics/hooks/use-lyrics-animation-engine';
import {
    LYRICS_SCROLL_CONTAINER_ID,
    useSynchronizedLyricsBase,
} from '/@/renderer/features/lyrics/hooks/use-synchronized-lyrics-base';
import { LyricLine } from '/@/renderer/features/lyrics/lyric-line';
import { isSeek } from '/@/renderer/features/lyrics/utils/seek-detect';
import { subscribePlayerStatus, usePlayerStoreBase } from '/@/renderer/store';
import { subscribePlayerProgress, useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import {
    FullLyricsMetadata,
    SynchronizedLyrics as SynchronizedLyricsData,
} from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

export interface SynchronizedLyricsProps extends Omit<FullLyricsMetadata, 'lyrics'> {
    extraOverlayLyrics?: SynchronizedLyricsData[];
    lyrics: SynchronizedLyricsData;
    offsetMs?: number;
    preview?: boolean;
    pronunciationLyrics?: null | SynchronizedLyricsData;
    romajiLyrics?: null | SynchronizedLyricsData;
    settingsKey?: string;
    style?: React.CSSProperties;
    translatedLyrics?: null | string;
    translationLyrics?: null | SynchronizedLyricsData;
}

const SEEK_DETECT_THRESHOLD_MS = 500;
const PREVIEW_FONT_SIZE = 20;
const PREVIEW_GAP = 20;

export const SynchronizedLyrics = ({
    artist,
    lyrics,
    name,
    offsetMs,
    preview = false,
    pronunciationLyrics,
    romajiLyrics,
    settingsKey = 'default',
    source,
    style,
    translatedLyrics,
    translationLyrics,
}: SynchronizedLyricsProps) => {
    const {
        containerRef,
        containerStyle,
        delayMsRef,
        followRef,
        followScrollAlignmentRef,
        handleLineClick,
        hideScrollbar,
        lineLeadTimeMsRef,
        lyricRef,
        resumeAutoscroll,
        scrollAnimStateRef,
        settings,
        showScrollbar,
    } = useSynchronizedLyricsBase(settingsKey, offsetMs);

    const effectiveFontSize = preview ? PREVIEW_FONT_SIZE : settings.fontSize;
    const effectiveGap = preview ? PREVIEW_GAP : settings.gap;
    const effectivePaddingLeft = preview ? 0 : settings.paddingLeft;
    const effectivePaddingRight = preview ? 0 : settings.paddingRight;

    const normalizedLyrics = useMemo(() => normalizeLyrics(lyrics), [lyrics]);
    const rafRef = useRef<null | number>(null);
    const statusRef = useRef(usePlayerStoreBase.getState().player.status);
    // The previous progress sample, media time and wall time together. It is both the seek
    // detector's reference point and the interpolation origin for the RAF loop, which is why it
    // replaces the old lastSyncedTimeRef: one value, updated in one place.
    const playbackAnchorRef = useRef({
        // eslint-disable-next-line react-hooks/purity
        eventCreationTime: Date.now(),
        timeMs: useTimestampStoreBase.getState().timestamp * 1000,
    });

    const {
        rebuildLyricsData,
        reset,
        resumeAutoscroll: resumeEngineAutoscroll,
        tick,
    } = useLyricsAnimationEngine({
        animStateRef: scrollAnimStateRef,
        containerRef,
        followRef,
        followScrollAlignmentRef,
        fontSize: effectiveFontSize,
        gap: effectiveGap,
        lineIdPrefix: 'lyric',
        lineLeadTimeMsRef,
        lyrics: normalizedLyrics,
        paddingLeft: effectivePaddingLeft,
        paddingRight: effectivePaddingRight,
        scrollContainerId: LYRICS_SCROLL_CONTAINER_ID,
    });

    const syncAtTime = useCallback(
        (
            timeInMs: number,
            isPlaying: boolean,
            options?: { eventCreationTime?: number; forceReset?: boolean; forceResync?: boolean },
        ) => {
            if (options?.forceReset) {
                reset();
                rebuildLyricsData();
            }

            tick(timeInMs, isPlaying, {
                eventCreationTime: options?.eventCreationTime ?? Date.now(),
                forceResync: options?.forceResync ?? false,
            });
        },
        [rebuildLyricsData, reset, tick],
    );

    const updatePlaybackAnchor = useCallback((timestampSec: number) => {
        playbackAnchorRef.current = {
            eventCreationTime: Date.now(),
            timeMs: timestampSec * 1000,
        };
    }, []);

    const stopRaf = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    const startRaf = useCallback(() => {
        stopRaf();

        const runTick = () => {
            if (statusRef.current !== PlayerStatus.PLAYING) {
                stopRaf();
                return;
            }

            // Interpolate from the anchor instead of re-reading the store. The store only moves
            // every ~500 ms on the mpv path, so reading it per frame made lyrics advance in
            // visible steps. Seek detection lives in the progress subscriber, which is the only
            // place that sees a new sample, so there is no seek branch here.
            const anchor = playbackAnchorRef.current;
            const timeInMs = anchor.timeMs + delayMsRef.current;

            syncAtTime(timeInMs, true, { eventCreationTime: anchor.eventCreationTime });

            rafRef.current = requestAnimationFrame(runTick);
        };

        rafRef.current = requestAnimationFrame(runTick);
    }, [delayMsRef, stopRaf, syncAtTime]);

    const syncFromCurrentTimestamp = useCallback(() => {
        const timestamp = useTimestampStoreBase.getState().timestamp;
        const isPlaying = statusRef.current === PlayerStatus.PLAYING;
        updatePlaybackAnchor(timestamp);
        syncAtTime(timestamp * 1000 + delayMsRef.current, isPlaying, {
            forceReset: true,
            forceResync: true,
        });
    }, [delayMsRef, syncAtTime, updatePlaybackAnchor]);

    useEffect(() => {
        lyricRef.current = normalizedLyrics;
        // Re-stamp rather than zero it: a zeroed anchor would make the first sample after a
        // track change look like a seek of the whole elapsed position.
        updatePlaybackAnchor(useTimestampStoreBase.getState().timestamp);

        const frame = requestAnimationFrame(() => {
            rebuildLyricsData();

            if (statusRef.current === PlayerStatus.PLAYING) {
                startRaf();
            } else {
                syncFromCurrentTimestamp();
            }
        });

        return () => {
            cancelAnimationFrame(frame);
            stopRaf();
            reset();
        };
    }, [
        lyricRef,
        normalizedLyrics,
        rebuildLyricsData,
        reset,
        startRaf,
        stopRaf,
        syncFromCurrentTimestamp,
        updatePlaybackAnchor,
    ]);

    useEffect(() => {
        syncFromCurrentTimestamp();
    }, [offsetMs, syncFromCurrentTimestamp]);

    useEffect(() => {
        statusRef.current = usePlayerStoreBase.getState().player.status;

        const unsubscribe = subscribePlayerStatus(({ status }) => {
            statusRef.current = status;

            if (status !== PlayerStatus.PLAYING) {
                stopRaf();
                syncFromCurrentTimestamp();
                return;
            }

            // The anchor goes stale while paused (the mpv poll only runs while PLAYING), so it
            // must be re-stamped before the RAF loop starts interpolating from it. Without this
            // the first resumed frame adds the entire pause duration to the lyrics position.
            updatePlaybackAnchor(useTimestampStoreBase.getState().timestamp);
            startRaf();
        });

        return unsubscribe;
    }, [startRaf, stopRaf, syncFromCurrentTimestamp, updatePlaybackAnchor]);

    useEffect(() => {
        const unsubscribe = subscribePlayerProgress(({ timestamp }) => {
            const timeInMs = timestamp * 1000 + delayMsRef.current;
            const isPlaying = statusRef.current === PlayerStatus.PLAYING;

            if (!isPlaying) {
                updatePlaybackAnchor(timestamp);
                syncAtTime(timeInMs, false, { forceReset: true, forceResync: true });
                return;
            }

            // Compare the media delta against the wall delta before moving the anchor. The delay
            // offset cancels out, so it is left out of both. Scaling by speed keeps a 2x playback
            // rate from reading as a permanent seek.
            const previous = playbackAnchorRef.current;
            const mediaDeltaMs = timestamp * 1000 - previous.timeMs;
            const speed = usePlayerStoreBase.getState().player.speed || 1;
            const wallDeltaMs = (Date.now() - previous.eventCreationTime) * speed;

            updatePlaybackAnchor(timestamp);

            if (isSeek(mediaDeltaMs, wallDeltaMs, SEEK_DETECT_THRESHOLD_MS)) {
                resumeAutoscroll();
                resumeEngineAutoscroll();
                syncAtTime(timeInMs, true, { forceReset: true, forceResync: true });
            }
        });

        return unsubscribe;
    }, [delayMsRef, resumeAutoscroll, resumeEngineAutoscroll, syncAtTime, updatePlaybackAnchor]);

    const handleContainerClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            resumeAutoscroll();
            resumeEngineAutoscroll();
            handleLineClick(event);
        },
        [handleLineClick, resumeAutoscroll, resumeEngineAutoscroll],
    );

    const getOverlayText = (
        overlayLyrics: null | SynchronizedLyricsData | undefined,
        startMs: number,
        lineIndex: number,
        fallback?: null | string,
    ) => {
        if (overlayLyrics) {
            return findOverlayLineByTime(overlayLyrics, startMs, lineIndex);
        }

        return fallback;
    };

    return (
        <div
            className={clsx(
                styles.container,
                preview && styles.preview,
                'synchronized-lyrics overlay-scrollbar',
            )}
            id={LYRICS_SCROLL_CONTAINER_ID}
            onClick={handleContainerClick}
            onMouseEnter={showScrollbar}
            onMouseLeave={hideScrollbar}
            ref={containerRef}
            style={{ ...containerStyle, ...style }}
        >
            <LyricsScrollContent
                gap={effectiveGap}
                paddingLeft={effectivePaddingLeft}
                paddingRight={effectivePaddingRight}
                preview={preview}
            >
                {settings.showProvider && source && (
                    <LyricLine
                        alignment={settings.alignment}
                        fontSize={effectiveFontSize}
                        text={`${source}`}
                    />
                )}
                {settings.showMatch && (
                    <LyricLine
                        alignment={settings.alignment}
                        fontSize={effectiveFontSize}
                        text={`${name} — ${artist}`}
                    />
                )}
                {normalizedLyrics.map((rawLine, idx) => {
                    const lineStartMs = getLyricLineStartMs(rawLine);
                    const lineText = getLyricLineText(rawLine);
                    const pronunciationText = getOverlayText(
                        pronunciationLyrics,
                        lineStartMs,
                        idx,
                        romajiLyrics?.[idx] ? getLyricLineText(romajiLyrics[idx]) : undefined,
                    );
                    const translationText = getOverlayText(
                        translationLyrics,
                        lineStartMs,
                        idx,
                        translatedLyrics?.split('\n')[idx],
                    );

                    return (
                        <LyricLine
                            alignment={settings.alignment}
                            className="lyric-line synchronized"
                            data-lyric-time={lineStartMs}
                            fontSize={effectiveFontSize}
                            id={`lyric-${idx}`}
                            key={idx}
                            romajiText={pronunciationText}
                            text={lineText}
                            translatedText={translationText}
                        />
                    );
                })}
            </LyricsScrollContent>
        </div>
    );
};
