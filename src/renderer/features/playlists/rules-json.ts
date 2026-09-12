/**
 * Parse the JSON-mode smart-playlist editor's text into save arguments.
 *
 * The root key is validated rather than guessed. The previous version picked `parsed.all ? 'all'
 * : 'any'` and then fell back to `{ all: [] }` when neither key was present, and `{ all: [] }` is
 * a query that matches the entire library. Nothing downstream checked the structure, so a
 * mistyped root key, or JSON trimmed down to just `{"limit":50}`, sailed through Save and Replace
 * and destroyed the playlist's rules on the server behind a generic "Are you sure" dialog.
 *
 * Throwing here is deliberate: the caller already converts a throw into a null and toasts.
 */
export const parseRulesJsonToSaveArgs = (
    parsed: Record<string, any>,
): {
    extraFilters: { limit?: number; limitPercent?: number; sortBy?: string[] };
    filter: Record<string, any>;
} => {
    const rootKeys = (['all', 'any'] as const).filter((key) => Array.isArray(parsed?.[key]));

    if (rootKeys.length !== 1) {
        throw new Error(
            'Rules must contain exactly one root key ("all" or "any") holding an array',
        );
    }

    const rootKey = rootKeys[0];

    return {
        extraFilters: {
            ...(parsed.limit != null && { limit: parsed.limit }),
            ...(parsed.limitPercent != null && { limitPercent: parsed.limitPercent }),
            ...(parsed.sort != null && { sortBy: [parsed.sort] }),
        },
        filter: { [rootKey]: parsed[rootKey] },
    };
};
