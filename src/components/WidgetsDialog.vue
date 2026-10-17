<script setup lang="ts">
import { computed } from 'vue';
import Modal from '@/components/Modal.vue';
import { state } from '@/lib/store';
import { openWidgetOf, toggleWidget, WIDGETS } from '@/lib/widgets';

/**
 * Pick the widgets to keep over the game for one server. Each opens in its
 * own small always-on-top window; any number can be open at once, and they
 * reopen where they were on the next start.
 */
const server = computed(() => state.servers.find((entry) => entry.id === state.widgetPicker) ?? null);
const close = () => (state.widgetPicker = null);
</script>

<template>
    <Modal :open="server !== null" :title="`Widgets for ${server?.name ?? 'this server'}`" :width="520" @close="close">
        <p class="intro muted">Small live windows that stay on top of the game. Open as many as you like, drag them where you want them, and resize them to fit.</p>
        <div v-if="server" class="list">
            <div v-for="widget in WIDGETS" :key="widget.kind" class="item" :class="{ open: openWidgetOf(widget.kind, server.id) }">
                <span class="icon"><component :is="widget.icon" /></span>
                <span class="text">
                    <span class="name">{{ widget.label }}<span v-if="openWidgetOf(widget.kind, server.id)" class="pill pill-gold">Open</span></span>
                    <span class="description muted">{{ widget.description }}</span>
                </span>
                <button type="button" class="btn btn-sm" :class="openWidgetOf(widget.kind, server.id) ? 'btn-ghost' : 'btn-primary'" @click="toggleWidget(widget.kind, server.id)">
                    {{ openWidgetOf(widget.kind, server.id) ? 'Close' : 'Open' }}
                </button>
            </div>
        </div>
        <template #footer>
            <button type="button" class="btn" @click="close">Done</button>
        </template>
    </Modal>
</template>

<style scoped>
.intro {
    margin: 0 0 14px;
    font-size: 14px;
    line-height: 1.55;
}

.list {
    display: grid;
    gap: 8px;
}

.item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--raise);
}

.item.open {
    border-color: var(--accent-line);
}

.icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent);
}

.icon svg {
    width: 18px;
    height: 18px;
}

.text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
}

.description {
    font-size: 13px;
    line-height: 1.45;
}

.item .btn {
    flex: none;
    min-width: 72px;
}
</style>
