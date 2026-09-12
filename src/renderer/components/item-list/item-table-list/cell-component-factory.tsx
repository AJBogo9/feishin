import React from 'react';
import { CellComponentProps } from 'react-window-v2';

import { TableItemProps } from '/@/renderer/components/item-list/item-table-list/item-table-list';
import { ItemTableListColumn } from '/@/renderer/components/item-list/item-table-list/item-table-list-column';
import { LibraryItem } from '/@/shared/types/domain-types';
import { TableColumn } from '/@/shared/types/types';

export const createColumnCellComponent = (
    columnType: TableColumn,
    itemType: LibraryItem,
): React.ComponentType<CellComponentProps<TableItemProps>> => {
    // No custom comparator: its terms were a strict subset of ItemTableListColumn's own
    // memo, so it could only bail where that one already bails, or unsoundly. The single
    // sound gate lives there; this memo just avoids re-creating the element.
    return React.memo((props: CellComponentProps<TableItemProps>) => {
        return <ItemTableListColumn {...props} columnType={columnType} itemType={itemType} />;
    });
};

export const createColumnCellComponents = (
    columns: TableColumn[],
    itemType: LibraryItem,
): Map<TableColumn, React.ComponentType<CellComponentProps<TableItemProps>>> => {
    const componentMap = new Map<
        TableColumn,
        React.ComponentType<CellComponentProps<TableItemProps>>
    >();

    columns.forEach((columnType) => {
        componentMap.set(columnType, createColumnCellComponent(columnType, itemType));
    });

    return componentMap;
};
