/**
 * The game's own names with spaces: "DayEarlyFog" → "Day Early Fog",
 * "NorthAmerica" → "North America", "Madrid_KOTH_01" → "Madrid KOTH 01".
 */
export function gameName(name: string): string {
    return name
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim();
}

/** A modifier without its mode prefix: "KOTH InfantryOnly" → "Infantry Only". */
export function modifierName(name: string): string {
    return gameName(name).replace(/^[A-Z]{2,}\s+/, '');
}

/** King of the Hill is won by the first faction to reach this score. */
export const SCORE_TARGET = 100;

const MODE_NAMES: Record<string, string> = { KOTH: 'King of the Hill' };

/** The game mode among a match's experiences: ["Madrid_KOTH_01", "KOTH_InfantryOnly"] → "King of the Hill". */
export function modeName(experiences: string[]): string {
    const mode = experiences.find((id) => /_\d+$/.test(id)) ?? experiences[0];

    if (!mode) {
        return '–';
    }

    const key = Object.keys(MODE_NAMES).find((short) => mode.split('_').includes(short));

    return key ? MODE_NAMES[key] : gameName(mode);
}

/** The modifiers among a match's experiences: ["Infantry Only", "Hardcore"]. */
export function modifierNames(experiences: string[]): string[] {
    return experiences.filter((id) => !/_\d+$/.test(id)).map((id) => modifierName(gameName(id)));
}

/**
 * A control zone without its prefix and map:
 * "ZoneAlternator.Ozeti.Church.Circle" → "Church Circle".
 */
export function zoneName(zone: string): string {
    const parts = zone.includes('.') ? zone.split('.').slice(2) : zone.split(' ').slice(1);

    return gameName(parts.join(' ')) || gameName(zone);
}

/** "3d 4h", "2h 15m" or "12m". */
export function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h`;
    }

    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** "just now", "12s ago", "4m ago", "3h ago", or a date. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
    if (!iso) {
        return '–';
    }

    const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));

    if (seconds < 3) {
        return 'just now';
    }

    if (seconds < 60) {
        return `${seconds}s ago`;
    }

    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m ago`;
    }

    if (seconds < 86_400) {
        return `${Math.floor(seconds / 3600)}h ago`;
    }

    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function time(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function number(value: number): string {
    return value.toLocaleString('en-GB');
}

export function ratio(kills: number, deaths: number): string {
    return (deaths === 0 ? kills : kills / deaths).toFixed(2);
}

export function percent(part: number, whole: number): number {
    return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}

export function steamProfileUrl(steamId: string): string {
    return `https://steamcommunity.com/profiles/${steamId}`;
}

/** Ping as good, fair or poor, for its colour. */
export function pingLevel(ms: number): 'good' | 'fair' | 'poor' {
    return ms < 70 ? 'good' : ms < 140 ? 'fair' : 'poor';
}
