import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isAllowedOrigin } from './origin-check.ts';

describe('isAllowedOrigin', () => {
    it('allows a native client, which sends no Origin', () => {
        assert.equal(isAllowedOrigin(undefined, 'localhost:4333'), true);
        assert.equal(isAllowedOrigin('', 'localhost:4333'), true);
    });

    it('allows the remote UI served from the same host', () => {
        assert.equal(isAllowedOrigin('http://localhost:4333', 'localhost:4333'), true);
        assert.equal(isAllowedOrigin('http://192.168.1.5:4333', '192.168.1.5:4333'), true);
    });

    it('allows an https origin in front of the http server', () => {
        assert.equal(isAllowedOrigin('https://music.example', 'music.example'), true);
    });

    it('allows an IPv6 host pair', () => {
        assert.equal(isAllowedOrigin('http://[fe80::1]:4333', '[fe80::1]:4333'), true);
    });

    it('rejects a hostile page on another origin', () => {
        assert.equal(isAllowedOrigin('https://evil.example', 'localhost:4333'), false);
    });

    it('rejects a different port on the same hostname', () => {
        assert.equal(isAllowedOrigin('http://localhost:3000', 'localhost:4333'), false);
    });

    it('rejects the opaque "null" origin from a sandboxed iframe or file://', () => {
        assert.equal(isAllowedOrigin('null', 'localhost:4333'), false);
    });

    it('rejects malformed input without throwing', () => {
        assert.doesNotThrow(() => isAllowedOrigin('::::', 'localhost:4333'));
        assert.equal(isAllowedOrigin('::::', 'localhost:4333'), false);
    });

    it('rejects when the Host header is missing', () => {
        assert.equal(isAllowedOrigin('https://evil.example', undefined), false);
    });

    it('accepts a proxied host via x-forwarded-host', () => {
        // nginx's default is `proxy_set_header Host $proxy_host`, so Host is the upstream.
        assert.equal(
            isAllowedOrigin('https://music.example', 'localhost:4333', 'music.example'),
            true,
        );
    });

    it('uses only the first entry of a comma-separated x-forwarded-host', () => {
        assert.equal(
            isAllowedOrigin('https://music.example', 'localhost:4333', 'music.example, other'),
            true,
        );
        assert.equal(
            isAllowedOrigin(
                'https://evil.example',
                'localhost:4333',
                'music.example, evil.example',
            ),
            false,
        );
    });

    it('handles x-forwarded-host arriving as an array', () => {
        assert.equal(
            isAllowedOrigin('https://music.example', 'localhost:4333', ['music.example']),
            true,
        );
    });
});
