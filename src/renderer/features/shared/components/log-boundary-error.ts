import { logger } from '/@/renderer/utils/logger';

interface BoundaryErrorInfo {
    componentStack?: null | string;
}

/**
 * Error boundaries swallow render crashes into a fallback UI, so without this the only trace of a
 * crash is whatever the user happened to read on screen. The component stack is the part that
 * actually identifies the culprit (React's minified error codes never do), and the renderer bundle
 * ships sourcemaps, so the minified frames in it can be mapped back to real files and lines.
 *
 * The logger round-trips its meta through JSON, where an Error serializes to `{}`, so pull the
 * message and stack out as plain strings first.
 */
export const logBoundaryError = (
    boundary: string,
    error: unknown,
    errorInfo?: BoundaryErrorInfo,
) => {
    const isError = error instanceof Error;

    logger.error(`${boundary} caught a render error`, {
        componentStack: errorInfo?.componentStack ?? undefined,
        message: isError ? error.message : String(error),
        stack: isError ? error.stack : undefined,
    });
};
