import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { useItemListPagination } from '/@/renderer/components/item-list/item-list-pagination/use-item-list-pagination';
import { ItemListHandle } from '/@/renderer/components/item-list/types';
import { useListContext } from '/@/renderer/context/list-context';
import { eventEmitter } from '/@/renderer/events/event-emitter';
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import { PlaylistDetailAlbumView } from '/@/renderer/features/playlists/components/playlist-detail-album-view';
import { usePlaylistTrackList } from '/@/renderer/features/playlists/hooks/use-playlist-track-list';
import { reconcilePlaylistEditItems } from '/@/renderer/features/playlists/reconcile-playlist-edit-items';
import { reorderPlaylistItems } from '/@/renderer/features/playlists/utils/playlist-reorder';
import { useCurrentServer, useListSettings } from '/@/renderer/store';
import { Spinner } from '/@/shared/components/spinner/spinner';
import {
    LibraryItem,
    PlaylistSongListQuery,
    PlaylistSongListResponse,
    Song,
} from '/@/shared/types/domain-types';
import {
    ItemListKey,
    ListDisplayType,
    ListPaginationType,
    TableColumn,
} from '/@/shared/types/types';

const PlaylistDetailSongListTable = lazy(() =>
    import('/@/renderer/features/playlists/components/playlist-detail-song-list-table').then(
        (module) => ({
            default: module.PlaylistDetailSongListTable,
        }),
    ),
);

const PlaylistDetailSongListEditTable = lazy(() =>
    import('/@/renderer/features/playlists/components/playlist-detail-song-list-table').then(
        (module) => ({
            default: module.PlaylistDetailSongListEditTable,
        }),
    ),
);

const PlaylistDetailSongListGrid = lazy(() =>
    import('/@/renderer/features/playlists/components/playlist-detail-song-list-grid').then(
        (module) => ({
            default: module.PlaylistDetailSongListGrid,
        }),
    ),
);

export const PlaylistDetailSongListContent = () => {
    const { playlistId } = useParams() as { playlistId: string };
    const server = useCurrentServer();
    const queryClient = useQueryClient();

    const playlistSongsQuery = useSuspenseQuery(
        playlistsQueries.songList({
            query: {
                id: playlistId,
            },
            serverId: server?.id,
        }),
    );

    useEffect(() => {
        const handleRefresh = async (payload: { key: string }) => {
            if (
                payload.key !== ItemListKey.PLAYLIST_SONG &&
                payload.key !== ItemListKey.PLAYLIST_ALBUM
            ) {
                return;
            }

            const queryKey = playlistsQueries.songList({
                query: {
                    id: playlistId,
                },
                serverId: server?.id,
            }).queryKey;

            await queryClient.invalidateQueries({ queryKey });
            await queryClient.refetchQueries({ queryKey });
        };

        eventEmitter.on('ITEM_LIST_REFRESH', handleRefresh);

        return () => {
            eventEmitter.off('ITEM_LIST_REFRESH', handleRefresh);
        };
    }, [playlistId, queryClient, server?.id]);

    return (
        <Suspense fallback={<Spinner container />}>
            <PlaylistDetailSongList data={playlistSongsQuery.data} />
        </Suspense>
    );
};

export type OverridePlaylistSongListQuery = Omit<Partial<PlaylistSongListQuery>, 'id'>;

interface PlaylistDetailSongListViewProps {
    data: PlaylistSongListResponse;
    items?: Song[];
}

export const PlaylistDetailSongListView = ({ data, items }: PlaylistDetailSongListViewProps) => {
    const server = useCurrentServer();
    const { display, itemsPerPage, pagination, table } = useListSettings(ItemListKey.PLAYLIST_SONG);
    const { currentPage, onChange: onPageChange } = useItemListPagination();
    const isPaginated = pagination === ListPaginationType.PAGINATED;

    const paginationProps = isPaginated
        ? {
              currentPage,
              itemsPerPage,
              onPageChange,
          }
        : undefined;

    switch (display) {
        case ListDisplayType.GRID: {
            return (
                <PlaylistDetailSongListGrid
                    data={data}
                    items={items}
                    serverId={server.id}
                    {...paginationProps}
                />
            );
        }
        case ListDisplayType.TABLE: {
            return (
                <PlaylistDetailSongListTable
                    autoFitColumns={table.autoFitColumns}
                    columns={table.columns}
                    data={data}
                    enableAlternateRowColors={table.enableAlternateRowColors}
                    enableHeader={table.enableHeader}
                    enableHorizontalBorders={table.enableHorizontalBorders}
                    enableRowHoverHighlight={table.enableRowHoverHighlight}
                    enableVerticalBorders={table.enableVerticalBorders}
                    items={items}
                    serverId={server.id}
                    size={table.size}
                    {...paginationProps}
                />
            );
        }
        default:
            return null;
    }
};

export const PlaylistDetailSongListEdit = ({ data }: { data: PlaylistSongListResponse }) => {
    const { playlistId } = useParams() as { playlistId: string };
    const server = useCurrentServer();
    const { display, table } = useListSettings(ItemListKey.PLAYLIST_SONG);

    const [localData, setLocalData] = useState<PlaylistSongListResponse>(data);

    const tableRef = useRef<ItemListHandle | null>(null);
    // Only reconcile once the user actually has pending edits worth protecting; until then a
    // refetch should just replace the buffer.
    const hasLocalEdits = useRef(false);

    // Edit mode used to snapshot the track list once, with nothing syncing later server state in.
    // Save and Replace posts this buffer as a full replacement, so tracks added to the playlist
    // from anywhere else while edit mode was open were silently removed on save.
    useEffect(() => {
        setLocalData((prev) => {
            if (!hasLocalEdits.current) {
                return data;
            }

            const items = reconcilePlaylistEditItems(prev.items ?? [], data.items ?? []);

            // Identity bail-out, load-bearing: without it every no-op refetch produces a new
            // array and re-fires the setListData effect below.
            const unchanged =
                items.length === (prev.items?.length ?? 0) &&
                items.every((item, index) => item === prev.items[index]);

            return unchanged ? prev : { ...data, items };
        });
    }, [data]);

    // Listen for playlist reorder events
    useEffect(() => {
        const handleReorder = (payload: {
            edge: 'bottom' | 'top' | null;
            playlistId: string;
            sourceIds: string[];
            targetId: string;
        }) => {
            // Only handle events for this playlist
            if (payload.playlistId !== playlistId) {
                return;
            }

            hasLocalEdits.current = true;

            setLocalData((prev) =>
                prev?.items ? { ...prev, items: reorderPlaylistItems(prev.items, payload) } : prev,
            );
        };

        eventEmitter.on('PLAYLIST_REORDER', handleReorder);

        return () => {
            eventEmitter.off('PLAYLIST_REORDER', handleReorder);
        };
    }, [playlistId]);

    const columns = useMemo(() => {
        return [
            {
                align: 'center' as 'center' | 'end' | 'start',
                id: TableColumn.PLAYLIST_REORDER,
                isEnabled: true,
                pinned: 'left' as 'left' | 'right' | null,
                width: 100,
            },
            ...table.columns,
        ];
    }, [table.columns]);

    const { setItemCount, setListData } = useListContext();

    useEffect(() => {
        setListData?.(localData.items);
        // Feed the badge from the same buffer as the list. It otherwise kept the pre-edit count,
        // and entering edit mode with a client-side filter active left it on the filtered count.
        setItemCount?.(localData.items.length);
    }, [localData, setItemCount, setListData]);

    switch (display) {
        case ListDisplayType.GRID:
        case ListDisplayType.TABLE: {
            return (
                <PlaylistDetailSongListEditTable
                    autoFitColumns={table.autoFitColumns}
                    columns={columns}
                    data={localData}
                    enableAlternateRowColors={table.enableAlternateRowColors}
                    enableHeader={table.enableHeader}
                    enableHorizontalBorders={table.enableHorizontalBorders}
                    enableRowHoverHighlight={table.enableRowHoverHighlight}
                    enableVerticalBorders={table.enableVerticalBorders}
                    ref={tableRef}
                    serverId={server.id}
                    size={table.size}
                />
            );
        }
        default:
            return null;
    }
};

const PlaylistDetailTrackView = ({ data }: { data: PlaylistSongListResponse }) => {
    const { isSmartPlaylist, mode } = useListContext();

    if (isSmartPlaylist) {
        return <PlaylistDetailTrackViewContent data={data} />;
    }

    if (mode === 'edit') {
        return <PlaylistDetailSongListEdit data={data} />;
    }

    return <PlaylistDetailTrackViewContent data={data} />;
};

const PlaylistDetailTrackViewContent = ({ data }: { data: PlaylistSongListResponse }) => {
    const { sortedAndFilteredSongs } = usePlaylistTrackList(data);
    return <PlaylistDetailSongListView data={data} items={sortedAndFilteredSongs} />;
};

const PlaylistDetailSongList = ({ data }: { data: PlaylistSongListResponse }) => {
    const { displayMode, mode } = useListContext();

    if (mode !== 'edit' && displayMode === LibraryItem.ALBUM) {
        return <PlaylistDetailAlbumView data={data} />;
    }

    return <PlaylistDetailTrackView data={data} />;
};
