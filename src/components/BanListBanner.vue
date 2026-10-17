<script setup lang="ts">
import { Link2, X } from 'lucide-vue-next';
import { computed } from 'vue';
import { banLists, openSyncPreview, startupDifferences } from '@/lib/banlists';
import { state } from '@/lib/store';

/**
 * A strip above the page when the linked ban lists differed at start-up.
 * It only opens the preview; syncing still needs the user's confirm there.
 * Dismissed, it stays away until the app starts again.
 */
const props = defineProps<{ wide: boolean }>();

/** Without the detail panel beside it (or with it folded), the window's own buttons sit over the banner's right end. */
const underWindowButtons = computed(() => props.wide || state.preferences.detailCollapsed);

const show = computed(() => !banLists.bannerDismissed && startupDifferences.value !== null && banLists.preview === null);

function review(): void {
    const first = banLists.startup.find((plan) => plan.missing + plan.lifting > 0);

    if (first) {
        openSyncPreview(first.groupId);
    }
}
</script>

<template>
    <div v-if="show" class="banner" :class="{ clear: underWindowButtons }">
        <Link2 class="icon" />
        <span>Your linked ban lists differ: {{ startupDifferences }}.</span>
        <button type="button" class="btn btn-primary btn-sm" @click="review">Review and sync</button>
        <button type="button" class="close" title="Dismiss until the app starts again" @click="banLists.bannerDismissed = true"><X /></button>
    </div>
</template>

<style scoped>
.banner {
    display: flex;
    flex: none;
    align-items: center;
    gap: 12px;
    padding: 10px 22px 10px 32px;
    border-bottom: 1px solid var(--accent-line);
    background: var(--accent-soft);
    font-size: 13.5px;
}

.banner.clear {
    padding-right: 154px;
}

.banner span {
    flex: 1;
}

.icon {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--accent);
}

.close {
    display: grid;
    place-items: center;
    width: 28.5px;
    height: 28.5px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
}

.close:hover {
    background: var(--hover);
    color: var(--text);
}

.close svg {
    width: 15.5px;
    height: 15.5px;
}
</style>
