import assert from 'node:assert/strict';
import test from 'node:test';

import { createMpvSupervisor, createResumeCoalescer, type ManagedMpv } from './mpv-lifecycle.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const never = () => new Promise<void>(() => {});

class FakeMpv implements ManagedMpv {
    alive = true;

    events: string[];

    id: number;

    killSignals: string[] = [];

    lingerMs = 0;

    mpvPlayer: null | { kill: (signal?: string) => void; pid?: number } = null;

    wedged: boolean;

    constructor(id: number, events: string[], wedged = false) {
        this.id = id;
        this.events = events;
        this.wedged = wedged;
        this.mpvPlayer = {
            kill: (signal?: string) => {
                this.killSignals.push(signal ?? 'SIGTERM');
                this.events.push(`kill#${this.id}:${signal ?? 'SIGTERM'}`);
                // A wedged mpv ignores SIGTERM; only SIGKILL takes it down.
                if (!this.wedged || signal === 'SIGKILL') {
                    this.alive = false;
                }
            },
            pid: 1000 + this.id,
        };
    }

    async quit(): Promise<void> {
        this.events.push(`quit-start#${this.id}`);
        if (this.wedged) {
            return never();
        }
        await delay(15);
        if (this.lingerMs) {
            // A real mpv answers "quit" over IPC and only then winds its process down.
            setTimeout(() => {
                this.alive = false;
            }, this.lingerMs);
        } else {
            this.alive = false;
        }
        this.events.push(`quit-done#${this.id}`);
    }

    async stop(): Promise<void> {
        this.events.push(`stop-start#${this.id}`);
        if (this.wedged) {
            return never();
        }
        await delay(5);
        this.events.push(`stop-done#${this.id}`);
    }
}

const supervisorWith = (
    options: { createDelayMs?: number; lingerMs?: number; wedged?: boolean } = {},
) => {
    const events: string[] = [];
    const spawned: FakeMpv[] = [];

    const supervisor = createMpvSupervisor<FakeMpv>({
        cleanupSocket: async () => {
            events.push(`cleanup-socket(alive=${spawned.filter((mpv) => mpv.alive).length})`);
        },
        create: async (data) => {
            const instance = new FakeMpv(spawned.length + 1, events, options.wedged);
            instance.lingerMs = options.lingerMs ?? 0;
            spawned.push(instance);
            events.push(`create#${instance.id}:${JSON.stringify(data.properties ?? {})}`);
            await delay(options.createDelayMs ?? 20);
            return instance;
        },
        isAlive: (instance) => instance.alive,
        timeoutMs: 50,
    });

    return { events, spawned, supervisor };
};

test('overlapping reloads with the same parameters spawn a single mpv process', async () => {
    // The bug: Electron delivers powerMonitor 'resume' twice on wake, the renderer fires two
    // reloads ~12 ms apart, and each one spawns its own mpv. The loser is never tracked again,
    // so it keeps playing and nothing can stop it.
    const { spawned, supervisor } = supervisorWith({ createDelayMs: 30 });

    const first = supervisor.reload({});
    await delay(12);
    const second = supervisor.reload({});
    await Promise.all([first, second]);

    assert.equal(spawned.length, 1, 'expected exactly one mpv process to be spawned');
    assert.equal(supervisor.getInstance(), spawned[0], 'the spawned instance must be tracked');
});

test('a reload with new parameters is not swallowed by one already in flight', async () => {
    const { spawned, supervisor } = supervisorWith({ createDelayMs: 30 });

    const first = supervisor.reload({ properties: { volume: 30 } });
    await delay(12);
    const second = supervisor.reload({ properties: { volume: 80 } });
    await Promise.all([first, second]);

    assert.equal(spawned.length, 2, 'the new parameters must be applied to a fresh instance');
    assert.equal(supervisor.getInstance(), spawned[1]);
    assert.equal(spawned[0].alive, false, 'the superseded instance must not survive');
});

test('a reload finishes tearing down the previous instance before creating the next', async () => {
    const { events, spawned, supervisor } = supervisorWith();

    await supervisor.reload({});
    await supervisor.reload({});

    assert.equal(spawned.length, 2);
    assert.deepEqual(
        events.filter((entry) => !entry.startsWith('cleanup-socket')),
        [
            'create#1:{}',
            'stop-start#1',
            'stop-done#1',
            'quit-start#1',
            'quit-done#1',
            'create#2:{}',
        ],
        'teardown of the old instance must complete before a new one is created',
    );
});

test('a wedged instance is killed instead of hanging the reload forever', async () => {
    // node-mpv resolves stop()/quit() only when mpv answers over IPC, and it has no reply
    // timeout. After a resume, mpv can be wedged on a dead stream and never answer.
    const { spawned, supervisor } = supervisorWith({ wedged: true });

    await supervisor.reload({});
    const wedged = spawned[0];

    await supervisor.reload({});

    assert.deepEqual(
        wedged.killSignals,
        ['SIGTERM', 'SIGKILL'],
        'a wedged instance must be escalated to SIGKILL',
    );
    assert.equal(wedged.alive, false, 'the wedged process must be gone');
    assert.equal(spawned.length, 2);
    assert.equal(supervisor.getInstance(), spawned[1]);
});

test('an mpv that is already winding down is not signalled', async () => {
    // node-mpv resolves quit() as soon as mpv acknowledges the command, before the process is
    // actually gone. Signalling straight away would cut its own shutdown short.
    const { spawned, supervisor } = supervisorWith({ lingerMs: 20 });

    await supervisor.reload({});
    const first = spawned[0];
    await supervisor.reload({});

    assert.deepEqual(first.killSignals, [], 'a cleanly quitting mpv must not be signalled');
    assert.equal(first.alive, false);
});

test('the ipc socket is only removed once the old process is gone', async () => {
    // Removing the socket file while the old mpv is alive is what makes node-mpv's
    // "is an instance already listening?" probe miss it and spawn a duplicate.
    const { events, supervisor } = supervisorWith({ wedged: true });

    await supervisor.reload({});
    await supervisor.shutdown();

    const cleanups = events.filter((entry) => entry.startsWith('cleanup-socket'));
    assert.ok(cleanups.length > 0, 'the socket must be cleaned up');
    cleanups.forEach((entry) => {
        assert.equal(entry, 'cleanup-socket(alive=0)', 'socket removed while mpv was still alive');
    });
});

test('shutdown leaves no tracked instance behind', async () => {
    const { spawned, supervisor } = supervisorWith();

    await supervisor.reload({});
    await supervisor.shutdown();

    assert.equal(supervisor.getInstance(), null);
    assert.equal(spawned[0].alive, false);
});

test('whenIdle resolves only after an in-flight reload has produced its instance', async () => {
    // player-get-audio-devices must not spawn a throwaway mpv next to one that is starting.
    const { spawned, supervisor } = supervisorWith({ createDelayMs: 40 });

    const reload = supervisor.reload({});
    await supervisor.whenIdle();

    assert.equal(spawned.length, 1);
    assert.equal(supervisor.getInstance(), spawned[0]);
    await reload;
});

test('duplicate resume events inside the coalescing window run the handler once', async () => {
    let calls = 0;
    const onResume = createResumeCoalescer(1000, () => {
        calls += 1;
    });

    onResume();
    await delay(12);
    onResume();

    assert.equal(calls, 1, 'the doubled powerMonitor resume event must be coalesced');
});

test('a resume after the coalescing window runs the handler again', async () => {
    let calls = 0;
    const onResume = createResumeCoalescer(30, () => {
        calls += 1;
    });

    onResume();
    await delay(50);
    onResume();

    assert.equal(calls, 2, 'a genuine second wake must still reload mpv');
});
