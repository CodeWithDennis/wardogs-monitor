<script setup lang="ts">
import { Megaphone, RotateCcw, Send, SkipForward } from 'lucide-vue-next';
import { onUnmounted, ref } from 'vue';
import type { WidgetProps } from '@/types';

/**
 * The actions an admin reaches for mid-match, without opening the app:
 * broadcast a saved or typed message, restart or end the match. With
 * "confirm actions" on (Options), each one asks for a second click first;
 * the widget has no room for a dialog.
 */
const props = defineProps<WidgetProps>();
const emit = defineEmits<{ refresh: [] }>();

const message = ref('');
const busy = ref(false);
const armed = ref<string | null>(null);
const feedback = ref<{ ok: boolean; text: string } | null>(null);
let disarm: ReturnType<typeof setTimeout> | undefined;
let fade: ReturnType<typeof setTimeout> | undefined;

/** The first click arms an action for a few seconds; the second runs it. */
function ready(key: string): boolean {
    if (!props.preferences.confirmActions || armed.value === key) {
        armed.value = null;
        clearTimeout(disarm);

        return true;
    }

    armed.value = key;
    clearTimeout(disarm);
    disarm = setTimeout(() => (armed.value = null), 3500);

    return false;
}

async function run(key: string, name: string, args: Record<string, unknown> = {}): Promise<void> {
    if (busy.value || !ready(key)) {
        return;
    }

    busy.value = true;

    try {
        const result = await window.panel.server.act(props.serverId, name, args);
        feedback.value = result.ok ? { ok: true, text: result.summary } : { ok: false, text: result.error ?? 'That did not work.' };

        if (result.ok && name === 'broadcast' && key === 'custom') {
            message.value = '';
        }
    } finally {
        busy.value = false;
        clearTimeout(fade);
        fade = setTimeout(() => (feedback.value = null), 5000);
        emit('refresh');
    }
}

function sendTyped(): void {
    const text = message.value.trim();

    if (text) {
        run('custom', 'broadcast', { message: text });
    }
}

onUnmounted(() => {
    clearTimeout(disarm);
    clearTimeout(fade);
});
</script>

<template>
    <div class="actions-widget">
        <div class="match">
            <button type="button" class="btn btn-sm" :class="{ armed: armed === 'restart' }" :disabled="busy" @click="run('restart', 'restartMatch')">
                <RotateCcw /> {{ armed === 'restart' ? 'Click to restart' : 'Restart match' }}
            </button>
            <button type="button" class="btn btn-sm" :class="{ armed: armed === 'end' }" :disabled="busy" @click="run('end', 'endMatch')">
                <SkipForward /> {{ armed === 'end' ? 'Click to end' : 'End match' }}
            </button>
        </div>

        <div class="label">Broadcast</div>
        <div class="presets">
            <button v-for="(text, index) in preferences.broadcasts" :key="index" type="button" class="preset" :class="{ armed: armed === `preset-${index}` }" :disabled="busy" :title="text" @click="run(`preset-${index}`, 'broadcast', { message: text })">
                <Megaphone class="preset-icon" />
                <span class="truncate">{{ armed === `preset-${index}` ? 'Click again to send' : text }}</span>
            </button>
        </div>

        <form class="send" @submit.prevent="sendTyped">
            <input v-model="message" class="input" maxlength="200" placeholder="Type a message…" />
            <button type="submit" class="btn btn-primary btn-sm" :class="{ armed: armed === 'custom' }" :disabled="busy || !message.trim()" :title="armed === 'custom' ? 'Click again to send' : 'Send to everyone'"><Send /></button>
        </form>

        <p v-if="feedback" class="feedback" :class="feedback.ok ? 'ok' : 'bad'">{{ feedback.text }}</p>
    </div>
</template>

<style scoped>
.match {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.match .btn {
    min-width: 0;
}

.btn.armed,
.preset.armed {
    border-color: color-mix(in srgb, var(--bad) 60%, transparent);
    background: var(--bad-soft);
    color: var(--text);
}

.label {
    margin: 14px 0 7px;
    color: var(--faint);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.presets {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: 0;
    overflow-y: auto;
}

.preset {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 31px;
    padding: 0 11px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--raise);
    color: var(--text-2);
    font-size: 13px;
    text-align: left;
}

.preset:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
}

.preset-icon {
    width: 13px;
    height: 13px;
    flex: none;
    color: var(--accent);
}

.send {
    display: flex;
    gap: 7px;
    margin-top: 10px;
}

.send .input {
    flex: 1;
    min-width: 0;
    height: 32px;
    font-size: 13px;
}

.send .btn {
    flex: none;
    width: 38px;
    padding: 0;
}

.feedback {
    margin: 9px 0 0;
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.feedback.ok {
    color: var(--ok);
}

.feedback.bad {
    color: var(--bad);
}
</style>
