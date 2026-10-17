<script setup lang="ts">
import { Link2, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { banLists, checkDifferences, describeDifferences, freeGroupName, groupOf, loadBanLists, openSyncPreview, removeBanList, saveBanList } from '@/lib/banlists';
import { ago } from '@/lib/format';
import { now, state } from '@/lib/store';
import type { BanGroup } from '@/types';

/**
 * Options → Ban lists: link servers so they share one ban list. The list
 * is kept on this PC and copied to the servers when you sync, always after
 * a preview you confirm.
 */
const newName = ref('');
const renaming = ref<string | null>(null);
const renameText = ref('');

onMounted(loadBanLists);

async function create(): Promise<void> {
    const group = await saveBanList({ name: newName.value.trim() || freeGroupName(), serverIds: [] });

    if (group) {
        newName.value = '';
    }
}

async function rename(group: BanGroup): Promise<void> {
    const name = renameText.value.trim();

    if (name && name !== group.name) {
        await saveBanList({ id: group.id, name });
    }

    renaming.value = null;
}

function toggleServer(group: BanGroup, serverId: string): void {
    const serverIds = group.serverIds.includes(serverId) ? group.serverIds.filter((id) => id !== serverId) : [...group.serverIds, serverId];
    saveBanList({ id: group.id, serverIds });
}

/** The other group a server is linked in, which keeps it out of this one. */
function elsewhere(group: BanGroup, serverId: string): BanGroup | null {
    const other = groupOf(serverId);

    return other && other.id !== group.id ? other : null;
}

const dot = (serverId: string) => (state.lives[serverId]?.online ? 'online' : state.lives[serverId] ? 'offline' : 'pending');
</script>

<template>
    <div class="banlists">
        <p class="muted intro">
            Link servers so they share one ban list. A game server only keeps its own bans, so the shared list is kept on this PC and copied to each server when you sync. Every sync shows what it will change first, and nothing is sent until you confirm.
        </p>

        <form class="add-row" @submit.prevent="create">
            <input v-model="newName" class="input" maxlength="60" :placeholder="freeGroupName()" />
            <button type="submit" class="btn btn-primary"><Plus /> New ban list</button>
        </form>

        <div v-for="group in banLists.groups" :key="group.id" class="group card">
            <div class="group-head">
                <Link2 class="group-icon" />
                <form v-if="renaming === group.id" class="rename" @submit.prevent="rename(group)">
                    <input v-model="renameText" class="input" maxlength="60" autofocus @keydown.esc="renaming = null" />
                    <button type="submit" class="btn btn-primary btn-sm">Save</button>
                </form>
                <div v-else class="group-title">
                    <h3 class="truncate">{{ group.name }}</h3>
                    <p class="muted">
                        {{ group.serverIds.length }} {{ group.serverIds.length === 1 ? 'server' : 'servers' }} · {{ group.banCount }} shared {{ group.banCount === 1 ? 'ban' : 'bans' }} ·
                        {{ group.lastSyncedAt ? `synced ${ago(group.lastSyncedAt, now)}` : 'never synced' }}
                    </p>
                </div>
                <span class="row-tools">
                    <button type="button" title="Rename" @click="renaming = group.id; renameText = group.name"><Pencil /></button>
                    <button type="button" title="Delete ban list" class="bad" @click="removeBanList(group)"><Trash2 /></button>
                </span>
            </div>

            <div class="section-label servers-label">
                <span>Linked servers</span>
                <span>{{ group.serverIds.length }}/{{ state.servers.length }}</span>
            </div>
            <div class="servers">
                <label v-for="server in state.servers" :key="server.id" class="server" :class="{ on: group.serverIds.includes(server.id), taken: elsewhere(group, server.id) }">
                    <input type="checkbox" :checked="group.serverIds.includes(server.id)" :disabled="elsewhere(group, server.id) !== null" @change="toggleServer(group, server.id)" />
                    <span class="dot" :class="dot(server.id)" />
                    <span class="server-name truncate">{{ server.name }}</span>
                    <span v-if="elsewhere(group, server.id)" class="muted where">In “{{ elsewhere(group, server.id)!.name }}”</span>
                    <span v-else-if="state.lives[server.id]?.locked" class="muted where">Locked</span>
                    <span v-else-if="state.lives[server.id] && !state.lives[server.id]!.online" class="muted where">Offline</span>
                    <span class="mono muted address">{{ server.host }}:{{ server.port }}</span>
                </label>
                <p v-if="state.servers.length === 0" class="muted">Add a server first.</p>
            </div>

            <div class="footer">
                <p v-if="banLists.checks[group.id]?.loading" class="muted check">Reading the linked servers…</p>
                <p v-else-if="banLists.checks[group.id]?.error" class="field-error check">{{ banLists.checks[group.id]!.error }}</p>
                <p v-else-if="banLists.checks[group.id]?.plan" class="check">
                    <template v-for="plan in [banLists.checks[group.id]!.plan!]" :key="plan.fingerprint">
                        <span v-if="describeDifferences(plan.missing, plan.lifting, plan.serversBehind)" class="gold">{{ describeDifferences(plan.missing, plan.lifting, plan.serversBehind) }}.</span>
                        <span v-else class="ok">All {{ plan.servers.length }} {{ plan.servers.length === 1 ? 'server that answered matches' : 'servers that answered match' }}.</span>
                        <span v-if="plan.skipped.length" class="muted"> Skipped: {{ plan.skipped.map((entry) => entry.serverName).join(', ') }}.</span>
                    </template>
                </p>
                <p v-else class="muted check">{{ group.serverIds.length < 2 ? 'Tick at least two servers to link them.' : 'Check what differs, or sync to see a preview.' }}</p>

                <button type="button" class="btn" :disabled="group.serverIds.length < 2 || banLists.checks[group.id]?.loading" @click="checkDifferences(group.id)"><Search /> Check differences</button>
                <button type="button" class="btn btn-primary" :disabled="group.serverIds.length < 2" @click="openSyncPreview(group.id)"><RefreshCw /> Sync now</button>
            </div>
        </div>

        <div v-if="banLists.loaded && banLists.groups.length === 0" class="empty">
            <Link2 />
            <span>No linked ban lists yet. Create one, then tick the servers that should share it.</span>
        </div>
    </div>
</template>

<style scoped>
.intro {
    margin: 0 0 17.5px;
    font-size: 14px;
    line-height: 1.6;
}

.add-row {
    display: flex;
    gap: 9px;
    margin-bottom: 20px;
}

.group {
    padding: 17.5px 20px;
    background: var(--panel);
}

.group + .group {
    margin-top: 13px;
}

.group-head {
    display: flex;
    align-items: center;
    gap: 13px;
    min-height: 44px;
}

.group-icon {
    width: 18.5px;
    height: 18.5px;
    flex: none;
    color: var(--accent);
}

.group-title {
    display: grid;
    gap: 3.5px;
    flex: 1;
    min-width: 0;
}

.group-title h3 {
    margin: 0;
    font-family: var(--font-title);
    font-size: 17.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.group-title p {
    margin: 0;
    font-size: 13.5px;
}

.rename {
    display: flex;
    gap: 9px;
    flex: 1;
}

.row-tools {
    display: flex;
    gap: 2px;
    flex: none;
}

.row-tools button {
    display: grid;
    place-items: center;
    width: 31px;
    height: 31px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
}

.row-tools button:hover {
    background: var(--hover);
    color: var(--text);
}

.row-tools button.bad:hover {
    color: var(--bad);
}

.row-tools svg {
    width: 15.5px;
    height: 15.5px;
}

.servers-label {
    margin-top: 17.5px;
}

.servers {
    display: grid;
    gap: 2px;
}

.server {
    display: flex;
    align-items: center;
    gap: 11px;
    min-height: 40px;
    padding: 0 9px;
    border-radius: var(--radius);
    font-size: 14.5px;
    cursor: pointer;
}

.server:hover {
    background: var(--hover);
}

.server.taken {
    cursor: default;
    opacity: 0.55;
}

.server.taken:hover {
    background: transparent;
}

.server input {
    width: 15.5px;
    height: 15.5px;
    margin: 0;
    flex: none;
    accent-color: var(--accent);
}

.server-name {
    flex: 1;
    min-width: 0;
}

.server.on .server-name {
    color: var(--text);
    font-weight: 500;
}

.where {
    flex: none;
    font-size: 13px;
}

.address {
    width: 176px;
    flex: none;
    font-size: 13px;
    text-align: right;
}

.footer {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 15.5px;
    padding-top: 15.5px;
    border-top: 1px solid var(--line-soft);
}

.check {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
}

.ok {
    color: var(--ok);
}
</style>
