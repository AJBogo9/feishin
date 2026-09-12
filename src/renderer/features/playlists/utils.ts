import { nanoid } from 'nanoid/non-secure';

import { NDSongQueryFields } from '/@/shared/api/navidrome/navidrome-types';
import { Album, LibraryItem, Song } from '/@/shared/types/domain-types';
import { QueryBuilderGroup } from '/@/shared/types/types';

export type PlaylistAlbumRow = Album & { _playlistSongs?: Song[] };

export function playlistSongsToAlbums(songs: Song[]): PlaylistAlbumRow[] {
    if (songs.length === 0) return [];

    const rows: PlaylistAlbumRow[] = [];
    let group: Song[] = [songs[0]];
    let prevAlbumId = songs[0].albumId;

    const pushRow = (song: Song, groupSongs: Song[]) => {
        rows.push({
            _itemType: LibraryItem.ALBUM,
            _playlistSongs: groupSongs,
            _serverId: song._serverId,
            _serverType: song._serverType,
            albumArtistName: song.albumArtistName,
            albumArtists: song.albumArtists,
            artists: song.artists,
            comment: song.comment,
            createdAt: song.createdAt,
            duration: null,
            explicitStatus: song.explicitStatus,
            genres: song.genres,
            id: song.albumId,
            imageId: song.imageId,
            imageUrl: song.imageUrl,
            isCompilation: song.compilation,
            lastPlayedAt: song.lastPlayedAt,
            mbzId: null,
            mbzReleaseGroupId: null,
            name: song.album ?? '',
            originalDate: null,
            originalYear: 0,
            participants: song.participants,
            playCount: null,
            recordLabels: [],
            releaseDate: song.releaseDate,
            releaseType: null,
            releaseTypes: [],
            releaseYear: song.releaseYear,
            size: null,
            songCount: null,
            sortName: song.album ?? '',
            tags: song.tags,
            trackYearRange: null,
            updatedAt: song.updatedAt,
            userFavorite: false,
            userRating: null,
            version: null,
        });
    };

    for (let i = 1; i < songs.length; i++) {
        const song = songs[i];
        if (song.albumId === prevAlbumId) {
            group.push(song);
        } else {
            pushRow(group[0], group);
            group = [song];
            prevAlbumId = song.albumId;
        }
    }
    pushRow(group[0], group);

    return rows;
}

// Hoisted: this was rebuilt per rule, twice per serialization, and serialization runs on every
// Preview, Save, Save As and builder/JSON toggle.
const ND_BOOLEAN_FIELDS = new Set(
    NDSongQueryFields.filter((queryField) => queryField.type === 'boolean').map(
        (queryField) => queryField.value,
    ),
);

/**
 * Serialize one builder rule into Navidrome query form.
 *
 * Shared by the root and nested paths on purpose: the nested serializer used to push rule.value
 * through untouched while only the root coerced the six boolean fields. The builder stores
 * booleans as the strings "true"/"false", so a nested Is Favorite / Is Compilation / Has CoverArt
 * / Missing rule was sent as a string and never matched. The inverse converter stringifies
 * booleans at every level, so the asymmetry also corrupted a Navidrome-authored playlist on a
 * plain open-and-save round trip.
 */
const serializeRule = (ruleField: string, ruleOperator: string, ruleValue: any) => {
    const [field, subField] = ruleField.split('.');
    const operator = mapDatePickerOperatorToApi(ruleOperator);
    let value: any = subField === 'releaseDate' ? new Date(ruleValue) : ruleValue;

    if (ND_BOOLEAN_FIELDS.has(field)) {
        value = value === 'true' || value === true;
    }

    return {
        [operator]: {
            [field]: value,
        },
    };
};

export const parseQueryBuilderChildren = (groups: QueryBuilderGroup[], data: any[]) => {
    if (groups.length === 0) {
        return data;
    }

    const filterGroups: any[] = [];

    for (const group of groups) {
        const rootType = group.type;
        const query: any = {
            [rootType]: [],
        };

        for (const rule of group.rules) {
            if (rule.field && rule.operator) {
                query[rootType].push(serializeRule(rule.field, rule.operator, rule.value));
            }
        }

        if (group.group.length > 0) {
            const b = parseQueryBuilderChildren(group.group, data);
            b.forEach((c) => query[rootType].push(c));
        }

        data.push(query);
        filterGroups.push(query);
    }

    return filterGroups;
};

// Convert QueryBuilderGroup to default query
export const convertQueryGroupToNDQuery = (filter: QueryBuilderGroup) => {
    const rootQueryType = filter.type;
    const rootQuery = {
        [rootQueryType]: [] as any[],
    };

    for (const rule of filter.rules) {
        if (rule.field && rule.operator) {
            rootQuery[rootQueryType].push(serializeRule(rule.field, rule.operator, rule.value));
        }
    }

    const groups = parseQueryBuilderChildren(filter.group, []);
    for (const group of groups) {
        rootQuery[rootQueryType].push(group);
    }

    return rootQuery;
};

// Convert default query to QueryBuilderGroup
export const convertNDQueryToQueryGroup = (query: Record<string, any>) => {
    const rootType = Object.keys(query)[0];
    const rootGroup: QueryBuilderGroup = {
        group: [],
        rules: [],
        type: rootType as 'all' | 'any',
        uniqueId: nanoid(),
    };

    for (const rule of query[rootType]) {
        if (rule.any || rule.all) {
            const group = convertNDQueryToQueryGroup(rule);
            rootGroup.group.push(group);
        } else {
            let operator = Object.keys(rule)[0];
            const field = Object.keys(rule[operator])[0];
            let value = rule[operator][field];

            // Test the value, not the field name. Every boolean-ish control in the builder is a
            // string Select, so a real boolean on any field (including one Navidrome authored on
            // a field Feishin does not list as boolean) would otherwise render as a blank box.
            if (typeof value === 'boolean') {
                value = String(value);
            }

            // Use date-picker operator in UI when value is date-like (e.g. YYYY-MM-DD); otherwise keep API operator
            operator = mapApiOperatorToDatePicker(operator, value);

            rootGroup.rules.push({
                field,
                operator,
                uniqueId: nanoid(),
                value,
            });
        }
    }

    return rootGroup;
};

const DATE_STRING_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isDateLikeValue(value: unknown): boolean {
    if (value instanceof Date) return true;
    if (typeof value === 'string') return DATE_STRING_REGEX.test(value.trim());
    return false;
}

function isDateRangeValue(value: unknown): value is [null | string, null | string] {
    if (!Array.isArray(value) || value.length !== 2) return false;
    const [a, b] = value;
    return (a == null || isDateLikeValue(a)) && (b == null || isDateLikeValue(b));
}

function mapApiOperatorToDatePicker(operator: string, value: unknown): string {
    if (operator === 'before' && isDateLikeValue(value)) return 'beforeDate';
    if (operator === 'after' && isDateLikeValue(value)) return 'afterDate';
    if (operator === 'inTheRange' && isDateRangeValue(value)) return 'inTheRangeDate';
    return operator;
}

function mapDatePickerOperatorToApi(operator: string): string {
    if (operator === 'beforeDate') return 'before';
    if (operator === 'afterDate') return 'after';
    if (operator === 'inTheRangeDate') return 'inTheRange';
    return operator;
}
