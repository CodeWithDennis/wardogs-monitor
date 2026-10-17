<script setup lang="ts">
import { Ban, Gauge, LayoutGrid, Map as MapIcon, Megaphone, Palette, PictureInPicture2, Plus, Repeat, RotateCcw, ScrollText, Search, Server, Settings2, SkipForward, SlidersHorizontal, Star, UserMinus, Users } from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import TimeAgo from '@/components/TimeAgo.vue';
import { act, openMini, openOptions, openView, selectServer, selectedServer, state, type View } from '@/lib/store';
import { isWatched } from '@/lib/watchlist';

/**
 * Ctrl+K: one box to find anything. Players on every server (by name or
 * Steam ID, including those who just left), servers, views and actions.
 * Arrow keys move, Enter opens, Esc closes.
 */
interface Item {
    id: string;
    group: string;
    label: string;
    detail?: string;
    icon: unknown;
    color?: string | null;
    watched?: boolean;
    /** When a player left, shown as "3m ago" after the detail. */
    leftAt?: number;
    keywords: string;
    /** Label and keywords in lower case, worked out once rather than on every key. */
    haystack?: string;
    run: () => void;
}

const query = ref('');
const highlighted = ref(0);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

function close(): void {
    state.paletteOpen = false;
}

function openPlayer(serverId: string, steamId: string): void {
    selectServer(serverId);
    openView('players');
    state.search = '';
    state.selectedPlayer = steamId;
}

const players = computed<Item[]>(() =>
    state.servers.flatMap((server) => [
        ...(state.lives[server.id]?.players ?? []).map((player) => ({
            id: `player:${server.id}:${player.steamId}`,
            group: 'Players',
            label: player.name,
            detail: `${server.name} · ${player.faction ?? 'no faction'} · ${player.kills}/${player.deaths}`,
            icon: Users,
            color: player.factionColor,
            watched: isWatched(player.steamId),
            keywords: `${player.name} ${player.steamId} ${server.name}`,
            run: () => openPlayer(server.id, player.steamId),
        })),
        ...(state.left[server.id] ?? []).map((player) => ({
            id: `left:${server.id}:${player.steamId}`,
            group: 'Left recently',
            label: player.name,
            detail: `left ${server.name}`,
            leftAt: player.leftAt,
            icon: UserMinus,
            watched: isWatched(player.steamId),
            keywords: `${player.name} ${player.steamId} ${server.name} left`,
            run: () => {
                selectServer(server.id);
                openView('players');
                state.playersTab = 'left';
            },
        })),
    ]),
);

const servers = computed<Item[]>(() =>
    state.servers.map((server) => {
        const live = state.lives[server.id];

        return {
            id: `server:${server.id}`,
            group: 'Servers',
            label: server.name,
            detail: live?.online && live.status ? `${live.status.players}/${live.status.maxPlayers} players` : live ? 'Offline' : '',
            icon: Server,
            keywords: `${server.name} ${server.host} server switch`,
            run: () => selectServer(server.id),
        };
    }),
);

const views = computed<Item[]>(() => {
    const go = (view: View, label: string, icon: unknown, keywords = '') => ({ id: `view:${view}`, group: 'Go to', label, icon, keywords: `${label} ${keywords}`, run: () => openView(view) });
    const list: Item[] = [go('servers', 'All servers', LayoutGrid, 'cards home'), go('activity', 'Activity', ScrollText, 'log history')];

    if (selectedServer.value) {
        list.unshift(
            go('overview', 'Overview', Gauge, 'scores dashboard'),
            go('players', 'Players', Users, 'scoreboard'),
            go('match', 'Match and map', MapIcon, 'change map travel'),
            go('rotation', 'Rotation', Repeat, 'playlist maps'),
            go('bans', 'Bans', Ban, 'banned unban'),
            go('settings', 'Server settings', SlidersHorizontal, 'password slots config'),
        );
    }

    list.push(
        { id: 'options', group: 'Go to', label: 'Options', icon: Settings2, keywords: 'options preferences', run: () => openOptions() },
        { id: 'themes', group: 'Go to', label: 'Themes and zoom', icon: Palette, keywords: 'theme appearance accent colour color zoom carbon', run: () => openOptions('appearance') },
        { id: 'watchlist', group: 'Go to', label: 'Watchlist', icon: Star, keywords: 'watch watched star', run: () => openOptions('watchlist') },
    );

    return list;
});

const actions = computed<Item[]>(() => {
    const list: Item[] = [{ id: 'add', group: 'Actions', label: 'Add a server', icon: Plus, keywords: 'add new server connect', run: () => (state.addingServer = true) }];

    if (selectedServer.value && state.lives[selectedServer.value.id]?.online) {
        const name = selectedServer.value.name;
        list.unshift(
            {
                id: 'broadcast',
                group: 'Actions',
                label: `Broadcast on ${name}`,
                icon: Megaphone,
                keywords: 'broadcast message announce everyone',
                run: () => {
                    openView('overview');
                    requestAnimationFrame(() => document.getElementById('broadcast')?.focus());
                },
            },
            {
                id: 'restart',
                group: 'Actions',
                label: `Restart the match on ${name}`,
                icon: RotateCcw,
                keywords: 'restart match reload',
                run: () => act('restartMatch', {}, { confirm: { title: 'Restart the match?', body: 'The current map reloads and scores start from zero.', confirmLabel: 'Restart match', danger: true } }),
            },
            {
                id: 'end',
                group: 'Actions',
                label: `End the match on ${name}`,
                icon: SkipForward,
                keywords: 'end match next map skip',
                run: () => act('endMatch', {}, { confirm: { title: 'End the match now?', body: 'The rotation moves on to the next map.', confirmLabel: 'End match', danger: true } }),
            },
            { id: 'mini', group: 'Actions', label: 'Open the mini monitor', icon: PictureInPicture2, keywords: 'mini monitor overlay window', run: () => openMini() },
        );
    }

    return list;
});

const haystack = (item: Item): string => (item.haystack ??= `${item.label} ${item.keywords}`.toLowerCase());

/** Every word of the query must appear somewhere in the item. */
const results = computed<Item[]>(() => {
    const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);

    if (terms.length === 0) {
        return [...servers.value, ...views.value.slice(0, 6), ...actions.value];
    }

    const all = [...players.value, ...servers.value, ...views.value, ...actions.value];
    const found: Item[] = [];

    // Stops at the 60 the list shows, instead of checking everyone on every server.
    for (const item of all) {
        if (terms.every((term) => haystack(item).includes(term))) {
            found.push(item);

            if (found.length === 60) {
                break;
            }
        }
    }

    return found;
});

const groups = computed(() => {
    const map = new Map<string, { item: Item; index: number }[]>();
    results.value.forEach((item, index) => map.set(item.group, [...(map.get(item.group) ?? []), { item, index }]));

    return [...map.entries()];
});

watch(query, () => (highlighted.value = 0));

watch(
    () => state.paletteOpen,
    async (open) => {
        if (open) {
            query.value = '';
            highlighted.value = 0;
            await nextTick();
            input.value?.focus();
        }
    },
);

function choose(item: Item | undefined): void {
    if (item) {
        close();
        item.run();
    }
}

function onInputKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const count = results.value.length;
        highlighted.value = (highlighted.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % Math.max(1, count);
        nextTick(() => list.value?.querySelector('.highlighted')?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter') {
        event.preventDefault();
        choose(results.value[highlighted.value]);
    } else if (event.key === 'Escape') {
        close();
    }
}

function onKey(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        state.paletteOpen = !state.paletteOpen;
    }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="state.paletteOpen" class="backdrop" @mousedown.self="close">
                <section class="palette" role="dialog" aria-label="Search everything">
                    <label class="field-row">
                        <Search />
                        <input ref="input" v-model="query" placeholder="Search players on every server, servers, actions…" spellcheck="false" @keydown="onInputKey" />
                        <span class="kbd">Esc</span>
                    </label>

                    <div ref="list" class="results">
                        <section v-for="[group, entries] in groups" :key="group">
                            <div class="group-label">{{ group }}</div>
                            <button
                                v-for="{ item, index } in entries"
                                :key="item.id"
                                type="button"
                                class="result"
                                :class="{ highlighted: index === highlighted }"
                                @mouseenter="highlighted = index"
                                @click="choose(item)"
                            >
                                <component :is="item.icon" class="icon" :style="item.color ? { color: item.color } : undefined" />
                                <span class="label truncate">{{ item.label }}</span>
                                <Star v-if="item.watched" class="star" />
                                <span v-if="item.detail" class="detail truncate">{{ item.detail }}<template v-if="item.leftAt"> <TimeAgo :at="item.leftAt" /></template></span>
                            </button>
                        </section>
                        <p v-if="results.length === 0" class="none">Nothing matches “{{ query }}”.</p>
                    </div>

                    <footer>
                        <span><span class="kbd">↑</span><span class="kbd">↓</span> move</span>
                        <span><span class="kbd">Enter</span> open</span>
                        <span><span class="kbd">Ctrl</span><span class="kbd">K</span> toggle</span>
                    </footer>
                </section>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.backdrop {
    -webkit-app-region: no-drag;
    position: fixed;
    inset: 0;
    z-index: 55;
    display: flex;
    justify-content: center;
    padding-top: 12vh;
    background: rgb(5 7 15 / 0.62);
    backdrop-filter: blur(2px);
}

.palette {
    display: flex;
    flex-direction: column;
    width: 682px;
    max-width: calc(100vw - 48px);
    max-height: 64vh;
    overflow: hidden;
    border: 1px solid var(--pop-line);
    border-top-color: var(--accent-line);
    border-radius: var(--radius-pop);
    background: var(--panel);
    box-shadow: var(--shadow-pop);
    animation: rise 0.14s ease;
}

.field-row {
    display: flex;
    align-items: center;
    gap: 13px;
    height: 57px;
    padding: 0 17.5px;
    border-bottom: 1px solid var(--line);
}

.field-row svg {
    width: 18.5px;
    height: 18.5px;
    color: var(--muted);
}

.field-row input {
    flex: 1;
    border: 0;
    background: transparent;
    font-size: 16.5px;
    outline: none;
    user-select: text;
}

.field-row input::placeholder {
    color: var(--faint);
}

.results {
    flex: 1;
    overflow: auto;
    padding: 6.5px;
}

.group-label {
    padding: 11px 11px 6px;
    color: var(--faint);
    font-family: var(--font-body);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.result {
    display: flex;
    align-items: center;
    gap: 13px;
    width: 100%;
    height: 42px;
    padding: 0 11px;
    border: 0;
    border-left: 2px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    text-align: left;
}

.result.highlighted {
    background: var(--select);
    border-left-color: var(--accent);
}

.icon {
    width: 16.5px;
    height: 16.5px;
    flex: none;
    color: var(--muted);
}

.label {
    flex: none;
    max-width: 55%;
    font-size: 15px;
}

.detail {
    flex: 1;
    min-width: 0;
    color: var(--muted);
    font-size: 13px;
    text-align: right;
}

.star {
    width: 14.5px;
    height: 14.5px;
    flex: none;
    color: var(--warn);
    fill: var(--warn);
}

.none {
    margin: 0;
    padding: 26.5px;
    color: var(--muted);
    text-align: center;
}

footer {
    display: flex;
    gap: 20px;
    padding: 10px 17.5px;
    border-top: 1px solid var(--line-soft);
    color: var(--muted);
    font-size: 12.5px;
}

footer span {
    display: inline-flex;
    align-items: center;
    gap: 4.5px;
}
</style>
