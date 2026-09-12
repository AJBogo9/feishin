import process from 'node:process';

export interface ManagedMpv {
    mpvPlayer?: MpvChildProcess | null;
    quit(): Promise<void>;
    stop(): Promise<void>;
}

export interface MpvChildProcess {
    kill(signal?: string): void;
    pid?: number;
}

export interface MpvCreateData {
    extraParameters?: string[];
    properties?: Record<string, any>;
}

export interface MpvSupervisor<T extends ManagedMpv> {
    getInstance(): null | T;
    reload(data: MpvCreateData): Promise<null | T>;
    shutdown(): Promise<void>;
    whenIdle(): Promise<void>;
}

export interface MpvSupervisorOptions<T extends ManagedMpv> extends MpvTeardownOptions<T> {
    create: (data: MpvCreateData) => Promise<T>;
}

export interface MpvTeardownOptions<T extends ManagedMpv> {
    /** Runs only once the mpv process is confirmed gone. */
    cleanupSocket?: () => Promise<void>;
    isAlive?: (instance: T) => boolean;
    log?: (message: string) => void;
    /** Budget for each teardown step: stop, quit, and each kill signal. */
    timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3000;
const ALIVE_POLL_MS = 25;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * node-mpv only settles stop()/quit() when mpv answers over its IPC socket, and it has no
 * reply timeout. A wedged mpv (typically blocked on a stream that died while the machine was
 * asleep) would otherwise hang the caller forever, which is what leaves the window unclosable.
 */
export const settleOrTimeout = async (work: Promise<unknown>, ms: number): Promise<boolean> => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
    });

    try {
        return await Promise.race([
            work.then(
                () => true,
                () => true,
            ),
            timeout,
        ]);
    } finally {
        clearTimeout(timer);
    }
};

const defaultIsAlive = (instance: ManagedMpv): boolean => {
    const pid = instance.mpvPlayer?.pid;
    if (!pid) {
        return false;
    }

    try {
        // Signal 0 performs the existence/permission check without delivering a signal.
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

/**
 * Sends a signal to the mpv child process.
 *
 * node-mpv exposes the spawned child as `mpvPlayer`; reading `process`/`mpvProcess` instead
 * silently turns every force-kill fallback into a no-op.
 */
export const killMpvChild = (
    instance: ManagedMpv,
    signal: string,
    log?: (message: string) => void,
): boolean => {
    const child = instance.mpvPlayer;
    if (!child || typeof child.kill !== 'function') {
        return false;
    }

    try {
        child.kill(signal);
        return true;
    } catch (error) {
        log?.(`Failed to send ${signal} to mpv: ${String(error)}`);
        return false;
    }
};

/**
 * Tears an mpv instance down for good: ask nicely, then escalate, and only drop the IPC socket
 * once the process is actually gone.
 */
export const destroyMpv = async <T extends ManagedMpv>(
    instance: T,
    options: MpvTeardownOptions<T> = {},
): Promise<void> => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const log = (message: string) => options.log?.(message);
    const isAlive = () => (options.isAlive ? options.isAlive(instance) : defaultIsAlive(instance));

    const waitForExit = async () => {
        const deadline = Date.now() + timeoutMs;
        while (isAlive() && Date.now() < deadline) {
            await delay(ALIVE_POLL_MS);
        }
    };

    if (!(await settleOrTimeout(instance.stop(), timeoutMs))) {
        log('mpv did not answer stop() in time');
    }

    if (await settleOrTimeout(instance.quit(), timeoutMs)) {
        // node-mpv resolves quit() when mpv acknowledges the command, not when the process is
        // gone, so give it its own shutdown time before reaching for a signal.
        await waitForExit();
    } else {
        log('mpv did not answer quit() in time');
    }

    for (const signal of ['SIGTERM', 'SIGKILL']) {
        if (!isAlive()) {
            break;
        }

        log(`mpv is still alive after quit, sending ${signal}`);
        killMpvChild(instance, signal, log);
        await waitForExit();
    }

    // Only now is it safe to drop the socket file: while the process is alive, removing it
    // hides the running instance from node-mpv's "is one already listening?" probe, so the
    // next start spawns a duplicate alongside it instead of reusing it.
    await options.cleanupSocket?.();
};

/**
 * Owns the lifetime of the single mpv child process.
 *
 * Every create and teardown runs on one serialized chain, so two reloads can never have their
 * mpv processes in flight at the same time. That matters because all instances share one IPC
 * socket path: a second mpv silently takes the socket over, leaving the first one unreachable,
 * untracked, and still playing.
 */
export const createMpvSupervisor = <T extends ManagedMpv>(
    options: MpvSupervisorOptions<T>,
): MpvSupervisor<T> => {
    let instance: null | T = null;
    let chain: Promise<unknown> = Promise.resolve();
    let inFlight: null | { key: string; promise: Promise<null | T> } = null;

    const enqueue = <R>(task: () => Promise<R>): Promise<R> => {
        const run = chain.then(task, task);
        chain = run.catch(() => {});
        return run;
    };

    const dropCurrentInstance = async () => {
        const previous = instance;
        instance = null;
        if (previous) {
            await destroyMpv(previous, options);
        }
    };

    return {
        getInstance: () => instance,
        reload: (data) => {
            // The doubled powerMonitor resume (and any other repeated reload request) asks for
            // exactly what is already being built, so join that work instead of racing it.
            const key = JSON.stringify(data ?? {});
            if (inFlight && inFlight.key === key) {
                return inFlight.promise;
            }

            const promise = enqueue(async () => {
                await dropCurrentInstance();
                instance = await options.create(data);
                return instance;
            });

            const entry = { key, promise };
            inFlight = entry;
            const clear = () => {
                if (inFlight === entry) {
                    inFlight = null;
                }
            };
            promise.then(clear, clear);

            return promise;
        },
        shutdown: () => enqueue(dropCurrentInstance),
        whenIdle: async () => {
            // Awaiting the tail can let a queued caller append more work, so drain until the
            // chain stops moving.
            let tail = chain;
            for (;;) {
                await tail.catch(() => {});
                if (tail === chain) {
                    return;
                }
                tail = chain;
            }
        },
    };
};

/**
 * Electron delivers powerMonitor 'resume' twice for a single wake on Linux, a few milliseconds
 * apart. Collapse bursts so one wake triggers one mpv reload.
 */
export const createResumeCoalescer = (
    windowMs: number,
    handler: () => void,
    now: () => number = () => Date.now(),
) => {
    let last = Number.NEGATIVE_INFINITY;

    return (): boolean => {
        const timestamp = now();
        if (timestamp - last < windowMs) {
            return false;
        }

        last = timestamp;
        handler();
        return true;
    };
};
