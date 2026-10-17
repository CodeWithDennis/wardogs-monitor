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
    /* The actions stay clear of the window's own buttons (see .content in Shell.vue; the header already pads 35px). */
    padding-right: max(0px, calc(var(--caption-clear, var(--caption-w)) - 35px));
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
    flex: none;
    gap: 10px;
    padding-top: 2px;
}

.bar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 17.5px;
    min-width: 0;
    margin-top: 17.5px;
}

/*
 * In a narrow window the tabs scroll sideways rather than run under the
 * detail panel. The 1px below holds the gold underline over the header's
 * bottom border, where it sat before.
 */
.tabs {
    display: flex;
    gap: 6.5px;
    min-width: 0;
    margin-bottom: -1px;
    padding-bottom: 1px;
    overflow-x: auto;
    scrollbar-width: none;
}

.tabs button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 42px;
    padding: 0 14px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
    transition: color 0.12s;
}

.tabs button:hover {
    color: var(--text);
}

.tabs button:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent-line);
    border-radius: var(--radius);
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
    color: var(--faint);
    font-size: 12.5px;
    font-weight: 500;
}

.on .count {
    color: var(--muted);
}

.filters {
    display: flex;
    flex: none;
    align-items: center;
    gap: 11px;
    padding-bottom: 6.5px;
}

.text {
    min-width: 0;
}

.title {
    overflow-wrap: anywhere;
}

/* A narrow page: less padding, a smaller title, and the actions wrap under it rather than squeeze it. */
@container page (max-width: 760px) {
    .view-header {
        padding: 24px 20px 0;
    }

    .heading {
        flex-wrap: wrap;
        gap: 13px 20px;
        min-height: 0;
        padding-right: max(0px, calc(var(--caption-clear, var(--caption-w)) - 20px));
    }

    .title {
        font-size: 23px;
    }

    .actions {
        flex-wrap: wrap;
    }

    .bar {
        margin-top: 13px;
    }
}
</style>
