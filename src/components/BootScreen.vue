<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BrandMark from '@/components/BrandMark.vue';
import { BRAND, WORDMARK } from '@/lib/brand';
import { state } from '@/lib/store';

/**
 * The boot screen. index.html paints a static copy from the window's very
 * first frame (its styles live there too, so they are ready before any
 * script); this takes that copy over once the app has mounted, says what is
 * going on, and cross-fades into the app as soon as every server has
 * answered once. A slow or unreachable server never holds the app back: the
 * fade comes anyway shortly after the servers are listed, and the readings
 * fill in as they arrive.
 */

/** How long after the servers are listed it waits, at most, for their first readings. */
const WAIT_FOR_READINGS_MS = 1200;
/** If starting fails outright, get out of the way regardless. */
const GIVE_UP_MS = 8000;

const root = ref<HTMLElement | null>(null);
const showing = ref(true);
/** Started hidden in the tray: no fade nobody would see (a hidden window gets no animation frames). */
const instant = ref(false);

const total = computed(() => state.servers.length);
const answered = computed(() => state.servers.filter((server) => state.lives[server.id] !== undefined).length);
const done = computed(() => state.ready && answered.value >= total.value);

/** How far along, 0 to 1; null until there is something to count. */
const progress = computed(() => (state.ready && total.value > 0 ? answered.value / total.value : null));

const status = computed(() => {
    if (!state.ready) {
        return 'Starting…';
    }

    if (total.value === 0 || done.value) {
        return 'Ready';
    }

    if (answered.value === 0) {
        return total.value === 1 ? `Connecting to ${state.servers[0].name}…` : `Connecting to ${total.value} servers…`;
    }

    return `${answered.value} of ${total.value} servers answered…`;
});

let waitTimer: ReturnType<typeof setTimeout> | undefined;
let giveUpTimer: ReturnType<typeof setTimeout> | undefined;

function finish(): void {
    showing.value = false;
    clearTimeout(waitTimer);
    clearTimeout(giveUpTimer);
}

watch(done, (value) => value && finish());
watch(
    () => state.ready,
    (ready) => {
        if (ready) {
            clearTimeout(waitTimer);
            waitTimer = setTimeout(finish, WAIT_FOR_READINGS_MS);
        }
    },
    { immediate: true },
);

onMounted(() => {
    // Take over from the static copy, its animations carrying on from where
    // they are, so the swap cannot be seen.
    const original = document.getElementById('boot');
    const times = new Map((original?.getAnimations({ subtree: true }) ?? []).map((animation) => [(animation as CSSAnimation).animationName, animation.currentTime]));
    original?.remove();

    for (const animation of root.value?.getAnimations({ subtree: true }) ?? []) {
        const time = times.get((animation as CSSAnimation).animationName);

        if (time !== undefined && time !== null) {
            animation.currentTime = time;
        }
    }

    if (document.hidden) {
        instant.value = true;
        finish();
    } else if (done.value) {
        finish();
    } else {
        giveUpTimer = setTimeout(finish, GIVE_UP_MS);
    }
});

onBeforeUnmount(finish);
</script>

<template>
    <Transition name="boot-out" :css="!instant">
        <div v-if="showing" ref="root" class="boot-screen" role="status" :aria-label="`${BRAND.name}: ${status}`">
            <div class="boot-center">
                <BrandMark />
                <div class="boot-word">{{ WORDMARK.lead }} <span>{{ WORDMARK.last }}</span></div>
                <div class="boot-line" :class="{ waiting: progress === null }">
                    <span :style="progress === null ? undefined : { transform: `scaleX(${Math.max(progress, 0.04)})` }" />
                </div>
                <div class="boot-status">{{ status }}</div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
/* The look itself is in index.html (.boot-screen and friends); only the exit is here. */
.boot-out-leave-active {
    pointer-events: none;
    -webkit-app-region: no-drag;
    transition: opacity 0.42s ease;
}

.boot-out-leave-active .boot-center {
    transition: transform 0.42s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.boot-out-leave-to {
    opacity: 0;
}

.boot-out-leave-to .boot-center {
    transform: scale(1.035);
}

@media (prefers-reduced-motion: reduce) {
    .boot-out-leave-active {
        transition-duration: 0.15s;
    }

    .boot-out-leave-to .boot-center {
        transform: none;
    }
}
</style>
