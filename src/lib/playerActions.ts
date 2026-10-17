import { ref } from 'vue';
import { act } from '@/lib/store';
import type { Player } from '@/types';

/**
 * The dialog for actions that need words or a choice (message, kick, ban,
 * move faction), opened from the player list and the player panel.
 */
export type PlayerActionMode = 'message' | 'kick' | 'ban' | 'faction';

export const playerAction = ref<{ mode: PlayerActionMode; player: Pick<Player, 'name' | 'steamId' | 'faction'> } | null>(null);

export function openPlayerAction(mode: PlayerActionMode, player: Pick<Player, 'name' | 'steamId' | 'faction'>): void {
    playerAction.value = { mode, player };
}

/** Killing needs no words: confirm and go. */
export function killPlayer(player: Pick<Player, 'name' | 'steamId'>): void {
    act('kill', { steamId: player.steamId, name: player.name }, {
        confirm: { title: `Kill ${player.name}?`, body: 'Their character dies and respawns as usual. Use it to free someone stuck or to stop a spawn camper.', confirmLabel: 'Kill', danger: true },
    });
}

/**
 * The right-click menu for a player, wherever one is listed. A player who
 * already left can still be banned, watched or looked up.
 */
export const playerMenu = ref<{ x: number; y: number; player: Pick<Player, 'name' | 'steamId' | 'faction'>; online: boolean } | null>(null);

export function openPlayerMenu(event: MouseEvent, player: Pick<Player, 'name' | 'steamId' | 'faction'>, online = true): void {
    event.preventDefault();
    playerMenu.value = { x: event.clientX, y: event.clientY, player, online };
}
