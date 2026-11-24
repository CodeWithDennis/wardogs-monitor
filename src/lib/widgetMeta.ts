import { Activity, Swords, Trophy, Zap } from 'lucide-vue-next';
import type { Component } from 'vue';
import type { WidgetKind } from '@/types';

/**
 * The widgets, as the main window offers them: small always-on-top windows
 * (electron/widgets.mjs) showing one thing about one server. Any number can
 * be open at once, one of each kind per server.
 */
export const WIDGETS: { kind: WidgetKind; label: string; description: string; icon: Component }[] = [
    { kind: 'status', label: 'Status', description: 'Map, mode, score race and player count at a glance.', icon: Activity },
    { kind: 'score', label: 'Score', description: 'The faction race to 100, big enough to read over the game.', icon: Swords },
    { kind: 'players', label: 'Top players', description: 'The leaderboard by kills, with deaths and K/D.', icon: Trophy },
    { kind: 'actions', label: 'Quick actions', description: 'Broadcast, restart or end the match without opening the app.', icon: Zap },
];
