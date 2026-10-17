import { gameName } from './format';

/**
 * The map pictures (the game's own loading screens), in
 * every lighting, square and wide. Maps are named by region on the server
 * ("Europe") and by their own name in the live status ("Ozeti"); every
 * helper takes either.
 */
const pictures = import.meta.glob('../assets/maps/*/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const MAPS: { id: string; name: string }[] = [
    { id: 'Europe', name: 'Ozeti' },
    { id: 'Kavkazi', name: 'Bakurani' },
    { id: 'NorthAmerica', name: 'Zestafona' },
];

const DEFAULT_LIGHTING = 'DayClear';

function find(map: string) {
    const key = map.toLowerCase();

    return MAPS.find((entry) => entry.id.toLowerCase() === key || entry.name.toLowerCase() === key) ?? null;
}

/** The name players know: "Europe" → "Ozeti". */
export function mapName(map: string): string {
    return find(map)?.name ?? gameName(map);
}

/** The region id: "Ozeti" → "Europe". */
export function mapId(map: string): string {
    return find(map)?.id ?? map;
}

/** The map's picture in that lighting (or the default one), or null when there is none. */
export function mapPicture(map: string | null | undefined, lighting: string | null | undefined, variant: 'square' | 'wide' = 'wide'): string | null {
    if (!map) {
        return null;
    }

    const id = mapId(map);
    const url = (shown: string) => pictures[`../assets/maps/${id}/${shown}-${variant}.webp`];

    return (lighting && url(lighting)) || url(DEFAULT_LIGHTING) || null;
}
