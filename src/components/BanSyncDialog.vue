<script setup lang="ts">
import { AlertTriangle, ChevronDown, ChevronRight, CircleCheck, CloudOff } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { banLists, closeSyncPreview, confirmSync, describeDifferences } from '@/lib/banlists';
import { dateTime } from '@/lib/format';
import { state } from '@/lib/store';

/**
 * The preview every sync goes through: per linked server, which bans it
 * would get and which it would lift, and which servers are skipped and
 * why. Only the button at the bottom writes, and only this plan.
 */
const preview = computed(() => banLists.preview);
const plan = computed(() => preview.value?.plan ?? null);
const open = ref<Record<string, boolean>>({});

watch(
    () => plan.value?.fingerprint,
    () => {
        open.value = {};
    },
);

const changes = computed(() => (plan.value ? plan.value.missing + plan.value.lifting : 0));
const summary = computed(() => (plan.value ? describeDifferences(plan.value.missing, plan.value.lifting, plan.value.serversBehind) : null));

const serverName = (id: string | null | undefined) => (id ? (state.servers.find((server) => server.id === id)?.name ?? null) : null);
</script>

<template>
    <Modal :open="preview !== null" :title="plan ? `Sync “${plan.groupName}”` : 'Sync ban lists'" :width="520" @close="closeSyncPreview">
        <div v-if="preview?.loading" class="loading">
            <div v-for="i in 3" :key="i" class="skeleton" style="height: 44px" />
        </div>

        <p v-else-if="preview?.error" class="field-error">{{ preview.error }}</p>

        <div v-else-if="plan" class="preview">
            <p v-if="preview?.note" class="note"><AlertTriangle />{{ preview.note }}</p>

            <p class="lead">
                <template v-if="summary">{{ summary[0].toUpperCase() + summary.slice(1) }}. </template>
                <template v-else>Every server that answered already has the same bans. </template>
                <span class="muted">The shared list holds {{ plan.sharedCount }} {{ plan.sharedCount === 1 ? 'ban' : 'bans' }}. Nothing is sent until you confirm.</span>
            </p>

            <div class="section-label">
                <span>Servers</span>
                <span>{{ plan.servers.length }}</span>
            </div>

            <div v-for="server in plan.servers" :key="server.serverId" class="server">
                <button type="button" class="server-row" :disabled="server.toAdd.length + server.toRemove.length === 0" @click="open[server.serverId] = !open[server.serverId]">
                    <component :is="server.toAdd.length + server.toRemove.length === 0 ? CircleCheck : open[server.serverId] ? ChevronDown : ChevronRight" class="chevron" :class="{ ok: server.toAdd.length + server.toRemove.length === 0 }" />
                    <strong class="truncate">{{ server.serverName }}</strong>
                    <span v-if="server.toAdd.length + server.toRemove.length === 0" class="muted counts">Up to date</span>
                    <span v-else class="counts">
                        <span v-if="server.toAdd.length" class="pill pill-bad">+{{ server.toAdd.length }} {{ server.toAdd.length === 1 ? 'ban' : 'bans' }} to add</span>
                        <span v-if="server.toRemove.length" class="pill pill-ok">−{{ server.toRemove.length }} to lift</span>
                    </span>
                </button>

                <div v-if="open[server.serverId]" class="changes">
                    <div v-for="ban in server.toAdd" :key="`add-${ban.steamId}`" class="change">
                        <span class="sign add">+</span>
                        <span class="mono">{{ ban.steamId }}</span>
                        <span class="truncate" :class="{ muted: !ban.reason }">{{ ban.reason || 'No reason' }}</span>
                        <span class="muted from truncate">{{ serverName(ban.sourceServerId) ? `from ${serverName(ban.sourceServerId)}` : ban.bannedAt ? dateTime(ban.bannedAt) : 'shared list' }}</span>
                    </div>
                    <div v-for="entry in server.toRemove" :key="`lift-${entry.steamId}`" class="change">
                        <span class="sign lift">−</span>
                        <span class="mono">{{ entry.steamId }}</span>
                        <span class="muted truncate">Lifted through the app</span>
                        <span class="muted from">{{ dateTime(entry.removedAt) }}</span>
                    </div>
                </div>
            </div>

            <template v-if="plan.skipped.length">
                <div class="section-label skipped-label">
                    <span>Skipped</span>
                    <span>{{ plan.skipped.length }}</span>
                </div>
                <div v-for="server in plan.skipped" :key="server.serverId" class="skipped">
                    <CloudOff class="chevron" />
                    <strong class="truncate">{{ server.serverName }}</strong>
                    <span class="muted reason">{{ server.reason }}</span>
                </div>
                <p class="muted hint">Skipped servers are left as they are. Sync again when they are back.</p>
            </template>
        </div>

        <template #footer>
            <button type="button" class="btn btn-ghost" :disabled="preview?.syncing" @click="closeSyncPreview">Cancel</button>
            <button type="button" class="btn btn-primary" :disabled="!plan || preview?.loading || preview?.syncing || plan.servers.length === 0" @click="confirmSync">
                {{ preview?.syncing ? 'Syncing…' : changes > 0 ? `Sync ${changes} ${changes === 1 ? 'change' : 'changes'}` : 'Mark as synced' }}
            </button>
        </template>
    </Modal>
</template>

<style scoped>
.loading {
    display: grid;
    gap: 9px;
}

.preview {
    display: grid;
}

.note {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 0 0 15.5px;
    padding: 10px 13px;
    border: 1px solid var(--accent-line);
    border-radius: var(--radius);
    background: var(--accent-soft);
    font-size: 14px;
    line-height: 1.5;
}

.note svg {
    width: 16px;
    height: 16px;
    flex: none;
    margin-top: 2px;
    color: var(--accent);
}

.lead {
    margin: 0 0 20px;
    color: var(--text-2);
    font-size: 14.5px;
    line-height: 1.6;
}

.server {
    border-bottom: 1px solid var(--line-soft);
}

.server-row,
.skipped {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    min-height: 44px;
    padding: 0 6.5px;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 14.5px;
    text-align: left;
}

.server-row:not(:disabled):hover {
    background: var(--hover);
}

.server-row:disabled {
    cursor: default;
}

.server-row strong,
.skipped strong {
    flex: 1;
    min-width: 0;
    font-weight: 500;
}

.chevron {
    width: 15.5px;
    height: 15.5px;
    flex: none;
    color: var(--muted);
}

.chevron.ok {
    color: var(--ok);
}

.counts {
    display: flex;
    gap: 6.5px;
    flex: none;
    font-size: 14px;
}

.changes {
    display: grid;
    gap: 2px;
    max-height: 242px;
    overflow: auto;
    padding: 0 6.5px 11px 33px;
}

.change {
    display: grid;
    grid-template-columns: 13px 170px minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    min-height: 29px;
    font-size: 13.5px;
    user-select: text;
}

.sign {
    font-weight: 700;
    text-align: center;
}

.sign.add {
    color: var(--bad);
}

.sign.lift {
    color: var(--ok);
}

.from {
    max-width: 176px;
    font-size: 13px;
    text-align: right;
}

.skipped-label {
    margin-top: 22px;
}

.skipped {
    cursor: default;
}

.reason {
    max-width: 264px;
    font-size: 13.5px;
    text-align: right;
}

.hint {
    margin: 9px 0 0;
    font-size: 13px;
}
</style>
