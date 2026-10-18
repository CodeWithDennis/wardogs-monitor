<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next';

/** The bar that slides up while a form has unsaved changes. */
defineProps<{ show: boolean; saving: boolean; note?: string; error?: string | null }>();
const emit = defineEmits<{ save: []; discard: [] }>();
</script>

<template>
    <Transition name="bar">
        <div v-if="show" class="save-bar">
            <span class="dot" :class="error ? 'offline' : 'pending'" />
            <span class="text" :class="{ bad: error }">{{ error || note || 'You have unsaved changes' }}</span>
            <button type="button" class="btn btn-ghost" :disabled="saving" @click="emit('discard')">Discard</button>
            <button type="button" class="btn btn-primary" :disabled="saving" @click="emit('save')"><LoaderCircle v-if="saving" class="spin" />{{ saving ? 'Saving…' : 'Save to server' }}</button>
        </div>
    </Transition>
</template>

<style scoped>
/*
 * A floating card that sticks to the bottom of the page while it scrolls,
 * as wide as the content above it, so it never runs off past the page's
 * edges or under the detail panel.
 */
.save-bar {
    position: sticky;
    bottom: 16px;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 13px;
    margin-top: 22px;
    padding: 12px 14px 12px 18px;
    border: 1px solid var(--accent-line);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--panel) 94%, transparent);
    box-shadow: var(--shadow-pop);
    backdrop-filter: blur(9px);
}

.text {
    flex: 1;
    min-width: 0;
    color: var(--text-2);
    font-size: 14.5px;
}

.text.bad {
    color: var(--bad);
}

/* On a narrow page the buttons wrap under the message. */
@container page (max-width: 760px) {
    .save-bar {
        flex-wrap: wrap;
    }

    .text {
        flex-basis: calc(100% - 30px);
    }
}

.bar-enter-active,
.bar-leave-active {
    transition:
        transform 0.18s ease,
        opacity 0.18s;
}

.bar-enter-from,
.bar-leave-to {
    transform: translateY(100%);
    opacity: 0;
}
</style>
