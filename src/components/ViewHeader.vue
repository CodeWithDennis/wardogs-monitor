<script setup lang="ts">
/**
 * The starry header of every view: a title, a line under it and tabs with
 * a gold underline, like "Home / Pick a guide…" in the reference. The
 * `filters` slot sits right of the tabs (like Alliance / Horde / All).
 */
defineProps<{
    title: string;
    subtitle?: string;
    tabs?: { id: string; label: string; count?: number }[];
}>();

const tab = defineModel<string>('tab');
</script>

<template>
    <header class="view-header sky drag">
        <div class="heading">
            <div class="text">
                <h2 class="title">{{ title }}</h2>
                <p v-if="subtitle || $slots.subtitle" class="subtitle">
                    <slot name="subtitle">{{ subtitle }}</slot>
                </p>
            </div>
            <div v-if="$slots.actions" class="actions">
                <slot name="actions" />
            </div>
        </div>

        <div v-if="tabs || $slots.filters" class="bar">
            <nav v-if="tabs" class="tabs">
                <button v-for="item in tabs" :key="item.id" type="button" :class="{ on: tab === item.id }" @click="tab = item.id">
                    {{ item.label }}
                    <span v-if="item.count !== undefined" class="count num">{{ item.count }}</span>
                </button>
            </nav>
            <div class="filters">
                <slot name="filters" />
            </div>
        </div>
    </header>
</template>

<style scoped>
.view-header {
    flex: none;
    padding: 33px 35px 0;
    border-bottom: 1px solid var(--line);
}

.heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 26.5px;
    min-height: 75px;
    padding-right: 132px;
}

.title {
    font-size: 28.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1.15;
}

.subtitle {
    margin: 7.5px 0 0;
    color: var(--text-2);
    font-size: 14.5px;
}

.actions {
    display: flex;
    gap: 9px;
    padding-top: 4.5px;
}

.bar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 17.5px;
    margin-top: 17.5px;
}

.tabs {
    display: flex;
    gap: 6.5px;
}

.tabs button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7.5px;
    height: 42px;
    padding: 0 14.5px;
    border: 0;
    background: transparent;
    color: var(--text-2);
    font-family: var(--font-title);
    font-size: calc(14px * var(--title-scale, 1));
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
}

.tabs button:hover {
    color: var(--text);
}

.tabs button.on {
    color: var(--text);
}

.tabs button.on::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    background: var(--accent);
}

.count {
    color: var(--muted);
    font-size: 13px;
}

.filters {
    display: flex;
    align-items: center;
    gap: 11px;
    padding-bottom: 6.5px;
}
</style>
