<script setup lang="ts">
import { Ban, MessageSquare, Star, UserMinus, UserX, Users } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import SearchField from '@/components/SearchField.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { ago, number, pingLevel, ratio } from '@/lib/format';
import { openPlayerAction, openPlayerMenu } from '@/lib/playerActions';
import { now, selectedLive, state } from '@/lib/store';
import { isWatched, toggleWatch, watchedEntry } from '@/lib/watchlist';

/**
 * Everyone on the server, filtered by faction, the watchlist and the
 * sidebar search, sorted by name, score or ping. Clicking a player opens
 * them on the right; right-click for every action; arrow keys move. The
 * Left tab keeps players who just quit, so they can still be banned.
 */
const faction = computed({ get: () => state.playersTab, set: (value: string) => (state.playersTab = value) });
const sort = ref<'name' | 'kills' | 'ping'>('name');

const live = selectedLive;
const factions = computed(() => live.value?.status?.factions ?? []);

const tabs = computed(() => [
    { id: 'all', label: 'All', count: live.value?.players.length ?? 0 },
    ...factions.value.map((entry) => ({ id: entry.name, label: entry.name, count: entry.players })),
    { id: 'watched', label: 'Watched', count: (live.value?.players ?? []).filter((player) => isWatched(player.steamId)).length },
    { id: 'left', label: 'Left', count: left.value.length },
]);

const left = computed(() => (state.selectedId ? state.left[state.selectedId] ?? [] : []));

const leftShown = computed(() => {
    const term = state.search.trim().toLowerCase();

    return left.value.filter((player) => term === '' || player.name.toLowerCase().includes(term) || player.steamId.includes(term));
});

const players = computed(() => {
    const term = state.search.trim().toLowerCase();

    return (live.value?.players ?? [])
        .filter((player) => faction.value === 'all' || (faction.value === 'watched' ? isWatched(player.steamId) : player.faction === faction.value))
        .filter((player) => term === '' || player.name.toLowerCase().includes(term) || player.steamId.includes(term))
        .sort((a, b) => (sort.value === 'kills' ? b.kills - a.kills || a.deaths - b.deaths : sort.value === 'ping' ? b.pingMs - a.pingMs : 0));
});

function select(steamId: string): void {
    state.selectedPlayer = state.selectedPlayer === steamId ? null : steamId;
}

function onKey(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || document.querySelector('[role="dialog"]')) {
        return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const index = players.value.findIndex((player) => player.steamId === state.selectedPlayer);
        const next = players.value[Math.min(players.value.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];

        if (next) {
            state.selectedPlayer = next.steamId;
            document.getElementById(`player-${next.steamId}`)?.scrollIntoView({ block: 'nearest' });
        }
    } else if (event.key === 'Escape') {
        state.selectedPlayer = null;
    }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
    <ViewHeader v-model:tab="faction" title="Players" :subtitle="live?.status ? `${live.status.players} of ${live.status.maxPlayers} slots filled` : 'Who is on the server'" :tabs="tabs">
    </ViewHeader>

    <div class="toolbar">
        <SearchField placeholder="Search players by name or Steam ID" :count="faction === 'left' ? leftShown.length : players.length" />
        <div v-if="faction !== 'left'" class="sort">
            <span class="sort-label">Sort</span>
            <div class="segmented" role="group" aria-label="Sort">
                <button type="button" :class="{ on: sort === 'name' }" @click="sort = 'name'">Name</button>
                <button type="button" :class="{ on: sort === 'kills' }" @click="sort = 'kills'">Score</button>
                <button type="button" :class="{ on: sort === 'ping' }" @click="sort = 'ping'">Ping</button>
            </div>
        </div>
    </div>

    <div class="view-body flush" @contextmenu.self.prevent>

        <!-- Players who left this server since the app opened -->
        <template v-if="faction === 'left'">
            <div class="head left-grid">
                <span>Player</span>
                <span>Steam ID</span>
                <span class="right">K / D</span>
                <span class="right">Left</span>
                <span />
            </div>
            <div v-for="player in leftShown" :key="player.steamId" class="row left-grid gone" @contextmenu="openPlayerMenu($event, player, false)">
                <span class="c-name">
                    <span class="swatch" :style="{ background: player.factionColor ?? 'var(--faint)' }" />
                    <span class="truncate">{{ player.name }}</span>
                    <Star v-if="isWatched(player.steamId)" class="star" />
                </span>
                <span class="mono muted">{{ player.steamId }}</span>
                <span class="right num muted">{{ player.kills }} / {{ player.deaths }}</span>
                <span class="right muted">{{ ago(new Date(player.leftAt).toISOString(), now) }}</span>
                <span class="c-tools shown">
                    <button type="button" class="tool" :title="isWatched(player.steamId) ? 'Stop watching' : 'Watch'" @click="toggleWatch(player)"><Star :class="{ starred: isWatched(player.steamId) }" /></button>
                    <button type="button" class="tool bad" title="Ban" @click="openPlayerAction('ban', player)"><Ban /></button>
                </span>
            </div>
            <div v-if="leftShown.length === 0" class="empty">
                <UserMinus />
                <span>Nobody has left since the app opened. Players who quit show up here, so you can still ban them.</span>
            </div>
        </template>

        <template v-else>
        <div class="head">
            <span class="c-name">Player</span>
            <span class="c-num">K</span>
            <span class="c-num">D</span>
            <span class="c-num">K/D</span>
            <span class="c-cash">Cash</span>
            <span class="c-ping">Ping</span>
            <span class="c-tools" />
        </div>

        <div
            v-for="player in players"
            :id="`player-${player.steamId}`"
            :key="player.steamId"
            class="row player"
            :class="{ active: state.selectedPlayer === player.steamId }"
            @click="select(player.steamId)"
            @contextmenu="openPlayerMenu($event, player)"
        >
            <span class="c-name">
                <span class="swatch" :style="{ background: player.factionColor ?? 'var(--faint)' }" />
                <span class="truncate">{{ player.name }}</span>
                <Star v-if="isWatched(player.steamId)" class="star" :title="watchedEntry(player.steamId)?.note || 'Watched'" />
            </span>
            <span class="c-num num">{{ player.kills }}</span>
            <span class="c-num num muted">{{ player.deaths }}</span>
            <span class="c-num num kd">{{ ratio(player.kills, player.deaths) }}</span>
            <span class="c-cash num muted">${{ number(player.cash) }}</span>
            <span class="c-ping num" :class="`ping-${pingLevel(player.pingMs)}`">{{ player.pingMs }}</span>
            <span class="c-tools">
                <button type="button" class="tool" :title="isWatched(player.steamId) ? 'Stop watching' : 'Watch'" @click.stop="toggleWatch(player)"><Star :class="{ starred: isWatched(player.steamId) }" /></button>
                <button type="button" class="tool" title="Message" @click.stop="openPlayerAction('message', player)"><MessageSquare /></button>
                <button type="button" class="tool bad" title="Kick" @click.stop="openPlayerAction('kick', player)"><UserX /></button>
            </span>
        </div>

        <div v-if="live && players.length === 0" class="empty">
            <Users />
            <span>{{ !live.online ? 'The server is offline.' : state.search ? 'Nobody matches that search.' : faction === 'watched' ? 'No watched player is on. Star players to watch them.' : 'Nobody is playing right now.' }}</span>
        </div>
        </template>
    </div>
</template>

<style scoped>
.flush {
    padding: 9px 0 26.5px;
}

.kd {
    color: var(--text);
    font-weight: 600;
}

.left-grid {
    display: grid;
    grid-template-columns: minmax(154px, 1fr) 176px 77px 88px 70.5px;
    align-items: center;
    gap: 11px;
    padding: 0 24px 0 33px;
}

.gone {
    min-height: 44px;
    cursor: default;
}

.right {
    text-align: right;
}

.shown {
    opacity: 1 !important;
}

.star {
    width: 13px;
    height: 13px;
    flex: none;
    color: var(--warn);
    fill: var(--warn);
}

.starred {
    color: var(--warn);
    fill: var(--warn);
}

.sort {
    display: flex;
    align-items: center;
    gap: 11px;
}

.sort-label {
    color: var(--faint);
    font-family: var(--font-title);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.head,
.player {
    display: grid;
    grid-template-columns: minmax(154px, 1fr) 44px 44px 57px 97px 57px 101px;
    align-items: center;
    gap: 11px;
    padding: 0 24px 0 33px;
}

.head {
    height: 37.5px;
    color: var(--faint);
    font-size: 12.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.player {
    min-height: 44px;
    font-size: 15px;
}

.c-name {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}

.c-num,
.c-cash,
.c-ping {
    text-align: right;
}

.swatch {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    flex: none;
}

.ping-good {
    color: var(--ok);
}

.ping-fair {
    color: var(--warn);
}

.ping-poor {
    color: var(--bad);
}

.c-tools {
    display: flex;
    justify-content: flex-end;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.1s;
}

.player:hover .c-tools,
.player.active .c-tools {
    opacity: 1;
}

.tool {
    display: grid;
    place-items: center;
    width: 28.5px;
    height: 28.5px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
}

.tool:hover {
    background: rgb(255 255 255 / 0.06);
    color: var(--text);
}

.tool.bad:hover {
    color: var(--bad);
}

.tool svg {
    width: 15.5px;
    height: 15.5px;
}
</style>
