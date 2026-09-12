import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { NativeImageState } from './native-image-state.ts';

import { nextNativeImageState, shouldStartNativeImageFetch } from './native-image-state.ts';

const SIG_A = '{"cacheKey":"a"}';
const SIG_B = '{"cacheKey":"b"}';
const BLOB_A = 'blob:a';

const loadedA: NativeImageState = { displaySrc: BLOB_A, status: 'loaded' };
const idle: NativeImageState = { status: 'idle' };
const loading: NativeImageState = { status: 'loading' };

describe('nextNativeImageState', () => {
    it('returns the same object when there is still nothing to load', () => {
        const next = nextNativeImageState(idle, {
            enabled: true,
            loadedSignature: null,
            objectUrl: null,
            requestSignature: null,
        });

        assert.equal(next, idle);
    });

    it('returns the same object when the loaded image is already the one being asked for', () => {
        const next = nextNativeImageState(loadedA, {
            enabled: true,
            loadedSignature: SIG_A,
            objectUrl: BLOB_A,
            requestSignature: SIG_A,
        });

        assert.equal(next, loadedA);
    });

    it('returns the same object when a loaded image is disabled but still current', () => {
        const next = nextNativeImageState(loadedA, {
            enabled: false,
            loadedSignature: SIG_A,
            objectUrl: BLOB_A,
            requestSignature: SIG_A,
        });

        assert.equal(next, loadedA);
    });

    it('returns the same object when already loading the requested image', () => {
        const next = nextNativeImageState(loading, {
            enabled: true,
            loadedSignature: null,
            objectUrl: null,
            requestSignature: SIG_A,
        });

        assert.equal(next, loading);
    });

    it('drops a stale image when a disabled row is recycled to a different request', () => {
        const next = nextNativeImageState(loadedA, {
            enabled: false,
            loadedSignature: SIG_A,
            objectUrl: BLOB_A,
            requestSignature: SIG_B,
        });

        assert.deepEqual(next, { status: 'idle' });
        assert.notEqual(next.displaySrc, BLOB_A);
    });

    it('goes to loading when the request changes while enabled', () => {
        const next = nextNativeImageState(loadedA, {
            enabled: true,
            loadedSignature: SIG_A,
            objectUrl: BLOB_A,
            requestSignature: SIG_B,
        });

        assert.deepEqual(next, { status: 'loading' });
    });

    it('re-adopts a held blob when the same request is enabled again', () => {
        const next = nextNativeImageState(idle, {
            enabled: true,
            loadedSignature: SIG_A,
            objectUrl: BLOB_A,
            requestSignature: SIG_A,
        });

        assert.deepEqual(next, { displaySrc: BLOB_A, status: 'loaded' });
    });

    it('clears an error once there is nothing to load', () => {
        const errored: NativeImageState = { status: 'error' };

        const next = nextNativeImageState(errored, {
            enabled: true,
            loadedSignature: null,
            objectUrl: null,
            requestSignature: null,
        });

        assert.deepEqual(next, { status: 'idle' });
    });

    it('is stable when applied repeatedly to its own output', () => {
        const input = {
            enabled: false,
            loadedSignature: SIG_A,
            objectUrl: BLOB_A,
            requestSignature: SIG_B,
        };

        const first = nextNativeImageState(loadedA, input);
        const second = nextNativeImageState(first, input);

        // The second pass must bail out referentially, or the effect re-renders forever.
        assert.equal(second, first);
    });
});

describe('shouldStartNativeImageFetch', () => {
    it('does not fetch while disabled', () => {
        assert.equal(
            shouldStartNativeImageFetch({
                enabled: false,
                loadedSignature: null,
                objectUrl: null,
                requestSignature: SIG_A,
            }),
            false,
        );
    });

    it('does not fetch when there is no request', () => {
        assert.equal(
            shouldStartNativeImageFetch({
                enabled: true,
                loadedSignature: null,
                objectUrl: null,
                requestSignature: null,
            }),
            false,
        );
    });

    it('does not refetch a request whose blob is already held', () => {
        assert.equal(
            shouldStartNativeImageFetch({
                enabled: true,
                loadedSignature: SIG_A,
                objectUrl: BLOB_A,
                requestSignature: SIG_A,
            }),
            false,
        );
    });

    it('fetches when the held blob belongs to a different request', () => {
        assert.equal(
            shouldStartNativeImageFetch({
                enabled: true,
                loadedSignature: SIG_A,
                objectUrl: BLOB_A,
                requestSignature: SIG_B,
            }),
            true,
        );
    });
});
