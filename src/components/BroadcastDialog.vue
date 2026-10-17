<script setup lang="ts">
import { LoaderCircle, Send } from 'lucide-vue-next';
import { ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { act, busy, openOptions, selectedServer, state } from '@/lib/store';

/**
 * Send a message to everyone on the open server, from wherever you are:
 * type one or pick a saved one, then send. The overview keeps its own
 * broadcast box as well.
 */
const BROADCAST_MAX = 200;

const message = ref('');

watch(
    () => state.broadcasting,
    (open) => {
        if (open) {
            message.value = '';
        }
    },
);

const close = () => (state.broadcasting = false);

async function send(): Promise<void> {
    const result = await act('broadcast', { message: message.value.trim() });

    if (result?.ok) {
        close();
    }
}

function editMessages(): void {
    close();
    openOptions('broadcasts');
}
</script>

<template>
    <Modal :open="state.broadcasting" :title="`Broadcast on ${selectedServer?.name ?? 'the server'}`" :width="520" @close="close">
        <form id="broadcast-dialog" class="form" @submit.prevent="send">
            <label class="field">
                <span class="field-label">
                    <span>Message to everyone</span>
                    <span class="muted num">{{ message.length }}/{{ BROADCAST_MAX }}</span>
                </span>
                <textarea v-model="message" class="input" rows="3" :maxlength="BROADCAST_MAX" placeholder="A message everyone on the server sees" autofocus @keydown.enter.exact.prevent="message.trim() && send()" />
            </label>

            <div v-if="state.preferences.broadcasts.length" class="saved">
                <span class="saved-label muted">Saved messages</span>
                <div class="templates">
                    <button v-for="template in state.preferences.broadcasts" :key="template" type="button" class="pill template" :class="{ chosen: message === template }" @click="message = template">{{ template }}</button>
                </div>
            </div>
        </form>

        <template #footer>
            <button type="button" class="btn btn-ghost edit" @click="editMessages">Edit saved messages</button>
            <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
            <button type="submit" form="broadcast-dialog" class="btn btn-primary" :disabled="message.trim() === '' || busy.broadcast"><LoaderCircle v-if="busy.broadcast" class="spin" /><Send v-else /> Send to everyone</button>
        </template>
    </Modal>
</template>

<style scoped>
.form {
    display: grid;
    gap: 16px;
}

.field-label {
    display: flex;
    justify-content: space-between;
}

textarea.input {
    height: auto;
    min-height: 84px;
    padding-top: 10px;
    padding-bottom: 10px;
    line-height: 1.5;
    resize: none;
}

.saved {
    display: grid;
    gap: 8px;
}

.saved-label {
    font-size: 13px;
}

.templates {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
}

.template {
    border: 1px solid transparent;
    cursor: pointer;
    text-align: left;
}

.template:hover {
    color: var(--text);
}

.template.chosen {
    border-color: var(--accent-line);
    color: var(--text);
}

.edit {
    margin-right: auto;
}
</style>
