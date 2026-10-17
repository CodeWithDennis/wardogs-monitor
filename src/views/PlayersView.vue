<script setup lang="ts">
import { ArrowDown, ArrowUp, Ban, MessageSquare, Star, UserMinus, UserX, Users } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted } from 'vue';
import SearchField from '@/components/SearchField.vue';
import TimeAgo from '@/components/TimeAgo.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { number, pingLevel, ratio } from '@/lib/format';
import { openPlayerAction, openPlayerMenu } from '@/lib/playerActions';
import { leaving, searchTerm, selectedLive, state } from '@/lib/store';
import { isWatched, toggleWatch, watchedEntry } from '@/lib/watchlist';
import type { Player } from '@/types';

/**
 * Everyone on the server, filtered by faction, the watchlist and the
 * page's search, sorted by clicking a column header. Clicking a player opens
 * them on the right; right-click for every action; arrow keys move. The
 * Left tab keeps players who just quit, so they can still be banned.
 */
const faction = computed({ get: () => state.playersTab, set: (value: string) => (state.playersTab = value) });
type SortKey = 'name' | 'kills' | 'deaths' | 'kd' | 'cash' | 'ping';

/** The sortable columns, and which way each sorts first: names A to Z, numbers highest first. */
const COLUMNS: { key: SortKey; label: string; title: string; className: string; firstDir: 'asc' | 'desc' }[] = [
    { key: 'name', label: 'Player', title: 'Sort by name', className: 'c-name', firstDir: 'asc' },
    { key: 'kills', label: 'K', title: 'Sort by kills', className: 'c-num', firstDir: 'desc' },
    { key: 'deaths', label: 'D', title: 'Sort by deaths', className: 'c-num c-deaths', firstDir: 'desc' },
    { key: 'kd', label: 'K/D', title: 'Sort by kills per death', className: 'c-num c-kd', firstDir: 'desc' },
    { key: 'cash', label: 'Cash', title: 'Sort by cash', className: 'c-cash', firstDir: 'desc' },
    { key: 'ping', label: 'Ping', title: 'Sort by ping', className: 'c-ping', firstDir: 'desc' },
];

function sortBy(key: SortKey): void {
    const column = COLUMNS.find((entry) => entry.key === key)!;
    state.playersSort = state.playersSort.key === key ? { key, dir: state.playersSort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: column.firstDir };
}

/** One collator for every comparison: far quicker than localeCompare with options, which builds a new one per call. */
const byText = new Intl.Collator();
const byName = new Intl.Collator(undefined, { sensitivity: 'base' });

const sortValue: Record<SortKey, (player: Player) => number | string> = {
    name: (player) => player.name.toLowerCase(),
    kills: (player) => player.kills,
    deaths: (player) => player.deaths,
    kd: (player) => (player.deaths === 0 ? player.kills : player.kills / player.deaths),
    cash: (player) => player.cash,
    ping: (player) => player.pingMs,
};

function compare(a: Player, b: Player): number {
    const { key, dir } = state.playersSort;
    const left = sortValue[key](a);
    const right = sortValue[key](b);
    const order = typeof left === 'string' ? byText.compare(left, right as string) : left - (right as number);

    // Ties fall back to the name, so the order never jumps around between readings.
    return (dir === 'asc' ? order : -order) || byName.compare(a.name, b.name);
}

const live = selectedLive;
const factions = computed(() => live.value?.status?.factions ?? []);

/**
 * The reading's players. Readings keep unchanged player objects (see
 * shareUnchanged in the store), so rows whose player did not change skip
 * re-rendering (v-memo below).
 */
const NOBODY: Player[] = [];
const livePlayers = computed(() => live.value?.players ?? NOBODY);

/** Each player's name in lower case, worked out once per player object instead of on every key. */
const lowerNames = new WeakMap<object, string>();
const lowerName = (player: { name: string }): string => {
    let lower = lowerNames.get(player);

    if (lower === undefined) {
        lower = player.name.toLowerCase();
        lowerNames.set(player, lower);
    }

    return lower;
};
const matches = (player: { name: string; steamId: string }, term: string) => term === '' || lowerName(player).includes(term) || player.steamId.includes(term);

const tabs = computed(() => [
    { id: 'all', label: 'All', count: livePlayers.value.length },
    ...factions.value.map((entry) => ({ id: entry.name, label: entry.name, count: entry.players })),
    { id: 'watched', label: 'Watched', count: livePlayers.value.filter((player) => isWatched(player.steamId)).length },
    { id: 'left', label: 'Left', count: left.value.length },
]);

const left = computed(() => (state.selectedId ? state.left[state.selectedId] ?? [] : []));

const leftShown = computed(() => left.value.filter((player) => matches(player, searchTerm.value)));

const players = computed(() => {
    const term = searchTerm.value;

    return livePlayers.value
        .filter((player) => (faction.value === 'all' || (faction.value === 'watched' ? isWatched(player.steamId) : player.faction === faction.value)) && matches(player, term))
        .sort(compare);
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
    </div>

    <div class="view-body flush" @contextmenu.self.prevent>

        <!-- Players who left this server since the app opened -->
        <template v-if="faction === 'left'">
            <div class="head left-grid">
                <span>Player</span>
                <span class="c-steam">Steam ID</span>
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
                <span class="mono muted c-steam truncate">{{ player.steamId }}</span>
                <span class="right num muted">{{ player.kills }} / {{ player.deaths }}</span>
                <TimeAgo class="right muted" :at="player.leftAt" />
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
        <div class="head" role="row">
            <button
                v-for="column in COLUMNS"
                :key="column.key"
                type="button"
                class="sortable"
                :class="[column.className, { sorted: state.playersSort.key === column.key }]"
                :title="column.title"
                :aria-sort="state.playersSort.key === column.key ? (state.playersSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'"
                @click="sortBy(column.key)"
            >
                <span>{{ column.label }}</span>
                <component :is="state.playersSort.key === column.key && state.playersSort.dir === 'asc' ? ArrowUp : ArrowDown" class="arrow" />
            </button>
            <span class="c-tools" />
        </div>

        <div
            v-for="player in players"
            :id="`player-${player.steamId}`"
            :key="player.steamId"
            v-memo="[player, state.selectedPlayer === player.steamId, isWatched(player.steamId), watchedEntry(player.steamId)?.note, leaving.has(player.steamId)]"
            class="row player"
            :class="{ active: state.selectedPlayer === player.steamId, leaving: leaving.has(player.steamId) }"
            @click="select(player.steamId)"
            @contextmenu="openPlayerMenu($event, player)"
        >
            <span class="c-name">
                <span class="swatch" :style="{ background: player.factionColor ?? 'var(--faint)' }" />
                <span class="truncate">{{ player.name }}</span>
                <Star v-if="isWatched(player.steamId)" class="star" :title="watchedEntry(player.steamId)?.note || 'Watched'" />
            </span>
            <span class="c-num num">{{ player.kills }}</span>
            <span class="c-num c-deaths num muted">{{ player.deaths }}</span>
            <span class="c-num c-kd num kd">{{ ratio(player.kills, player.deaths) }}</span>
            <span class="c-cash num muted">${{ number(player.cash) }}</span>
            <span class="c-ping num" :class="`ping-${pingLevel(player.pingMs)}`">{{ player.pingMs }}</span>
            <span class="c-tools">
                <button type="button" class="tool" :title="isWatched(player.steamId) ? 'Stop watching' : 'Watch'" @click.stop="toggleWatch(player)"><Star :class="{ starred: isWatched(player.steamId) }" /></button>
                <button type="button" class="tool" title="Message" @click.stop="openPlayerAction('message', player)"><MessageSquare /></button>
                <button type="button" class="tool bad" title="Kick" @click.stop="openPlayerAction('kick', player)"><UserX /></button>
            </span>
        </div>

        <!-- The first reading is on its way -->
        <div v-if="!live" class="skeleton-list rows-skeleton" aria-busy="true" aria-label="Loading players">
            <div v-for="i in 9" :key="i" class="skeleton" :style="{ height: '30px', width: `${100 - ((i * 17) % 30)}%` }" />
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

.sortable {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
}

.sortable.c-num,
.sortable.c-cash,
.sortable.c-ping {
    justify-content: flex-end;
}

.sortable:hover {
    color: var(--text-2);
}

.sortable:focus-visible {
    outline: none;
    color: var(--text-2);
    box-shadow: 0 2px 0 var(--accent-line);
}

.sortable.sorted {
    color: var(--accent);
}

.arrow {
    width: 13px;
    height: 13px;
    flex: none;
    opacity: 0;
    transition: opacity 0.12s;
}

.sortable:hover .arrow {
    opacity: 0.5;
}

.sortable.sorted .arrow {
    opacity: 1;
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
    height: 38px;
    color: var(--faint);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.player {
    min-height: 44px;
    font-size: 15px;
    /* Rows out of view are skipped when the page lays out and paints, so a full server scrolls and updates smoothly. */
    content-visibility: auto;
    contain-intrinsic-size: auto 44px;
}

/* A kick or ban on its way: the row fades out at once, and comes back if it failed. */
.player.leaving {
    opacity: 0.3;
    pointer-events: none;
    transition: opacity 0.2s ease;
}

.rows-skeleton {
    padding: 8px 24px 0 33px;
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

/*
 * A narrower page drops the less important columns, cash first, then
 * deaths and K/D, so the table never scrolls sideways.
 */
@container page (max-width: 760px) {
    .head,
    .player {
        grid-template-columns: minmax(120px, 1fr) 44px 44px 57px 57px 101px;
        padding: 0 16px 0 22px;
    }

    .c-cash {
        display: none;
    }

    .left-grid {
        grid-template-columns: minmax(120px, 1fr) 150px 70px 80px 70.5px;
        padding: 0 16px 0 22px;
    }
}

@container page (max-width: 560px) {
    .head,
    .player {
        grid-template-columns: minmax(110px, 1fr) 44px 57px 101px;
        gap: 9px;
    }

    .c-deaths,
    .c-kd {
        display: none;
    }

    .left-grid {
        grid-template-columns: minmax(110px, 1fr) 64px 76px 70.5px;
        gap: 9px;
    }

    .c-steam {
        display: none;
    }
}

/* Very narrow: tighter edges, and the row tools take only the room they need. */
@container page (max-width: 460px) {
    .head,
    .player {
        grid-template-columns: minmax(90px, 1fr) 30px 40px 90px;
        gap: 8px;
        padding: 0 10px 0 16px;
    }

    .c-name {
        gap: 9px;
    }

    .left-grid {
        padding: 0 10px 0 16px;
    }

    .rows-skeleton {
        padding: 8px 10px 0 16px;
    }
}
</style>
