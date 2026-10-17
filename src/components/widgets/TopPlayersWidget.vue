<script setup lang="ts">
import { computed } from 'vue';
import { ratio } from '@/lib/format';
import type { WidgetProps } from '@/types';

/** The leaderboard: most kills first, fewer deaths breaking a tie. */
const props = defineProps<WidgetProps>();

const ranked = computed(() => [...props.live.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name)).slice(0, 25));
</script>

<template>
    <div class="players-widget">
        <div v-if="ranked.length" class="board">
            <div class="row head">
                <span>#</span>
                <span>Player</span>
                <span class="right">K</span>
                <span class="right">D</span>
                <span class="right">K/D</span>
            </div>
            <div class="rows">
                <div v-for="(player, index) in ranked" :key="player.steamId" class="row" :class="{ podium: index < 3 }">
                    <span class="rank num">{{ index + 1 }}</span>
                    <span class="name truncate"><span class="swatch" :style="{ background: player.factionColor ?? 'var(--muted)' }" />{{ player.name }}</span>
                    <span class="right num strong">{{ player.kills }}</span>
                    <span class="right num">{{ player.deaths }}</span>
                    <span class="right num muted">{{ ratio(player.kills, player.deaths) }}</span>
                </div>
            </div>
        </div>
        <p v-else class="empty muted">Nobody is playing right now.</p>
    </div>
</template>

<style scoped>
.players-widget {
    padding-right: 10px !important;
}

/* The whole board scrolls under a sticky header, so the columns line up with or without a scrollbar. */
.board {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 34px 34px 44px;
    align-items: center;
    gap: 6px;
    height: 29px;
    padding-right: 7px;
    font-size: 13.5px;
}

.row.head {
    position: sticky;
    top: 0;
    z-index: 1;
    height: 24px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
    color: var(--faint);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.rows .row + .row {
    border-top: 1px solid var(--line-soft);
}

.rank {
    color: var(--faint);
    font-size: 12px;
}

.podium .rank {
    color: var(--accent);
    font-weight: 700;
}

.name {
    display: flex;
    align-items: center;
    gap: 8px;
}

.swatch {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 2px;
}

.right {
    text-align: right;
}

.strong {
    font-weight: 600;
}

.empty {
    margin: 0;
    font-size: 13.5px;
}
</style>
