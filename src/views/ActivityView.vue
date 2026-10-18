<script setup lang="ts">
import { CalendarDays, ScrollText } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import SearchField from '@/components/SearchField.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { dateTime } from '@/lib/format';
import { searchTerm, state } from '@/lib/store';
import type { ActivityEntry } from '@/types';

/**
 * Every action taken from this app on this PC, newest first. The website
 * keeps its own log; this one covers the desktop.
 */
const filter = ref<'all' | 'failed'>('all');
/** Null until the log is first read, for the skeleton. */
const entries = ref<ActivityEntry[] | null>(null);

async function load(): Promise<void> {
    entries.value = await window.panel.activity.list(state.activityServer);
}

onMounted(load);
watch([() => state.activityServer, () => state.revision], load);

const serverName = computed(() => state.servers.find((server) => server.id === state.activityServer)?.name ?? null);

const shown = computed(() => {
    const term = searchTerm.value;

    return (entries.value ?? []).filter((entry) => (filter.value === 'all' || !entry.ok) && (term === '' || entry.summary.toLowerCase().includes(term)));
});

/** Group by day, one card each, with how many of the day's actions failed. */
const days = computed(() => {
    const groups: { day: string; entries: ActivityEntry[]; failed: number }[] = [];

    for (const entry of shown.value) {
        const day = new Date(entry.at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        let group = groups[groups.length - 1];

        if (group?.day !== day) {
            group = { day, entries: [], failed: 0 };
            groups.push(group);
        }

        group.entries.push(entry);
        group.failed += entry.ok ? 0 : 1;
    }

    return groups;
});
</script>

<template>
    <ViewHeader title="Activity" :subtitle="serverName ? `What was done on ${serverName} from this app` : 'What was done from this app, on every server'">
    </ViewHeader>

    <div class="toolbar">
        <SearchField placeholder="Search what was done" :count="shown.length" />
        <div class="segmented">
            <button type="button" :class="{ on: filter === 'all' }" @click="filter = 'all'">Everything</button>
            <button type="button" :class="{ on: filter === 'failed' }" @click="filter = 'failed'">Failed</button>
        </div>
    </div>

    <div class="view-body narrow">
        <div class="stack">
            <section v-for="group in days" :key="group.day" class="card panel">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><CalendarDays /></span> {{ group.day }}</span>
                    <span class="panel-aside">
                        {{ group.entries.length }} {{ group.entries.length === 1 ? 'action' : 'actions' }}<template v-if="group.failed && filter === 'all'"> · <span class="bad">{{ group.failed }} failed</span></template>
                    </span>
                </header>
                <div class="panel-flush">
                    <div v-for="entry in group.entries" :key="entry.at + entry.summary" class="entry">
                        <span class="dot" :class="entry.ok ? 'online' : 'offline'" :title="entry.ok ? 'Done' : 'Failed'" />
                        <span class="time num muted">{{ dateTime(entry.at).split(', ').pop() }}</span>
                        <span class="what">
                            <span class="summary">{{ entry.summary }}</span>
                            <small v-if="entry.error" class="error">{{ entry.error }}</small>
                        </span>
                        <span v-if="!state.activityServer" class="pill server">{{ entry.serverName }}</span>
                        <span v-if="!entry.ok" class="pill pill-bad state">Failed</span>
                    </div>
                </div>
            </section>

            <section v-if="entries === null" class="card panel" aria-busy="true" aria-label="Loading the activity log">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><CalendarDays /></span> <span class="skeleton" style="display: block; height: 14px; width: 160px" /></span>
                </header>
                <div class="panel-flush">
                    <div v-for="i in 7" :key="i" class="entry">
                        <div class="skeleton" style="height: 14px; width: 48.5px" />
                        <div class="skeleton" style="height: 14px" :style="{ width: `${35 + ((i * 23) % 45)}%` }" />
                    </div>
                </div>
            </section>

            <section v-else-if="days.length === 0" class="card panel">
                <div class="empty">
                    <ScrollText />
                    <span>{{ state.search ? 'Nothing matches that search.' : filter === 'failed' ? 'Nothing failed.' : 'Nothing done from this app yet. Kicks, bans, broadcasts, map changes and saved settings are logged here.' }}</span>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
/* Entries run edge to edge in the day's card, a soft line between each. */
.entry {
    display: flex;
    align-items: flex-start;
    gap: 15.5px;
    padding: 11px 20px;
    border-top: 1px solid var(--line-soft);
    font-size: 14.5px;
    transition: background 0.1s;
}

.entry:hover {
    background: var(--hover);
}

.entry .dot {
    margin-top: 6.5px;
}

.time {
    width: 48.5px;
    flex: none;
    font-size: 14px;
}

.what {
    display: grid;
    gap: 2px;
    flex: 1;
    min-width: 0;
    user-select: text;
}

.summary {
    overflow-wrap: anywhere;
}

.entry .pill {
    flex: none;
}

.entry .server {
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.error {
    color: var(--bad);
    font-size: 13px;
}

.bad {
    color: var(--bad);
}

/* A narrow page: the server's name moves under the line instead of squeezing it. */
@container page (max-width: 560px) {
    .entry {
        flex-wrap: wrap;
    }

    .entry .server {
        max-width: 100%;
        margin-left: calc(9px + 48.5px + 31px);
    }
}
</style>
