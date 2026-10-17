<script setup lang="ts">
import { computed } from 'vue';
import { mapPicture } from '@/lib/maps';

/**
 * A map's picture in its lighting, fading into the panel below it like the
 * map header in the reference. Without a picture, a dark contour stands in.
 */
const props = withDefaults(defineProps<{ map?: string | null; lighting?: string | null; variant?: 'square' | 'wide'; fade?: boolean }>(), {
    map: null,
    lighting: null,
    variant: 'wide',
    fade: true,
});

const picture = computed(() => mapPicture(props.map, props.lighting, props.variant));
</script>

<template>
    <div class="art" :class="{ fade }">
        <Transition name="fade" mode="out-in">
            <img v-if="picture" :key="picture" :src="picture" alt="" draggable="false" />
            <div v-else class="none" />
        </Transition>
    </div>
</template>

<style scoped>
.art {
    position: relative;
    overflow: hidden;
    background: var(--raise);
}

img,
.none {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.none {
    background:
        repeating-radial-gradient(circle at 30% 60%, transparent 0 20px, rgb(255 255 255 / 0.04) 20px 21px),
        linear-gradient(160deg, var(--raise), var(--bg));
}

.fade::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
        linear-gradient(180deg, color-mix(in srgb, var(--panel) 5%, transparent) 0%, color-mix(in srgb, var(--panel) 30%, transparent) 45%, var(--panel) 100%),
        linear-gradient(90deg, color-mix(in srgb, var(--bg) 40%, transparent), transparent 60%);
}
</style>
