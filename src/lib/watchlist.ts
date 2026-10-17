import { computed } from 'vue';
import { state, toast } from '@/lib/store';
import type { WatchedPlayer } from '@/types';

/**
 * Players to keep an eye on (a known troublemaker, a new recruit, staff).
 * They are starred everywhere, have their own tab, and the app tells you
 * when one joins any server. Saved in the preferences.
 */
export const watchedIds = computed(() => new Set(state.preferences.watchlist.map((entry) => entry.steamId)));

export function isWatched(steamId: string): boolean {
    return watchedIds.value.has(steamId);
}

export function watchedEntry(steamId: string): WatchedPlayer | null {
    return state.preferences.watchlist.find((entry) => entry.steamId === steamId) ?? null;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Change the list one change after another, each on the list as the last
 * one left it: two stars clicked quickly would otherwise both start from
 * the same old list, and the second save would drop the first star.
 */
function save(change: (watchlist: WatchedPlayer[]) => WatchedPlayer[]): Promise<void> {
    const run = queue.then(async () => {
        state.preferences = await window.panel.preferences.set({ watchlist: change(state.preferences.watchlist) });
    });
    queue = run.catch(() => undefined);

    return run;
}

export async function toggleWatch(player: { steamId: string; name: string }): Promise<void> {
    const watching = !isWatched(player.steamId);

    await save((watchlist) =>
        watching
            ? [...watchlist.filter((entry) => entry.steamId !== player.steamId), { steamId: player.steamId, name: player.name, note: '', addedAt: new Date().toISOString() }]
            : watchlist.filter((entry) => entry.steamId !== player.steamId),
    );

    if (isWatched(player.steamId) !== watching) {
        toast('error', watching ? `Could not watch ${player.name}` : `Could not stop watching ${player.name}`, 'The watch list could not be saved. Try again.');
    } else if (watching) {
        toast('info', `Watching ${player.name}`, 'You get a notice when they join any server.');
    } else {
        toast('info', `Stopped watching ${player.name}`);
    }
}

export async function setWatchNote(steamId: string, note: string): Promise<void> {
    await save((watchlist) => watchlist.map((entry) => (entry.steamId === steamId ? { ...entry, note } : entry)));
}

/** Keep the saved name current when a watched player renames. */
export async function refreshWatchedNames(players: { steamId: string; name: string }[]): Promise<void> {
    const renamed = (entry: WatchedPlayer) => players.find((player) => player.steamId === entry.steamId && player.name !== entry.name);

    if (state.preferences.watchlist.some(renamed)) {
        await save((watchlist) => watchlist.map((entry) => ({ ...entry, name: renamed(entry)?.name ?? entry.name })));
    }
}
