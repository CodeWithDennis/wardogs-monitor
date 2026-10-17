<script setup lang="ts">
import { Gauge, LayoutGrid, ScrollText, Search, Settings2 } from 'lucide-vue-next';
import BrandMark from '@/components/BrandMark.vue';
import { BRAND } from '@/lib/brand';
import { openView, section, state, type Section } from '@/lib/store';

/**
 * The narrow column of sections on the far left, like Guides / Lookup /
 * Dungeons in the reference: every server as cards, the open server's
 * controls, the activity log, and options at the bottom.
 */
const items: { id: Section; label: string; icon: unknown; title: string }[] = [
    { id: 'servers', label: 'Servers', icon: LayoutGrid, title: 'All servers (Ctrl+H)' },
    { id: 'control', label: 'Control', icon: Gauge, title: 'The open server' },
    { id: 'activity', label: 'Activity', icon: ScrollText, title: 'What was done from this app' },
];

function open(id: Section): void {
    openView(id === 'control' ? state.lastControlView : id);
}
</script>

<template>
    <nav class="rail" aria-label="Sections">
        <div class="logo drag">
            <BrandMark class="mark" :aria-label="BRAND.name" />
        </div>

        <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="item"
            :data-section="item.id"
            :class="{ active: section === item.id }"
            :disabled="item.id === 'control' && !state.selectedId"
            :title="item.title"
            @click="open(item.id)"
        >
            <component :is="item.icon" :stroke-width="1.75" />
            <span>{{ item.label }}</span>
        </button>

        <button type="button" class="item" title="Search everything: players on every server, servers and actions (Ctrl+K)" @click="state.paletteOpen = true">
            <Search :stroke-width="1.75" />
            <span>Search</span>
        </button>

        <div class="spacer" />

        <button type="button" class="item" data-section="options" :class="{ active: section === 'options' }" @click="openView('options')">
            <Settings2 :stroke-width="1.75" />
            <span>Options</span>
        </button>
    </nav>
</template>

<style scoped>
.rail {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: var(--rail-w);
    flex: none;
    padding-bottom: 13px;
    background: var(--rail);
    border-right: 1px solid var(--line-soft);
}

.logo {
    display: grid;
    place-items: center;
    height: 101px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--line-soft);
}

.logo .mark {
    width: 34px;
    height: 34px;
    filter: drop-shadow(0 0 11px color-mix(in srgb, var(--accent) 25%, transparent));
    opacity: 0.92;
}

.item {
    display: grid;
    justify-items: center;
    gap: 6.5px;
    padding: 14.5px 4.5px 13px;
    border: 0;
    border-left: 2px solid transparent;
    background: transparent;
    color: var(--muted);
    font-family: var(--font-title);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition:
        color 0.12s,
        background 0.12s;
}

.item svg {
    width: 22px;
    height: 22px;
}

.item:hover:not(:disabled) {
    color: var(--text);
    background: rgb(255 255 255 / 0.02);
}

.item.active {
    color: var(--text);
    background: var(--select);
    border-left-color: var(--accent);
}

.item.active svg {
    color: var(--accent);
}

.item:disabled {
    opacity: 0.35;
    cursor: default;
}

.spacer {
    flex: 1;
}
</style>
