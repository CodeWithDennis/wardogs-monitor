<script setup lang="ts">
import { Check, ChevronsUpDown, LayoutGrid, Plus } from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { mapName } from '@/lib/maps';
import { openView, selectedServer, selectServer, state } from '@/lib/store';

/**
 * The top-left switcher: the open server with its status, and a list to
 * jump to another one, see them all as cards, or add one. Arrow keys and
 * Enter pick.
 */
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const highlighted = ref(0);

const entries = computed(() =>
    state.servers.map((server) => {
        const live = state.lives[server.id];

        return {
            server,
            dot: live === undefined ? 'pending' : live.online ? 'online' : 'offline',
            detail: live?.online && live.status ? `${live.status.players}/${live.status.maxPlayers} · ${mapName(live.status.map)}` : live ? 'Offline' : 'Connecting…',
        };
    }),
);

const current = computed(() => entries.value.find((entry) => entry.server.id === state.selectedId) ?? null);

async function toggle(): Promise<void> {
    open.value = !open.value;

    if (open.value) {
        highlighted.value = Math.max(0, entries.value.findIndex((entry) => entry.server.id === state.selectedId));
        await nextTick();
        root.value?.querySelector<HTMLElement>('.menu')?.focus();
    }
}

function pick(serverId: string): void {
    open.value = false;
    selectServer(serverId);
}

function showAll(): void {
    open.value = false;
    openView('servers');
}

function add(): void {
    open.value = false;
    state.addingServer = true;
}

function onMenuKey(event: KeyboardEvent): void {
    const count = entries.value.length;

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        highlighted.value = (highlighted.value + 1) % Math.max(1, count);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        highlighted.value = (highlighted.value - 1 + count) % Math.max(1, count);
    } else if (event.key === 'Enter' && entries.value[highlighted.value]) {
        event.preventDefault();
        pick(entries.value[highlighted.value].server.id);
    } else if (event.key === 'Escape') {
        open.value = false;
    }
}

function onDocument(event: MouseEvent): void {
    if (open.value && root.value && !root.value.contains(event.target as Node)) {
        open.value = false;
    }
}

onMounted(() => {
    document.addEventListener('mousedown', onDocument);
});

onUnmounted(() => {
    document.removeEventListener('mousedown', onDocument);
});
</script>

<template>
    <div ref="root" class="switcher">
        <button type="button" class="current" :class="{ open }" :aria-expanded="open" aria-haspopup="listbox" title="Switch server" @click="toggle">
            <span class="dot" :class="current?.dot ?? 'pending'" />
            <span class="text">
                <span class="name truncate">{{ selectedServer?.name ?? 'Pick a server' }}</span>
                <small class="truncate">{{ current?.detail ?? `${state.servers.length} saved` }}</small>
            </span>
            <ChevronsUpDown class="chevron" />
        </button>

        <Transition name="pop">
            <div v-if="open" class="menu" role="listbox" tabindex="-1" @keydown="onMenuKey">
                <div class="menu-label">Servers</div>
                <button
                    v-for="(entry, index) in entries"
                    :key="entry.server.id"
                    type="button"
                    role="option"
                    class="option"
                    :class="{ highlighted: index === highlighted }"
                    :aria-selected="entry.server.id === state.selectedId"
                    @mouseenter="highlighted = index"
                    @click="pick(entry.server.id)"
                >
                    <span class="dot" :class="entry.dot" />
                    <span class="text">
                        <span class="name truncate">{{ entry.server.name }}</span>
                        <small class="truncate">{{ entry.detail }}</small>
                    </span>
                    <span v-if="entry.server.demo" class="pill demo">Demo</span>
                    <Check v-if="entry.server.id === state.selectedId" class="check" />
                </button>
                <p v-if="entries.length === 0" class="none">No servers yet.</p>

                <div class="divider" />
                <button type="button" class="option action" @click="showAll"><LayoutGrid /> All servers</button>
                <button type="button" class="option action" @click="add"><Plus /> Add server</button>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.switcher {
    position: relative;
    margin: 0 22px 22px;
}

.current {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: 53px;
    padding: 0 11px 0 14.5px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: linear-gradient(180deg, var(--raise), var(--panel));
    text-align: left;
    transition: border-color 0.12s;
}

.current:hover,
.current.open {
    border-color: var(--accent-line);
}

.text {
    display: grid;
    flex: 1;
    min-width: 0;
    line-height: 1.25;
}

.name {
    font-size: 15px;
    font-weight: 500;
}

small {
    color: var(--muted);
    font-size: 12.5px;
}

.chevron {
    width: 16.5px;
    height: 16.5px;
    flex: none;
    color: var(--muted);
}

.menu {
    position: absolute;
    top: calc(100% + 6.5px);
    left: 0;
    z-index: 30;
    width: 330px;
    max-height: 462px;
    padding: 6.5px;
    overflow: auto;
    border: 1px solid var(--line);
    border-top: 1px solid var(--accent-line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: 0 20px 48.5px rgb(0 0 0 / 0.5);
    outline: none;
}

.menu-label {
    padding: 6.5px 11px 6.5px;
    color: var(--faint);
    font-family: var(--font-title);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.option {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 48.5px;
    padding: 4.5px 11px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    text-align: left;
}

.option.highlighted,
.option:hover {
    background: var(--hover);
}

.option[aria-selected='true'] .name {
    color: var(--accent);
}

.check {
    width: 16.5px;
    height: 16.5px;
    color: var(--accent);
    flex: none;
}

.demo {
    height: 20px;
    padding: 0 7.5px;
    font-size: 11.5px;
}

.action {
    min-height: 39.5px;
    color: var(--text-2);
    font-size: 14.5px;
}

.action svg {
    width: 16.5px;
    height: 16.5px;
    color: var(--muted);
}

.divider {
    height: 1px;
    margin: 6.5px 4.5px;
    background: var(--line-soft);
}

.none {
    margin: 0;
    padding: 9px 11px;
    color: var(--muted);
    font-size: 14px;
}

.pop-enter-active,
.pop-leave-active {
    transition:
        opacity 0.12s,
        transform 0.12s;
}

.pop-enter-from,
.pop-leave-to {
    opacity: 0;
    transform: translateY(-4.5px);
}
</style>
