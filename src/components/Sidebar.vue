<script setup lang="ts">
import { Ban, CircleCheck, CircleOff, Gauge, Hourglass, LayoutGrid, Map, Megaphone, PanelLeftClose, PanelLeftOpen, PictureInPicture2, Plus, Repeat, Server, ShieldAlert, ShieldCheck, SlidersHorizontal, Users } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import ServerSwitcher from '@/components/ServerSwitcher.vue';
import { BRAND, WORDMARK } from '@/lib/brand';
import { openMini, openOptions, openView, section, selectedLive, sidebarFolded, state, togglePanel, VIEWS, type ControlView } from '@/lib/store';

/**
 * The second column: the wordmark, the server switcher and a list
 * that follows the section, like the guide categories with their counts
 * in the reference: status filters on the cards, the open server's views,
 * or a server filter on the activity log.
 */
const ICONS: Record<ControlView, unknown> = { overview: Gauge, players: Users, match: Map, rotation: Repeat, bans: Ban, settings: SlidersHorizontal };

/**
 * Collapsed, the sidebar shrinks to a strip of icons instead of vanishing,
 * so the views and their counts stay one click away. Ctrl+B and the button
 * at the bottom switch between the two.
 */
const compact = computed(() => sidebarFolded.value);

/**
 * The sidebar is at least as wide as the product name needs, measured once
 * the fonts have loaded, so a longer name never gets cut off. The wordmark
 * stays laid out (only hidden) while compact, so this works either way.
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

/** The measured width only applies expanded; compact uses the CSS width. */
const sidebarStyle = computed(() => (width.value && !compact.value ? { width: `${width.value}px` } : undefined));

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

/** The licence in a few words, for the pill and the compact icon's tooltip. */
const licenceText = computed(() => {
    const licence = state.licence;

    if (!licence) {
        return '';
    }

    return licence.state === 'licensed' ? 'Licensed' : licence.state === 'trial' ? `Trial · ${licence.trialDaysLeft}d left` : licence.reason === 'trial' ? 'Trial ended' : licence.reason === 'offline' ? 'Check needed' : 'Licence ended';
});

const licenceTone = computed(() => (state.licence?.state === 'licensed' ? 'ok' : state.licence?.state === 'trial' ? 'gold' : 'bad'));

const licenceIcon = computed(() => (state.licence?.state === 'licensed' ? ShieldCheck : state.licence?.state === 'trial' ? Hourglass : ShieldAlert));

/** A row's tooltip while compact: its label, with the count when it has one. */
function tip(label: string, count?: number | string | null): string {
    return count === undefined || count === null || count === '' ? label : `${label} (${count})`;
}

function broadcast(): void {
    openView('overview');
    requestAnimationFrame(() => document.getElementById('broadcast')?.focus());
}

function playersOnline(serverId: string): string {
    const live = state.lives[serverId];

    return live?.online && live.status ? String(live.status.players) : '';
}
</script>

<template>
    <aside class="sidebar" :class="{ compact }" :style="sidebarStyle">
        <header ref="brand" class="brand drag">
            <h1 ref="wordmark" class="wordmark" :aria-label="BRAND.name">{{ WORDMARK.lead }} <span class="last">{{ WORDMARK.last }}</span></h1>
            <p class="label-caps">{{ BRAND.tagline }}</p>
        </header>

        <ServerSwitcher :compact="compact" />

        <!-- The cards: filter by status -->
        <nav v-if="section === 'servers'" class="list" aria-label="Filter servers">
            <button
                v-for="filter in filters"
                :key="filter.id"
                type="button"
                class="row"
                :class="{ active: state.serverFilter === filter.id }"
                :title="compact ? tip(filter.label, filter.count) : undefined"
                @click="state.serverFilter = filter.id"
            >
                <component :is="filter.icon" :stroke-width="1.75" />
                <span class="label">{{ filter.label }}</span>
                <span class="count num">{{ filter.count }}</span>
            </button>
            <button type="button" class="row add" :title="compact ? 'Add server' : undefined" @click="state.addingServer = true">
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
                    :title="`${compact ? tip(view.label, counts[view.id]) : view.label} (Ctrl+${index + 1})`"
                    @click="openView(view.id)"
                >
                    <component :is="ICONS[view.id]" :stroke-width="1.75" />
                    <span class="label">{{ view.label }}</span>
                    <span v-if="counts[view.id] !== undefined && counts[view.id] !== null" class="count num">{{ counts[view.id] }}</span>
                </button>
            </nav>

            <div class="quick">
                <div class="quick-label">Quick actions</div>
                <button type="button" class="row" :disabled="!selectedLive?.online" :title="compact ? 'Broadcast' : undefined" @click="broadcast">
                    <Megaphone :stroke-width="1.75" />
                    <span class="label">Broadcast</span>
                </button>
                <button type="button" class="row" :title="compact ? (state.miniOpen ? 'Mini monitor (open)' : 'Mini monitor') : undefined" @click="openMini">
                    <PictureInPicture2 :stroke-width="1.75" />
                    <span class="label">Mini monitor</span>
                    <span v-if="state.miniOpen" class="count gold">open</span>
                </button>
            </div>
        </template>

        <!-- The activity log: filter by server -->
        <nav v-else-if="section === 'activity'" class="list" aria-label="Filter activity">
            <button type="button" class="row" :class="{ active: state.activityServer === null }" :title="compact ? 'All servers' : undefined" @click="state.activityServer = null">
                <LayoutGrid :stroke-width="1.75" />
                <span class="label">All servers</span>
            </button>
            <button
                v-for="server in state.servers"
                :key="server.id"
                type="button"
                class="row"
                :class="{ active: state.activityServer === server.id }"
                :title="compact ? tip(server.name, playersOnline(server.id)) : undefined"
                @click="state.activityServer = server.id"
            >
                <Server :stroke-width="1.75" />
                <span class="label truncate">{{ server.name }}</span>
                <span v-if="playersOnline(server.id)" class="count num">{{ playersOnline(server.id) }}</span>
            </button>
        </nav>

        <!-- Always visible, so the strip is easy to find, open and close again -->
        <button
            type="button"
            class="fold"
            :aria-label="compact ? 'Expand the sidebar' : 'Collapse the sidebar'"
            :title="compact ? 'Expand the sidebar (Ctrl+B)' : 'Collapse the sidebar to icons (Ctrl+B)'"
            @click="togglePanel('sidebarCollapsed')"
        >
            <component :is="compact ? PanelLeftOpen : PanelLeftClose" :stroke-width="1.75" />
            <span class="label">Collapse</span>
            <span class="kbd">Ctrl+B</span>
        </button>

        <footer class="foot">
            <template v-if="compact">
                <button v-if="state.licence" type="button" class="licence-icon" :class="licenceTone" :title="`${licenceText} · Version ${state.version}`" @click="openOptions('licence')">
                    <component :is="licenceIcon" :stroke-width="1.75" />
                </button>
            </template>
            <template v-else>
                <span>Version {{ state.version }}</span>
                <button v-if="state.licence" type="button" class="pill licence" :class="`pill-${licenceTone}`" title="Licence" @click="openOptions('licence')">
                    {{ licenceText }}
                </button>
            </template>
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
    transition: width 0.18s ease;
}

.sidebar.compact {
    width: 64px;
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

.brand > * {
    transition: opacity 0.12s;
}

/* Hidden, not removed: the header keeps its height and the wordmark can still be measured. */
.compact .brand > * {
    visibility: hidden;
    opacity: 0;
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

/* Clipped and on one line, so labels never spill out while the width animates. */
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

/* Compact: every row is its icon, centred, with the count as a corner badge. */
.compact .list .row,
.compact .quick .row {
    justify-content: center;
    padding: 0;
}

.compact .row .label,
.compact .quick-label {
    display: none;
}

.compact .quick {
    padding-top: 6.5px;
}

.compact .count {
    position: absolute;
    top: 5.5px;
    left: calc(50% + 4.5px);
    min-width: 17px;
    height: 17px;
    padding: 0 4.5px;
    border-radius: 1099px;
    background: var(--raise);
    box-shadow: 0 0 0 2px var(--side);
    color: var(--text);
    font-size: 10.5px;
    line-height: 17px;
    text-align: center;
    pointer-events: none;
}

.compact .row.active .count {
    background: var(--accent-soft);
    color: var(--accent);
}

/* "open" on the mini monitor becomes a small accent pip. */
.compact .count.gold {
    top: 10px;
    left: calc(50% + 6.5px);
    min-width: 0;
    width: 7.5px;
    height: 7.5px;
    padding: 0;
    background: var(--accent);
    font-size: 0;
}

.fold {
    display: flex;
    align-items: center;
    gap: 13px;
    width: 100%;
    min-height: 43px;
    margin-top: auto;
    padding: 0 24px 0 22px;
    border: 0;
    border-top: 1px solid var(--line-soft);
    background: transparent;
    color: var(--muted);
    font-size: 14.5px;
    text-align: left;
    transition:
        color 0.12s,
        background 0.12s;
}

.fold:hover {
    background: var(--hover);
    color: var(--text);
}

.fold svg {
    width: 16.5px;
    height: 16.5px;
    flex: none;
}

.fold .kbd {
    flex: none;
}

.compact .fold {
    justify-content: center;
    padding: 0;
}

.compact .fold .label,
.compact .fold .kbd {
    display: none;
}

.foot {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 15.5px 24px 24px;
    overflow: hidden;
    color: var(--text-2);
    font-size: 14px;
    white-space: nowrap;
}

.compact .foot {
    justify-content: center;
    padding: 11px 0 20px;
}

.licence {
    border: 0;
    cursor: pointer;
}

.licence-icon {
    display: grid;
    place-items: center;
    width: 33px;
    height: 33px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    cursor: pointer;
    transition: background 0.12s;
}

.licence-icon:hover {
    background: var(--hover);
}

.licence-icon svg {
    width: 17px;
    height: 17px;
}

.licence-icon.ok {
    color: var(--ok);
}

.licence-icon.gold {
    color: var(--accent);
}

.licence-icon.bad {
    color: var(--bad);
}

.beta {
    height: 22px;
    font-size: 12px;
    font-weight: 500;
}
</style>
