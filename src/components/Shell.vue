<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import BanListBanner from '@/components/BanListBanner.vue';
import BanSyncDialog from '@/components/BanSyncDialog.vue';
import BroadcastDialog from '@/components/BroadcastDialog.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import DetailPanel from '@/components/DetailPanel.vue';
import IconRail from '@/components/IconRail.vue';
import PlayerActionDialog from '@/components/PlayerActionDialog.vue';
import PlayerContextMenu from '@/components/PlayerContextMenu.vue';
import ServerDialog from '@/components/ServerDialog.vue';
import Sidebar from '@/components/Sidebar.vue';
import Toasts from '@/components/Toasts.vue';
import Welcome from '@/components/Welcome.vue';
import WidgetsDialog from '@/components/WidgetsDialog.vue';
import { startBanLists } from '@/lib/banlists';
import { init, openView, refreshLive, section, selectedServer, state, VIEWS } from '@/lib/store';
import ActivityView from '@/views/ActivityView.vue';
import BansView from '@/views/BansView.vue';
import MatchView from '@/views/MatchView.vue';
import OptionsView from '@/views/OptionsView.vue';
import OverviewView from '@/views/OverviewView.vue';
import PlayersView from '@/views/PlayersView.vue';
import RotationView from '@/views/RotationView.vue';
import ServersView from '@/views/ServersView.vue';
import SettingsView from '@/views/SettingsView.vue';

/**
 * The main window, laid out like the reference: an icon rail of sections,
 * a sidebar with the server switcher, the open view and, for a server's
 * live views, a detail panel on the right.
 */
const views = {
    servers: ServersView,
    overview: OverviewView,
    players: PlayersView,
    match: MatchView,
    rotation: RotationView,
    bans: BansView,
    settings: SettingsView,
    activity: ActivityView,
    options: OptionsView,
};

const current = computed(() => views[state.view]);

/** Views that fill the whole width, without the detail panel. */
const wide = computed(() => ['servers', 'settings', 'rotation', 'activity', 'options'].includes(state.view));

/** A server's own views need a server; the rest work without one. */
const showView = computed(() => (section.value === 'control' ? selectedServer.value !== null : section.value !== 'servers' || state.servers.length > 0));

function onKey(event: KeyboardEvent): void {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;

    if (event.ctrlKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        openView('servers');
    } else if (event.ctrlKey && /^[1-6]$/.test(event.key)) {
        event.preventDefault();
        openView(VIEWS[Number(event.key) - 1].id);
    } else if (event.key === 'F5' || (event.ctrlKey && event.key.toLowerCase() === 'r')) {
        event.preventDefault();

        if (state.selectedId) {
            refreshLive(state.selectedId, true);
        }
    } else if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        (document.getElementById('search') as HTMLInputElement | null)?.select();
    }
}

onMounted(() => {
    init();
    startBanLists();
    window.addEventListener('keydown', onKey);
});

onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
    <div class="shell">
        <IconRail />
        <!-- Options are about the app, not a server: no server sidebar there. -->
        <Sidebar v-if="state.view !== 'options'" />

        <template v-if="state.ready">
            <main v-if="showView" class="content" :class="{ wide }">
                <BanListBanner :wide="wide" />
                <component :is="current" :key="`${state.view}:${state.selectedId}`" />
            </main>
            <Welcome v-else />

            <DetailPanel v-if="showView && section === 'control' && !wide" />
        </template>

        <div v-else class="content wide boot">
            <div class="skeleton" style="width: 220px; height: 22px" />
        </div>

        <ServerDialog />
        <PlayerActionDialog />
        <PlayerContextMenu />
        <CommandPalette />
        <BanSyncDialog />
        <BroadcastDialog />
        <WidgetsDialog />
        <ConfirmDialog />
        <Toasts />
    </div>
</template>

<style scoped>
.shell {
    display: flex;
    height: 100%;
    background: var(--main);
}

.content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--main);
    border-right: 1px solid var(--line-soft);
}

.content.wide {
    border-right: 0;
}

/*
 * How much of the page's top-right corner the window's own buttons cover:
 * nothing while the open detail panel sits beside it (they are over the
 * panel then), the whole caption width when the page runs to the window's
 * edge. Banners and view headers keep that much clear.
 */
.content {
    --caption-clear: var(--caption-w);
}

.content:has(+ .detail) {
    --caption-clear: 0px;
}

.boot {
    display: grid;
    place-items: center;
}
</style>
