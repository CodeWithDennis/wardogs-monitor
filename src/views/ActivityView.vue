<script setup lang="ts">
import { ScrollText } from 'lucide-vue-next';
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

/** Group by day, like a feed. */
const days = computed(() => {
    const groups: { day: string; entries: ActivityEntry[] }[] = [];

    for (const entry of shown.value) {
        const day = new Date(entry.at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const group = groups[groups.length - 1];

        if (group?.day === day) {
            group.entries.push(entry);
        } else {
            groups.push({ day, entries: [entry] });
        }
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
        <section v-for="group in days" :key="group.day" class="day">
            <div class="section-label">
                <span>{{ group.day }}</span>
                <span>{{ group.entries.length }}</span>
            </div>
            <div v-for="entry in group.entries" :key="entry.at + entry.summary" class="entry">
                <span class="dot" :class="entry.ok ? 'online' : 'offline'" />
                <span class="time num muted">{{ dateTime(entry.at).split(', ').pop() }}</span>
                <span class="what">
                    <span class="summary">{{ entry.summary }}</span>
                    <small v-if="entry.error" class="error">{{ entry.error }}</small>
                </span>
                <span v-if="!state.activityServer" class="pill">{{ entry.serverName }}</span>
            </div>
        </section>

        <div v-if="entries === null" aria-busy="true" aria-label="Loading the activity log">
            <div class="skeleton" style="height: 12px; width: 160px; margin-bottom: 15px" />
            <div v-for="i in 7" :key="i" class="entry">
                <div class="skeleton" style="height: 14px; width: 48.5px" />
                <div class="skeleton" style="height: 14px" :style="{ width: `${35 + ((i * 23) % 45)}%` }" />
            </div>
        </div>

        <div v-else-if="days.length === 0" class="empty">
            <ScrollText />
            <span>{{ state.search ? 'Nothing matches that search.' : filter === 'failed' ? 'Nothing failed.' : 'Nothing done from this app yet. Kicks, bans, broadcasts, map changes and saved settings are logged here.' }}</span>
        </div>
    </div>
</template>

<style scoped>
.day + .day {
    margin-top: 28.5px;
}

.entry {
    display: flex;
    align-items: flex-start;
    gap: 15.5px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line-soft);
    font-size: 14.5px;
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
    flex: 1;
    min-width: 0;
    user-select: text;
}

.summary {
    overflow-wrap: anywhere;
}

.entry .pill {
    flex: none;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* A narrow page: the server's name moves under the line instead of squeezing it. */
@container page (max-width: 560px) {
    .entry {
        flex-wrap: wrap;
    }

    .entry .pill {
        max-width: 100%;
        margin-left: calc(9px + 48.5px + 31px);
    }
}

.error {
    color: var(--bad);
    font-size: 13px;
}
</style>
