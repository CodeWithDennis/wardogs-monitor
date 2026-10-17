<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { nextTick, ref, watch } from 'vue';

/** A dialog over the window: Escape or the backdrop closes it. */
const props = withDefaults(defineProps<{ open: boolean; title: string; width?: number }>(), { width: 440 });
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);

watch(
    () => props.open,
    async (open) => {
        if (open) {
            await nextTick();
            (box.value?.querySelector('[autofocus], input, textarea, select, .btn-primary') as HTMLElement | null)?.focus();
        }
    },
);
</script>

<template>
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="open" class="backdrop" @mousedown.self="emit('close')" @keydown.esc="emit('close')">
                <section ref="box" class="modal" role="dialog" aria-modal="true" :aria-label="title" :style="{ width: `${width}px` }">
                    <header>
                        <h3 class="title">{{ title }}</h3>
                        <button type="button" class="close" aria-label="Close" @click="emit('close')"><X /></button>
                    </header>
                    <div class="body">
                        <slot />
                    </div>
                    <footer v-if="$slots.footer">
                        <slot name="footer" />
                    </footer>
                </section>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
/*
 * Window-drag regions are handled by Windows itself, so they would swallow
 * clicks through anything drawn above them. The backdrop is a no-drag
 * region over the whole window, which cancels them while a dialog is open.
 */
.backdrop {
    -webkit-app-region: no-drag;
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: rgb(5 7 15 / 0.62);
    backdrop-filter: blur(2px);
}

.modal {
    max-width: calc(100vw - 53px);
    max-height: calc(100vh - 70.5px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-top: 1px solid var(--accent-line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: 0 26.5px 66px rgb(0 0 0 / 0.5);
    animation: rise 0.16s ease;
}

header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 22px 0;
}

.title {
    font-size: 18.5px;
    font-weight: 700;
}

.close {
    display: grid;
    place-items: center;
    width: 31px;
    height: 31px;
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
    width: 17.5px;
    height: 17.5px;
}

.body {
    padding: 17.5px 22px 22px;
    overflow: auto;
}

footer {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
    padding: 15.5px 22px;
    border-top: 1px solid var(--line-soft);
    background: rgb(0 0 0 / 0.12);
}
</style>
