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
    gap: 10px;
    width: 374px;
    max-width: calc(100vw - 44px);
}

/* The same finish as dialogs and menus, with a coloured stripe for the kind. */
.toast {
    --stripe: var(--accent);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 10px 12px 16px;
    border: 1px solid var(--pop-line);
    border-radius: var(--radius-pop);
    background: var(--panel);
    box-shadow:
        inset 3px 0 0 var(--stripe),
        var(--shadow-pop);
}

.toast.ok {
    --stripe: var(--ok);
}

.toast.error {
    --stripe: var(--bad);
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
    font-weight: 600;
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

/* The others slide into place when one goes, instead of jumping. */
.toast-move {
    transition: transform 0.2s ease;
}
</style>
