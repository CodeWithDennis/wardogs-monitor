<script setup lang="ts">
import { ago } from '@/lib/format';
import { now } from '@/lib/store';

/**
 * "12s ago", kept current by the app's one-second clock. Only this little
 * span re-renders every second, not the card or page around it.
 */
const props = defineProps<{ at: string | number | null | undefined }>();

const iso = (value: string | number | null | undefined) => (typeof value === 'number' ? new Date(value).toISOString() : value);
</script>

<template>
    <span>{{ ago(iso(props.at), now) }}</span>
</template>
