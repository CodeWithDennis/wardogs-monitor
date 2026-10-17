<script setup lang="ts">
import { Ban, CircleCheck, CircleOff, Gauge, LayoutGrid, Map, Megaphone, PictureInPicture2, Plus, Repeat, Server, SlidersHorizontal, Users } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import ServerSwitcher from '@/components/ServerSwitcher.vue';
import { BRAND, WORDMARK } from '@/lib/brand';
import { openMini, openOptions, openView, section, selectedLive, state, VIEWS, type ControlView } from '@/lib/store';

/**
 * The second column: the wordmark, the server switcher and a list
 * that follows the section, like the guide categories with their counts
 * in the reference: status filters on the cards, the open server's views,
 * or a server filter on the activity log.
 */
const ICONS: Record<ControlView, unknown> = { overview: Gauge, players: Users, match: Map, rotation: Repeat, bans: Ban, settings: SlidersHorizontal };

const bansCount = ref<number | null>(null);
const rotationCount = ref<number | null>(null);

watch(
    () => [state.selectedId, state.revision, selectedLive.value?.online] as const,
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
    openView('overview');
    requestAnimationFrame(() => document.getElementById('broadcast')?.focus());
}

function playersOnline(serverId: string): string {
    const live = state.lives[serverId];

    return live?.online && live.status ? String(live.status.players) : '';
}
</script>

<template>
    <aside class="sidebar">
        <header class="brand drag">
            <h1 class="wordmark" :aria-label="BRAND.name">{{ WORDMARK.lead }} <span class="last">{{ WORDMARK.last }}</span></h1>
            <p class="label-caps">{{ BRAND.tagline }}</p>
        </header>

        <ServerSwitcher />


        <!-- The cards: filter by status -->
        <nav v-if="section === 'servers'" class="list" aria-label="Filter servers">
            <button v-for="filter in filters" :key="filter.id" type="button" class="row" :class="{ active: state.serverFilter === filter.id }" @click="state.serverFilter = filter.id">
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
                <button v-for="(view, index) in VIEWS" :key="view.id" type="button" class="row" :data-view="view.id" :class="{ active: state.view === view.id }" :title="`${view.label} (Ctrl+${index + 1})`" @click="openView(view.id)">
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
                <button type="button" class="row" @click="openMini">
                    <PictureInPicture2 :stroke-width="1.75" />
                    <span class="label">Mini monitor</span>
                    <span v-if="state.miniOpen" class="count gold">open</span>
                </button>
            </div>
        </template>

        <!-- The activity log: filter by server -->
        <nav v-else-if="section === 'activity'" class="list" aria-label="Filter activity">
            <button type="button" class="row" :class="{ active: state.activityServer === null }" @click="state.activityServer = null">
                <LayoutGrid :stroke-width="1.75" />
                <span class="label">All servers</span>
            </button>
            <button v-for="server in state.servers" :key="server.id" type="button" class="row" :class="{ active: state.activityServer === server.id }" @click="state.activityServer = server.id">
                <Server :stroke-width="1.75" />
                <span class="label truncate">{{ server.name }}</span>
                <span class="count num">{{ playersOnline(server.id) }}</span>
            </button>
        </nav>

        <footer class="foot">
            <span>Version {{ state.version }}</span>
            <button v-if="state.licence" type="button" class="pill licence" :class="state.licence.state === 'licensed' ? 'pill-ok' : state.licence.state === 'trial' ? 'pill-gold' : 'pill-bad'" title="Licence" @click="openOptions('licence')">
                {{ state.licence.state === 'licensed' ? 'Licensed' : state.licence.state === 'trial' ? `Trial · ${state.licence.trialDaysLeft}d left` : 'Trial ended' }}
            </button>
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
    height: 101px;
    margin-bottom: 4.5px;
    padding: 31px 26.5px 0;
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

.brand p {
    margin: 10px 0 0;
    color: var(--accent);
    font-size: 11.5px;
    letter-spacing: 0.22em;
}

.list,
.quick {
    display: flex;
    flex-direction: column;
}

.list .row,
.quick .row {
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

.label {
    flex: 1;
    min-width: 0;
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
    padding: 0 24px 6.5px;
    color: var(--faint);
    font-family: var(--font-title);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.foot {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-top: auto;
    padding: 20px 24px 24px;
    color: var(--text-2);
    font-size: 14px;
}

.licence {
    border: 0;
    cursor: pointer;
}

.beta {
    height: 21px;
    font-size: 11.5px;
    letter-spacing: 0.08em;
}
</style>
