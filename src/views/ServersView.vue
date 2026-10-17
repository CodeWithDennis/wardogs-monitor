<script setup lang="ts">
import { FlaskConical, Plus, SearchX } from 'lucide-vue-next';
import { computed } from 'vue';
import ServerCard from '@/components/ServerCard.vue';
import SearchField from '@/components/SearchField.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { loadServers, selectServer, state, toast } from '@/lib/store';

/** Every saved server as a card, filtered by the sidebar's status and search. */
const servers = computed(() => {
    const term = state.search.trim().toLowerCase();

    return state.servers.filter((server) => {
        const live = state.lives[server.id];
        const matchesFilter = state.serverFilter === 'all' || (state.serverFilter === 'online' ? live?.online === true : live !== undefined && !live.online);
        const matchesSearch = term === '' || server.name.toLowerCase().includes(term) || server.host.includes(term) || (live?.status?.name.toLowerCase().includes(term) ?? false);

        return matchesFilter && matchesSearch;
    });
});

const players = computed(() => state.servers.reduce((sum, server) => sum + (state.lives[server.id]?.status?.players ?? 0), 0));
const online = computed(() => state.servers.filter((server) => state.lives[server.id]?.online).length);

async function addDemo(): Promise<void> {
    const server = await window.panel.servers.addDemo();
    await loadServers();
    selectServer(server.id, false);
    toast('info', 'Demo server added', 'It plays a pretend match on this PC, so you can try every control safely.');
}
</script>

<template>
    <ViewHeader title="Servers" :subtitle="`${online} of ${state.servers.length} online · ${players} players right now`">
        <template #actions>
            <button type="button" class="btn btn-primary" @click="state.addingServer = true"><Plus /> Add server</button>
        </template>
    </ViewHeader>

    <div class="toolbar">
        <SearchField placeholder="Search servers by name or address" :count="servers.length" />
    </div>

    <div class="view-body">
        <div class="grid">
            <ServerCard v-for="server in servers" :key="server.id" :server="server" />

            <button v-if="state.serverFilter === 'all' && !state.search" type="button" class="add-card" @click="state.addingServer = true">
                <span class="plus"><Plus /></span>
                <strong>Add a server</strong>
                <span class="muted">Its RCON address and password</span>
                <span v-if="!state.servers.some((server) => server.demo)" class="demo-link" @click.stop="addDemo"><FlaskConical /> or try the demo server</span>
            </button>
        </div>

        <div v-if="servers.length === 0 && (state.serverFilter !== 'all' || state.search)" class="empty">
            <SearchX />
            <span>No server matches. <button type="button" class="link" @click="state.search = ''; state.serverFilter = 'all'">Show all</button></span>
        </div>
    </div>
</template>

<style scoped>
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
    gap: 20px;
}

.add-card {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 6.5px;
    min-height: 330px;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius);
    background: transparent;
    color: var(--text);
    transition:
        border-color 0.15s,
        background 0.15s;
}

.add-card:hover {
    border-color: var(--accent-line);
    background: color-mix(in srgb, var(--accent) 4%, transparent);
}

.plus {
    display: grid;
    place-items: center;
    width: 48.5px;
    height: 48.5px;
    margin-bottom: 9px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
}

.plus svg {
    width: 22px;
    height: 22px;
}

.add-card strong {
    font-family: var(--font-title);
    font-size: 15.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.add-card .muted {
    font-size: 14px;
}

.demo-link {
    display: inline-flex;
    align-items: center;
    gap: 6.5px;
    margin-top: 15.5px;
    color: var(--accent);
    font-size: 14px;
}

.demo-link:hover {
    color: var(--accent-hi);
}

.demo-link svg {
    width: 14.5px;
    height: 14.5px;
}

.link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
}
</style>
