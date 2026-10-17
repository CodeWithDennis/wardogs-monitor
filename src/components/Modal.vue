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
                <section ref="box" class="modal" role="dialog" aria-modal="true" :aria-label="title" :style="{ '--modal-w': `${width}px` }">
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

/*
 * Callers pass widths from before the layout was set 10% larger, so the
 * width is scaled here to match everything inside. It never grows past the
 * window, and the body scrolls when the window is short.
 */
.modal {
    width: calc(var(--modal-w, 440px) * 1.1);
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 70px);
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--pop-line);
    border-top-color: var(--accent-line);
    border-radius: var(--radius-pop);
    background: var(--panel);
    box-shadow: var(--shadow-pop);
    animation: rise 0.16s ease;
}

header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 16px 0 24px;
}

.title {
    min-width: 0;
    font-size: 19px;
    font-weight: 700;
    line-height: 1.2;
    overflow-wrap: anywhere;
}

.close {
    display: grid;
    flex: none;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
    transition:
        background 0.12s,
        color 0.12s;
}

.close:hover {
    background: var(--hover);
    color: var(--text);
}

.close:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent-line);
}

.close svg {
    width: 18px;
    height: 18px;
}

.body {
    min-height: 0;
    padding: 16px 24px 24px;
    overflow: auto;
}

/* Buttons wrap onto a second line rather than spill out; the last one (the main action) stays on the right. */
footer {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 24px;
    border-top: 1px solid var(--line-soft);
    border-radius: 0 0 var(--radius-pop) var(--radius-pop);
    background: rgb(0 0 0 / 0.14);
}
</style>
