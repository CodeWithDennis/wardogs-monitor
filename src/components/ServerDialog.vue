<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { loadServers, refreshLive, selectServer, state, toast } from '@/lib/store';

/**
 * Add a server, or change one. The server must answer with the password
 * before it is saved; the password is then encrypted for this Windows
 * account and never shown again.
 */
const form = reactive({ name: '', host: '', port: '', password: '' });
const error = ref<string | null>(null);
const saving = ref(false);

const editing = computed(() => state.editingServer);
const open = computed(() => state.addingServer || editing.value !== null);

watch(open, (isOpen) => {
    if (!isOpen) {
        return;
    }

    error.value = null;
    Object.assign(form, editing.value ? { name: editing.value.name, host: editing.value.host, port: String(editing.value.port), password: '' } : { name: '', host: '', port: '', password: '' });
});

/** Pasting "165.217.136.57:9001" into the address fills the port too. */
function splitAddress(): void {
    const match = form.host.trim().match(/^(?:https?:\/\/)?([^/\s:]+|\[[^\]]+\]):(\d{1,5})\/?.*$/);

    if (match) {
        form.host = match[1];
        form.port = match[2];
    }
}

function close(): void {
    state.addingServer = false;
    state.editingServer = null;
}

async function save(): Promise<void> {
    splitAddress();
    saving.value = true;
    error.value = null;

    try {
        const result = await window.panel.servers.save({
            id: editing.value?.id,
            name: form.name.trim() || form.host.trim(),
            host: form.host.trim(),
            port: Number(form.port),
            password: form.password || undefined,
        });

        if (!result.ok) {
            error.value = result.error;

            return;
        }

        await loadServers();
        selectServer(result.server.id);
        refreshLive(result.server.id, true);
        toast('ok', editing.value ? `Saved ${result.server.name}` : `Added ${result.server.name}`);
        close();
    } finally {
        saving.value = false;
    }
}

async function addDemo(): Promise<void> {
    const server = await window.panel.servers.addDemo();
    await loadServers();
    selectServer(server.id);
    toast('info', 'Demo server added', 'It plays a pretend match on this PC, so you can try every control safely.');
    close();
}
</script>

<template>
    <Modal :open="open" :title="editing ? `Edit ${editing.name}` : 'Add a server'" :width="460" @close="close">
        <form class="form" @submit.prevent="save">
            <p class="intro muted">
                Use the RCON address from your host's panel (on BisectHosting, the panel's IP and port) and the RCON password from <span class="mono">ServerSettings.ini</span>.
            </p>

            <label class="field">
                <span class="field-label">Name</span>
                <input v-model="form.name" class="input" placeholder="My community | Events" maxlength="60" autofocus />
            </label>

            <div class="address">
                <label class="field">
                    <span class="field-label">Address</span>
                    <input v-model="form.host" class="input" placeholder="165.217.136.57" spellcheck="false" required @blur="splitAddress" />
                </label>
                <label class="field">
                    <span class="field-label">Port</span>
                    <input v-model="form.port" class="input num" placeholder="9001" inputmode="numeric" required />
                </label>
            </div>

            <label class="field">
                <span class="field-label">RCON password</span>
                <input v-model="form.password" class="input" type="password" :placeholder="editing ? 'Leave empty to keep the saved one' : ''" :required="!editing" autocomplete="off" />
                <span class="field-hint">Encrypted for your Windows account. It never leaves this PC except to the server.</span>
            </label>

            <p v-if="error" class="field-error" role="alert">{{ error }}</p>

            <button type="submit" hidden />
        </form>

        <template #footer>
            <button v-if="!editing && !state.servers.some((server) => server.demo)" type="button" class="btn btn-ghost demo" @click="addDemo">Try the demo server</button>
            <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
            <button type="button" class="btn btn-primary" :disabled="saving || !form.host || !form.port" @click="save">
                {{ saving ? 'Connecting…' : editing ? 'Save' : 'Connect and add' }}
            </button>
        </template>
    </Modal>
</template>

<style scoped>
.form {
    display: grid;
    gap: 17.5px;
}

.intro {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
}

.address {
    display: grid;
    grid-template-columns: 1fr 121px;
    gap: 13px;
}

.demo {
    margin-right: auto;
}
</style>
