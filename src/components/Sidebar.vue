<script setup lang="ts">
import { Ban, CircleCheck, CircleOff, Gauge, LayoutGrid, Map, Megaphone, PictureInPicture2, Plus, Repeat, Server, SlidersHorizontal, Users } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import ServerSwitcher from '@/components/ServerSwitcher.vue';
import { BRAND, WORDMARK } from '@/lib/brand';
import { openView, section, selectedLive, state, VIEWS, type ControlView } from '@/lib/store';
import { pickWidgets, widgetCount } from '@/lib/widgets';

/**
 * The second column: the wordmark, the server switcher and a list
 * that follows the section, like the guide categories with their counts
 * in the reference: status filters on the cards, the open server's views,
 * or a server filter on the activity log.
 */
const ICONS: Record<ControlView, unknown> = { overview: Gauge, players: Users, match: Map, rotation: Repeat, bans: Ban, settings: SlidersHorizontal };

/** Widgets open on the selected server. */
const openWidgets = computed(() => widgetCount(state.selectedId));

/**
 * The sidebar is at least as wide as the product name needs, measured once
 * the fonts have loaded, so a longer name never gets cut off.
 */
const brand = ref<HTMLElement | null>(null);
const wordmark = ref<HTMLElement | null>(null);
const width = ref<number | null>(null);

onMounted(async () => {
    await document.fonts.ready;

    if (brand.value && wordmark.value) {
        const style = getComputedStyle(brand.value);
        const needed = wordmark.value.scrollWidth + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 30;
        const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--side-w')) || 273;
        width.value = Math.max(base, Math.ceil(needed));
    }
});

const sidebarStyle = computed(() => (width.value ? { width: `${width.value}px` } : undefined));

const bansCount = ref<number | null>(null);
const rotationCount = ref<number | null>(null);

// Separate sources, so the counts are read again only when one of them changes, not on every reading.
watch(
    [() => state.selectedId, () => state.revision, () => selectedLive.value?.online],
    async ([serverId, , online]) => {
        if (!serverId || !online) {
            bansCount.value = null;
            rotationCount.value = null;

            return;
        }

        const [bans, rotation] = await Promise.all([window.panel.server.bans(serverId), window.panel.server.rotation(serverId)]);
        bansCount.value = bans.error ? null : bans.bans.length;
        rotationCount.value = rotation.error ? null : rotation.entries.length;
    },
    { immediate: true },
);

const counts = computed<Partial<Record<ControlView, number | null>>>(() => ({
    players: selectedLive.value?.online ? selectedLive.value.players.length : null,
    rotation: rotationCount.value,
    bans: bansCount.value,
}));

const online = computed(() => state.servers.filter((server) => state.lives[server.id]?.online).length);
const offline = computed(() => state.servers.filter((server) => state.lives[server.id] && !state.lives[server.id]?.online).length);

const filters = computed(() => [
    { id: 'all' as const, label: 'All servers', icon: LayoutGrid, count: state.servers.length },
    { id: 'online' as const, label: 'Online', icon: CircleCheck, count: online.value },
    { id: 'offline' as const, label: 'Offline', icon: CircleOff, count: offline.value },
]);

function broadcast(): void {
    state.broadcasting = true;
}

function playersOnline(serverId: string): string {
    const live = state.lives[serverId];

    return live?.online && live.status ? String(live.status.players) : '';
}
</script>

<template>
    <aside class="sidebar" :style="sidebarStyle">
        <header ref="brand" class="brand drag">
            <h1 ref="wordmark" class="wordmark" :aria-label="BRAND.name">{{ WORDMARK.lead }} <span class="last">{{ WORDMARK.last }}</span></h1>
            <p class="label-caps">{{ BRAND.tagline }}</p>
        </header>

        <ServerSwitcher />

        <!-- The cards: filter by status -->
        <nav v-if="section === 'servers'" class="list" aria-label="Filter servers">
            <button
                v-for="filter in filters"
                :key="filter.id"
                type="button"
                class="row"
                :class="{ active: state.serverFilter === filter.id }"
                @click="state.serverFilter = filter.id"
            >
                <component :is="filter.icon" :stroke-width="1.75" />
                <span class="label">{{ filter.label }}</span>
                <span class="count num">{{ filter.count }}</span>
            </button>
            <button type="button" class="row add" @click="state.addingServer = true">
                <Plus :stroke-width="1.75" />
                <span class="label">Add server</span>
            </button>
        </nav>

        <!-- One server: its views -->
        <template v-else-if="section === 'control'">
            <nav class="list" aria-label="Server views">
                <button
                    v-for="(view, index) in VIEWS"
                    :key="view.id"
                    type="button"
                    class="row"
                    :data-view="view.id"
                    :class="{ active: state.view === view.id }"
                    :title="`${view.label} (Ctrl+${index + 1})`"
                    @click="openView(view.id)"
                >
                    <component :is="ICONS[view.id]" :stroke-width="1.75" />
                    <span class="label">{{ view.label }}</span>
                    <span v-if="counts[view.id] !== undefined && counts[view.id] !== null" class="count num">{{ counts[view.id] }}</span>
                </button>
            </nav>

            <div class="quick">
                <div class="quick-label">Quick actions</div>
                <button type="button" class="row" :disabled="!selectedLive?.online" @click="broadcast">
                    <Megaphone :stroke-width="1.75" />
                    <span class="label">Broadcast</span>
                </button>
                <button type="button" class="row" @click="pickWidgets()">
                    <PictureInPicture2 :stroke-width="1.75" />
                    <span class="label">Widgets</span>
                    <span v-if="openWidgets" class="count gold">{{ openWidgets }} open</span>
                </button>
            </div>
        </template>

        <!-- The activity log: filter by server -->
        <nav v-else-if="section === 'activity'" class="list" aria-label="Filter activity">
            <button type="button" class="row" :class="{ active: state.activityServer === null }" @click="state.activityServer = null">
                <LayoutGrid :stroke-width="1.75" />
                <span class="label">All servers</span>
            </button>
            <button
                v-for="server in state.servers"
                :key="server.id"
                type="button"
                class="row"
                :class="{ active: state.activityServer === server.id }"
                @click="state.activityServer = server.id"
            >
                <Server :stroke-width="1.75" />
                <span class="label truncate">{{ server.name }}</span>
                <span v-if="playersOnline(server.id)" class="count num">{{ playersOnline(server.id) }}</span>
            </button>
        </nav>

        <footer class="foot">
            <span>Version {{ state.version }}</span>
        </footer>
    </aside>
</template>

<style scoped>
.sidebar {
    display: flex;
    flex-direction: column;
    width: var(--side-w);
    flex: none;
    background: var(--side);
    border-right: 1px solid var(--line-soft);
}

.brand {
    position: relative;
    height: 101px;
    margin-bottom: 4.5px;
    padding: 31px 26.5px 0;
    overflow: hidden;
}

.wordmark {
    margin: 0;
    font-family: var(--font-title);
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.09em;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap;
}

.wordmark .last {
    color: var(--accent);
}

/* The tagline under the wordmark, widely spaced as part of the lockup. */
.brand p {
    margin: 10px 0 0;
    color: var(--accent);
    font-size: 10.5px;
    letter-spacing: 0.2em;
    white-space: nowrap;
}

.list,
.quick {
    display: flex;
    flex-direction: column;
}

.list .row,
.quick .row {
    position: relative;
    width: 100%;
    min-height: 43px;
    padding: 0 24px 0 22px;
    border-top: 0;
    border-right: 0;
    border-bottom: 0;
    background: transparent;
    font-size: 15px;
    text-align: left;
}

.row.active {
    background: var(--select);
}

.row:disabled {
    opacity: 0.4;
    cursor: default;
}

.row svg {
    width: 16.5px;
    height: 16.5px;
    flex: none;
    color: var(--text-2);
}

.row.active svg {
    color: var(--accent);
}

/* Clipped and on one line, so a long label never spills out of its row. */
.label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
}

.count {
    color: var(--text-2);
    font-size: 14.5px;
}

.add,
.add svg {
    color: var(--muted);
}

.add:hover {
    color: var(--text);
}

.quick {
    margin-top: 20px;
    padding-top: 15.5px;
    border-top: 1px solid var(--line-soft);
}

.quick-label {
    padding: 0 24px 8px;
    color: var(--faint);
    font-family: var(--font-body);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
}

/* Pinned to the bottom of the sidebar. */
.foot {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-top: auto;
    padding: 15.5px 24px 24px;
    overflow: hidden;
    color: var(--text-2);
    font-size: 14px;
    white-space: nowrap;
}

.beta {
    height: 22px;
    font-size: 12px;
    font-weight: 500;
}
</style>
