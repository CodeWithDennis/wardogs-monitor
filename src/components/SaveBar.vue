<script setup lang="ts">
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
            <button type="button" class="btn btn-primary" :disabled="saving" @click="emit('save')">{{ saving ? 'Saving…' : 'Save to server' }}</button>
        </div>
    </Transition>
</template>

<style scoped>
.save-bar {
    position: sticky;
    bottom: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 13px;
    margin: 26.5px -35px -39.5px;
    padding: 15.5px 35px;
    border-top: 1px solid var(--accent-line);
    background: color-mix(in srgb, var(--panel) 96%, transparent);
    backdrop-filter: blur(9px);
}

.text {
    flex: 1;
    color: var(--text-2);
    font-size: 14.5px;
}

.text.bad {
    color: var(--bad);
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
