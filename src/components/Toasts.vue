<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, X } from 'lucide-vue-next';
import { dismissToast, toasts } from '@/lib/store';

const icons = { ok: CircleCheck, error: CircleAlert, info: Info };
</script>

<template>
    <Teleport to="body">
        <TransitionGroup name="toast" tag="div" class="toasts" aria-live="polite">
            <div v-for="item in toasts" :key="item.id" class="toast" :class="item.kind">
                <component :is="icons[item.kind]" class="icon" />
                <div class="text">
                    <strong>{{ item.title }}</strong>
                    <p v-if="item.body">{{ item.body }}</p>
                </div>
                <button type="button" aria-label="Dismiss" @click="dismissToast(item.id)"><X /></button>
            </div>
        </TransitionGroup>
    </Teleport>
</template>

<style scoped>
.toasts {
    position: fixed;
    right: 22px;
    bottom: 22px;
    z-index: 60;
    display: grid;
    gap: 9px;
    width: 374px;
}

.toast {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 13px 13px 13px 15.5px;
    border: 1px solid var(--line);
    border-left: 2px solid var(--accent);
    border-radius: var(--radius);
    background: var(--raise);
    box-shadow: 0 15.5px 37.5px rgb(0 0 0 / 0.45);
}

.toast.ok {
    border-left-color: var(--ok);
}

.toast.error {
    border-left-color: var(--bad);
}

.icon {
    width: 18.5px;
    height: 18.5px;
    flex: none;
    margin-top: 1px;
}

.ok .icon {
    color: var(--ok);
}

.error .icon {
    color: var(--bad);
}

.info .icon {
    color: var(--accent);
}

.text {
    flex: 1;
    min-width: 0;
    font-size: 14.5px;
}

.text strong {
    display: block;
    font-weight: 500;
    overflow-wrap: anywhere;
}

.text p {
    margin: 3.5px 0 0;
    color: var(--text-2);
    font-size: 14px;
    user-select: text;
}

button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
}

button:hover {
    color: var(--text);
    background: var(--hover);
}

button svg {
    width: 15.5px;
    height: 15.5px;
}

.toast-enter-active,
.toast-leave-active {
    transition:
        opacity 0.2s,
        transform 0.2s;
}

.toast-enter-from,
.toast-leave-to {
    opacity: 0;
    transform: translateX(17.5px);
}
</style>
