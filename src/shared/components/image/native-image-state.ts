export interface NativeImageState {
    displaySrc?: string;
    status: 'error' | 'idle' | 'loaded' | 'loading';
}

export interface NativeImageTransitionInput {
    /** Whether the consumer currently wants this image fetched (viewport / cache gating). */
    enabled: boolean;
    /** Signature of the request whose blob is held in `objectUrl`, if any. */
    loadedSignature: null | string;
    /** The blob URL currently held for `loadedSignature`. */
    objectUrl: null | string;
    /** Signature of the request being asked for now, or null when there is nothing to load. */
    requestSignature: null | string;
}

/**
 * Decide the next synchronous state for a native image fetch.
 *
 * Returning `currentState` itself matters: React only skips a re-render when the next state is
 * referentially equal, and this runs from an effect whose `enabled` input flips as virtualized rows
 * enter and leave the viewport. Allocating a fresh object on every run therefore re-rendered the
 * component every time the effect ran, which during a fast scroll became a self-sustaining chain of
 * commits and blew React's nested-update limit ("Maximum update depth exceeded"), taking the whole
 * list down to an error boundary. Keeping that rule in one pure function is what makes it testable.
 */
export const nextNativeImageState = (
    currentState: NativeImageState,
    { enabled, loadedSignature, objectUrl, requestSignature }: NativeImageTransitionInput,
): NativeImageState => {
    const isIdle = currentState.status === 'idle' && !currentState.displaySrc;

    if (!requestSignature) {
        return isIdle ? currentState : { status: 'idle' };
    }

    const displaysCurrentRequest =
        loadedSignature === requestSignature &&
        objectUrl !== null &&
        currentState.displaySrc === objectUrl;

    // Keep showing an already-fetched image while disabled, but only when it actually belongs to
    // the current request. A virtualized row recycled to a different track while off-screen arrives
    // here with a new request and a stale blob URL; reporting that as `loaded` made the caller
    // record a cache key it never fetched and then flip `enabled` back on, costing an extra render
    // round-trip per recycled row.
    if (!enabled) {
        if (displaysCurrentRequest) {
            return currentState.status === 'loaded'
                ? currentState
                : { ...currentState, status: 'loaded' };
        }

        return isIdle ? currentState : { status: 'idle' };
    }

    // The blob for this exact request is still in hand, so adopt it instead of refetching.
    if (loadedSignature === requestSignature && objectUrl !== null) {
        return displaysCurrentRequest && currentState.status === 'loaded'
            ? currentState
            : { displaySrc: objectUrl, status: 'loaded' };
    }

    return currentState.status === 'loading' && !currentState.displaySrc
        ? currentState
        : { status: 'loading' };
};

/**
 * Whether `nextNativeImageState` has decided a fetch needs to start. The caller owns aborting and
 * revoking, so it needs this as a separate answer from the state itself.
 */
export const shouldStartNativeImageFetch = ({
    enabled,
    loadedSignature,
    objectUrl,
    requestSignature,
}: NativeImageTransitionInput): boolean => {
    if (!requestSignature || !enabled) {
        return false;
    }

    return !(loadedSignature === requestSignature && objectUrl !== null);
};
