import type { NotificationData } from '@mantine/notifications';

import {
    cleanNotifications,
    cleanNotificationsQueue,
    notifications,
    notificationsStore,
    updateNotification,
    updateNotificationsState,
} from '@mantine/notifications';
import clsx from 'clsx';

import styles from './toast.module.css';

interface NotificationProps extends Omit<NotificationData, 'message'> {
    message?: string;
    onClose?: () => void;
    type?: 'error' | 'info' | 'success' | 'warning';
}

const getTitle = (type: NotificationProps['type']) => {
    if (type === 'success') return 'Success';
    if (type === 'warning') return 'Warning';
    if (type === 'error') return 'Error';
    return 'Info';
};

const showToast = ({ message, onClose, title, type, ...props }: NotificationProps) => {
    return notifications.show({
        ...props,
        classNames: {
            body: styles.body,
            closeButton: styles.closeButton,
            description: styles.description,
            loader: styles.loader,
            root: clsx(styles.root, {
                [styles.error]: type === 'error',
                [styles.info]: type === 'info',
                [styles.success]: type === 'success',
                [styles.warning]: type === 'warning',
            }),
            title: styles.title,
        },
        message: message ?? '',
        onClose,
        title: title ?? getTitle(type),
        withBorder: true,
        withCloseButton: true,
    });
};

/**
 * Remove a toast WITHOUT running its `onClose`.
 *
 * Mantine's `hideNotification` runs `onClose` first, so a programmatic hide is indistinguishable
 * from a user dismissal. Callers whose `onClose` means "the user cancelled this" (the player's
 * loading toast cancels its in-flight queries there) would otherwise cancel their own work at
 * the moment it succeeded.
 */
const dismissToast = (id: string) =>
    updateNotificationsState(notificationsStore, (all) => all.filter((n) => n.id !== id));

export const toast = {
    clean: cleanNotifications,
    cleanQueue: cleanNotificationsQueue,
    error: (props: NotificationProps) => showToast({ type: 'error', ...props }),
    hide: dismissToast,
    info: (props: NotificationProps) => showToast({ type: 'info', ...props }),
    show: showToast,
    success: (props: NotificationProps) => showToast({ type: 'success', ...props }),
    update: updateNotification,
    warn: (props: NotificationProps) => showToast({ type: 'warning', ...props }),
};
