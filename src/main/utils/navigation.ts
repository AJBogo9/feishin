/**
 * Is the navigation target the same document the window is already showing?
 *
 * Chromium's default for an uncancelled drop is to navigate to the dropped file, and the window
 * loads from file://, so dragging an audio file anywhere outside a drop target replaced the whole
 * app with Chromium's file viewer. The frameless window has no menu bar and no reload accelerator,
 * so the only recovery was killing the app and losing the queue.
 *
 * Comparing origin plus pathname (rather than the whole URL) keeps the navigations the app relies
 * on: in-app hash routing, query changes, and Vite's HMR reloads. Note that for file:// URLs the
 * WHATWG origin is the string "null" on both sides, so pathname is what actually decides.
 */
export const isSameEntryDocument = (currentUrl: string, targetUrl: string): boolean => {
    try {
        const current = new URL(currentUrl);
        const target = new URL(targetUrl);

        return current.origin === target.origin && current.pathname === target.pathname;
    } catch {
        // An unparseable target is simply not the current document, so it gets blocked.
        return false;
    }
};
