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

async function save(watchlist: WatchedPlayer[]): Promise<void> {
    state.preferences = await window.panel.preferences.set({ watchlist });
}

export async function toggleWatch(player: { steamId: string; name: string }): Promise<void> {
    if (isWatched(player.steamId)) {
        await save(state.preferences.watchlist.filter((entry) => entry.steamId !== player.steamId));
        toast('info', `Stopped watching ${player.name}`);

        return;
    }

    await save([...state.preferences.watchlist, { steamId: player.steamId, name: player.name, note: '', addedAt: new Date().toISOString() }]);
    toast('info', `Watching ${player.name}`, 'You get a notice when they join any server.');
}

export async function setWatchNote(steamId: string, note: string): Promise<void> {
    await save(state.preferences.watchlist.map((entry) => (entry.steamId === steamId ? { ...entry, note } : entry)));
}

/** Keep the saved name current when a watched player renames. */
export async function refreshWatchedNames(players: { steamId: string; name: string }[]): Promise<void> {
    let changed = false;
    const next = state.preferences.watchlist.map((entry) => {
        const seen = players.find((player) => player.steamId === entry.steamId);

        if (seen && seen.name !== entry.name) {
            changed = true;

            return { ...entry, name: seen.name };
        }

        return entry;
    });

    if (changed) {
        await save(next);
    }
}
