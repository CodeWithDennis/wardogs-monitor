<script setup lang="ts">
import { computed, ref } from 'vue';
import { time } from '@/lib/format';

/**
 * Players online since this app opened, as a soft gold area. Hovering
 * shows the count at that moment.
 */
const props = defineProps<{ points: { at: number; players: number }[]; max: number }>();

const WIDTH = 600;
const HEIGHT = 120;
const hover = ref<number | null>(null);

const top = computed(() => Math.max(props.max, ...props.points.map((point) => point.players), 1));

const coords = computed(() => {
    const points = props.points;

    if (points.length < 2) {
        return [];
    }

    const first = points[0].at;
    const span = Math.max(1, points[points.length - 1].at - first);

    return points.map((point) => ({
        x: ((point.at - first) / span) * WIDTH,
        y: HEIGHT - (point.players / top.value) * (HEIGHT - 8) - 2,
        point,
    }));
});

const line = computed(() => coords.value.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '));
const area = computed(() => (coords.value.length ? `${line.value} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z` : ''));
const hovered = computed(() => (hover.value === null ? null : coords.value[hover.value] ?? null));

function move(event: MouseEvent): void {
    const box = (event.currentTarget as SVGElement).getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    let best = 0;

    coords.value.forEach((c, i) => {
        if (Math.abs(c.x - x) < Math.abs(coords.value[best].x - x)) {
            best = i;
        }
    });

    hover.value = best;
}
</script>

<template>
    <div class="chart">
        <template v-if="coords.length">
            <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" @mousemove="move" @mouseleave="hover = null">
                <defs>
                    <linearGradient id="players-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" style="stop-color: var(--accent)" stop-opacity="0.32" />
                        <stop offset="100%" style="stop-color: var(--accent)" stop-opacity="0" />
                    </linearGradient>
                </defs>
                <line v-for="step in [0.25, 0.5, 0.75]" :key="step" x1="0" :x2="WIDTH" :y1="HEIGHT * step" :y2="HEIGHT * step" class="grid" />
                <path :d="area" fill="url(#players-fill)" />
                <path :d="line" class="stroke" vector-effect="non-scaling-stroke" />
                <line v-if="hovered" :x1="hovered.x" :x2="hovered.x" y1="0" :y2="HEIGHT" class="cursor" vector-effect="non-scaling-stroke" />
            </svg>
            <div v-if="hovered" class="tip" :style="{ left: `${(hovered.x / WIDTH) * 100}%` }">
                <strong class="num">{{ hovered.point.players }}</strong> players · {{ time(new Date(hovered.point.at).toISOString()) }}
            </div>
            <div class="axis muted">
                <span>{{ time(new Date(points[0].at).toISOString()) }}</span>
                <span>now</span>
            </div>
        </template>
        <p v-else class="muted wait">The chart fills in as readings come in.</p>
    </div>
</template>

<style scoped>
.chart {
    position: relative;
}

svg {
    display: block;
    width: 100%;
    height: 132px;
    cursor: crosshair;
}

.grid {
    stroke: rgb(255 255 255 / 0.05);
    stroke-width: 1;
}

.stroke {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.75;
}

.cursor {
    stroke: rgb(255 255 255 / 0.35);
    stroke-dasharray: 3 3;
}

.tip {
    position: absolute;
    top: -6.5px;
    transform: translateX(-50%);
    padding: 3.5px 9px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    font-size: 13px;
    white-space: nowrap;
    pointer-events: none;
}

.axis {
    display: flex;
    justify-content: space-between;
    margin-top: 6.5px;
    font-size: 12.5px;
}

.wait {
    margin: 0;
    padding: 33px 0;
    text-align: center;
    font-size: 14px;
}
</style>
