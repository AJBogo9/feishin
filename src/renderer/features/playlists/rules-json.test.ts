import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseRulesJsonToSaveArgs } from './rules-json.ts';

describe('parseRulesJsonToSaveArgs', () => {
    it('accepts an "all" root', () => {
        const rules = { all: [{ is: { title: 'x' } }] };
        assert.deepEqual(parseRulesJsonToSaveArgs(rules).filter, rules);
    });

    it('accepts an "any" root', () => {
        const rules = { any: [{ is: { title: 'x' } }] };
        assert.deepEqual(parseRulesJsonToSaveArgs(rules).filter, rules);
    });

    it('accepts an empty rule array the user wrote deliberately', () => {
        assert.deepEqual(parseRulesJsonToSaveArgs({ all: [] }).filter, { all: [] });
    });

    it('rejects a mistyped root key instead of silently matching everything', () => {
        // The bug: this fell through to { all: [] } and Save and Replace wiped the real rules.
        assert.throws(() => parseRulesJsonToSaveArgs({ alll: [{ is: { title: 'x' } }] }));
    });

    it('rejects JSON trimmed down to just a limit', () => {
        assert.throws(() => parseRulesJsonToSaveArgs({ limit: 50 }));
    });

    it('rejects both root keys at once, which has no defined meaning', () => {
        assert.throws(() => parseRulesJsonToSaveArgs({ all: [], any: [] }));
    });

    it('rejects a root key that is not an array', () => {
        assert.throws(() => parseRulesJsonToSaveArgs({ all: { is: { title: 'x' } } }));
        assert.throws(() => parseRulesJsonToSaveArgs({ all: 'everything' }));
        assert.throws(() => parseRulesJsonToSaveArgs({ any: null }));
    });

    it('rejects empty and non-object input', () => {
        assert.throws(() => parseRulesJsonToSaveArgs({}));
        assert.throws(() => parseRulesJsonToSaveArgs(null as any));
        assert.throws(() => parseRulesJsonToSaveArgs([] as any));
    });

    it('carries limit, limitPercent and sort through as extra filters', () => {
        const { extraFilters } = parseRulesJsonToSaveArgs({
            all: [],
            limit: 50,
            limitPercent: 10,
            sort: 'title',
        });

        assert.deepEqual(extraFilters, { limit: 50, limitPercent: 10, sortBy: ['title'] });
    });

    it('omits extra filters that are absent', () => {
        assert.deepEqual(parseRulesJsonToSaveArgs({ all: [] }).extraFilters, {});
    });

    it('keeps a limit of 0 rather than dropping it as falsy', () => {
        assert.equal(parseRulesJsonToSaveArgs({ all: [], limit: 0 }).extraFilters.limit, 0);
    });
});
