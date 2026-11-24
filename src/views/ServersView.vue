<script setup lang="ts">
import { FlaskConical, Plus, SearchX, Server, Users } from 'lucide-vue-next';
import { computed } from 'vue';
import ServerCard from '@/components/ServerCard.vue';
import SearchField from '@/components/SearchField.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { loadServers, searchTerm, selectServer, state, toast } from '@/lib/store';

/** Every saved server as a card, filtered by the sidebar's status and search. */
const servers = computed(() => {
    const term = searchTerm.value;

    return state.servers.filter((server) => {
        const live = state.lives[server.id];
        const matchesFilter = state.serverFilter === 'all' || (state.serverFilter === 'online' ? live?.online === true : live !== undefined && !live.online);
        const matchesSearch = term === '' || server.name.toLowerCase().includes(term) || server.host.includes(term) || (live?.status?.name.toLowerCase().includes(term) ?? false);

        return matchesFilter && matchesSearch;
    });
});

const players = computed(() => state.servers.reduce((sum, server) => sum + (state.lives[server.id]?.status?.players ?? 0), 0));
const online = computed(() => state.servers.filter((server) => state.lives[server.id]?.online).length);

/** The add card ends the grid, unless a filter or search is narrowing it down. */
const showAddCard = computed(() => state.serverFilter === 'all' && !state.search);

async function addDemo(): Promise<void> {
    const server = await window.panel.servers.addDemo();
    await loadServers();
    selectServer(server.id, false);
    toast('info', 'Demo server added', 'It plays a pretend match on this PC, so you can try every control safely.');
}
</script>

<template>
    <ViewHeader title="Servers" subtitle="Every server you run, at a glance">
        <template #actions>
            <button type="button" class="btn btn-primary" @click="state.addingServer = true"><Plus /> Add server</button>
        </template>
    </ViewHeader>

    <div class="toolbar">
        <SearchField placeholder="Search servers by name or address" :count="servers.length" />
    </div>

    <div class="view-body stack">
        <!-- The totals across every server, a small card each -->
        <div class="stats">
            <div class="card stat">
                <span class="panel-icon"><Server /></span>
                <span class="stat-text">
                    <span class="label-caps muted">Online</span>
                    <strong class="num">{{ online }} <span class="of">of {{ state.servers.length }}</span></strong>
                </span>
            </div>
            <div class="card stat">
                <span class="panel-icon"><Users /></span>
                <span class="stat-text">
                    <span class="label-caps muted">Players right now</span>
                    <strong class="num">{{ players }}</strong>
                </span>
            </div>
        </div>

        <div v-if="servers.length > 0 || showAddCard" class="grid">
            <ServerCard v-for="server in servers" :key="server.id" :server="server" />

            <button v-if="showAddCard" type="button" class="add-card" @click="state.addingServer = true">
                <span class="plus"><Plus /></span>
                <strong>Add a server</strong>
                <span class="muted">Its RCON address and password</span>
                <span v-if="!state.servers.some((server) => server.demo)" class="demo-link" @click.stop="addDemo"><FlaskConical /> or try the demo server</span>
            </button>
        </div>

        <section v-else class="card empty no-match">
            <span class="panel-icon"><SearchX /></span>
            <strong>No server matches</strong>
            <span>Nothing fits {{ state.search ? 'that search' : 'this filter' }}. <button type="button" class="link" @click="state.search = ''; state.serverFilter = 'all'">Show all servers</button></span>
        </section>
    </div>
</template>

<style scoped>
.stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr));
    gap: 14px;
}

.stat {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
    padding: 14px 18px;
}

.stat .panel-icon {
    width: 36px;
    height: 36px;
}

.stat .panel-icon svg {
    width: 17px;
    height: 17px;
}

.stat-text {
    display: grid;
    gap: 3px;
    min-width: 0;
}

.stat-text .label-caps {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.stat strong {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
}

.stat .of {
    color: var(--muted);
    font-size: 14px;
    font-weight: 400;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(330px, 100%), 1fr));
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

.add-card:focus-visible {
    outline: none;
    border-color: var(--accent-line);
    box-shadow: 0 0 0 2px var(--accent-line);
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
    transition: transform 0.15s;
}

.add-card:hover .plus {
    transform: scale(1.06);
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

/* Nothing matches: the same card finish as the rest, with the icon in its accent tile. */
.no-match {
    gap: 8px;
    padding: 46px 22px;
}

.no-match .panel-icon {
    width: 44px;
    height: 44px;
    margin-bottom: 6px;
}

.no-match .panel-icon svg {
    width: 20px;
    height: 20px;
    color: inherit;
}

.no-match strong {
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
}

.link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
}

/* A narrow page: smaller gaps between the cards. */
@container page (max-width: 760px) {
    .stats {
        gap: 10px;
    }

    .grid {
        gap: 14px;
    }
}
</style>
