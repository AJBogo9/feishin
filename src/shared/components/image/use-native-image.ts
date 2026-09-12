import { useEffect, useMemo, useRef, useState } from 'react';

import { ImageRequest } from '/@/shared/types/domain-types';

type FetchPriority = 'auto' | 'high' | 'low';

interface NativeImageState {
    displaySrc?: string;
    status: 'error' | 'idle' | 'loaded' | 'loading';
}

interface UseNativeImageArgs {
    enabled: boolean;
    fetchPriority?: FetchPriority;
    onFetchError?: () => void;
    request?: ImageRequest | null;
}

export function useNativeImage({
    enabled,
    fetchPriority,
    onFetchError,
    request,
}: UseNativeImageArgs) {
    const abortControllerRef = useRef<AbortController | null>(null);
    const loadedRequestSignatureRef = useRef<null | string>(null);
    const objectUrlRef = useRef<null | string>(null);
    const onFetchErrorRef = useRef(onFetchError);
    const [state, setState] = useState<NativeImageState>({ status: 'idle' });

    const requestSignature = useMemo(() => {
        if (!request) {
            return null;
        }

        return JSON.stringify({
            cacheKey: request.cacheKey,
            credentials: request.credentials,
            headers: request.headers,
            url: request.url,
        });
    }, [request]);

    onFetchErrorRef.current = onFetchError;

    useEffect(() => {
        const abortCurrentRequest = () => {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
        };

        const revokeObjectUrl = () => {
            if (!objectUrlRef.current) {
                return;
            }

            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
            loadedRequestSignatureRef.current = null;
        };

        // Every branch below returns the CURRENT state object when nothing actually changed.
        // React only bails out of a re-render when the new state is referentially equal, so
        // allocating a fresh object each run made this effect re-render its component every
        // time it ran. With `enabled` flipping as rows enter and leave the viewport during a
        // fast scroll, that became a self-sustaining loop and blew React's nested-update limit
        // ("Maximum update depth exceeded"), taking the whole list down to an error boundary.
        if (!request || !requestSignature) {
            abortCurrentRequest();
            revokeObjectUrl();
            setState((currentState) =>
                currentState.status === 'idle' && !currentState.displaySrc
                    ? currentState
                    : { status: 'idle' },
            );
            return;
        }

        if (!enabled) {
            abortCurrentRequest();
            setState((currentState) => {
                if (currentState.displaySrc) {
                    return currentState.status === 'loaded'
                        ? currentState
                        : { ...currentState, status: 'loaded' };
                }

                return currentState.status === 'idle' ? currentState : { status: 'idle' };
            });
            return;
        }

        if (loadedRequestSignatureRef.current === requestSignature && objectUrlRef.current) {
            const loadedSrc = objectUrlRef.current;
            setState((currentState) =>
                currentState.status === 'loaded' && currentState.displaySrc === loadedSrc
                    ? currentState
                    : { displaySrc: loadedSrc, status: 'loaded' },
            );
            return;
        }

        abortCurrentRequest();
        revokeObjectUrl();
        setState((currentState) =>
            currentState.status === 'loading' && !currentState.displaySrc
                ? currentState
                : { status: 'loading' },
        );

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        void (async () => {
            try {
                const init = {
                    credentials: request.credentials,
                    headers: request.headers,
                    signal: abortController.signal,
                } as RequestInit & { priority?: FetchPriority };

                if (fetchPriority) {
                    init.priority = fetchPriority;
                }

                const response = await fetch(request.url, init);

                if (!response.ok) {
                    throw new Error(`Failed to load image: ${response.status}`);
                }

                const blob = await response.blob();

                if (abortController.signal.aborted) {
                    return;
                }

                const objectUrl = URL.createObjectURL(blob);
                objectUrlRef.current = objectUrl;
                loadedRequestSignatureRef.current = requestSignature;
                setState({ displaySrc: objectUrl, status: 'loaded' });
            } catch {
                if (abortController.signal.aborted) {
                    return;
                }

                revokeObjectUrl();
                setState({ status: 'error' });
                onFetchErrorRef.current?.();
            } finally {
                if (abortControllerRef.current === abortController) {
                    abortControllerRef.current = null;
                }
            }
        })();

        return () => {
            abortController.abort();

            if (abortControllerRef.current === abortController) {
                abortControllerRef.current = null;
            }
        };
    }, [enabled, fetchPriority, request, requestSignature]);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();

            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
            }
        };
    }, []);

    return {
        displaySrc: state.displaySrc,
        isError: state.status === 'error',
        isLoaded: state.status === 'loaded',
        isLoading: state.status === 'loading',
    };
}
