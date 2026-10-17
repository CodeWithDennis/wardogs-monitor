/**
 * A Wardogs server's config document (ServerSettings.ini as the RCON API
 * hands it out), edited in place: only the keys that are set change, and
 * every other line, section, comment and the line endings stay exactly as
 * the server sent them. Array keys use Unreal's operators: `!Key=ClearArray`
 * empties the array and `.Key=value` (or `+Key=value`) appends to it.
 *
 * A port of the website's App\Services\Wardogs\WardogsConfig and
 * App\Services\GameServerSettings. The document holds the RCON password in
 * plain text, so only the values read through FIELDS ever reach the window.
 */

export const SESSION = '/Script/WDGame.WDGameSession';
export const ENGINE_SESSION = '/Script/Engine.GameSession';
export const TEAM_BALANCE = '/Script/WDGame.WDGameStateSession';
export const ROTATION = '/Script/WDGame.WDServerMapRotationSettings';
export const KOTH = 'MatchState.Playing.KOTH';
export const WAITING_FOR_PLAYERS = 'MatchState.PreMatch.WaitingForPlayers.PlayerCount';

/** The limits the website keeps settings inside (see GameServerSettings). */
export const LIMITS = {
    rotationModes: ['Ordered', 'Random'],
    maxRotationEntries: 50,
    scorePeriodMin: 18,
    scorePeriodMax: 30,
    passwordMax: 64,
    maxReservedIds: 100,
    maxPlayersMin: 60,
    maxPlayersMax: 100,
    teamLeadMax: 33,
    levelMax: 10000,
    cashMax: 2000000000,
};

/**
 * The plain settings: field => [section, key, type].
 *
 * @type {Record<string, [string, string, 'string' | 'quoted' | 'int' | 'bool']>}
 */
export const FIELDS = {
    server_password: [SESSION, 'ServerPassword', 'string'],
    min_cash: [SESSION, 'ServerMinPlayerCash', 'int'],
    max_cash: [SESSION, 'ServerMaxPlayerCash', 'int'],
    min_level: [SESSION, 'ServerMinPlayerLevel', 'int'],
    max_level: [SESSION, 'ServerMaxPlayerLevel', 'int'],
    image_url: [SESSION, 'ServerImageURL', 'quoted'],
    max_reserved_slots: [SESSION, 'MaxReservedSlots', 'int'],
    max_players: [ENGINE_SESSION, 'MaxPlayers', 'int'],
    min_players_to_start: [WAITING_FOR_PLAYERS, 'MinimumRequiredPlayers', 'int'],
    score_period: [KOTH, 'ScorePeriod', 'int'],
    lock_overpopulated_teams: [TEAM_BALANCE, 'bLockOverpopulatedTeamsConfig', 'bool'],
    overpopulated_team_threshold: [TEAM_BALANCE, 'OverpopulatedTeamThresholdConfig', 'int'],
};

export class WardogsConfig {
    /**
     * @param {string[]} lines without line endings
     * @param {string} lineEnding
     */
    constructor(lines, lineEnding) {
        this.lines = lines;
        this.lineEnding = lineEnding;
    }

    /** @param {string} text */
    static parse(text) {
        return new WardogsConfig(text.split(/\r\n|\n|\r/), text.includes('\r\n') ? '\r\n' : '\n');
    }

    toString() {
        return this.lines.join(this.lineEnding);
    }

    /**
     * A plain key's value without surrounding quotes, or null when the key is not set.
     *
     * @param {string} section
     * @param {string} key
     */
    get(section, key) {
        const index = this.findKey(section, key);

        if (index === null) {
            return null;
        }

        const value = this.lines[index].slice(key.length + 1).trim();

        return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    }

    getBool(section, key) {
        return String(this.get(section, key) ?? '').toLowerCase() === 'true';
    }

    getInt(section, key) {
        const value = parseInt(this.get(section, key) ?? '', 10);

        return Number.isNaN(value) ? 0 : value;
    }

    /**
     * Set a plain key, where it already stands or at the end of its section
     * (the section is added when the document lacks it).
     */
    set(section, key, value) {
        const line = `${key}=${value}`;
        const index = this.findKey(section, key);

        if (index !== null) {
            this.lines.splice(index, 1, line);

            return;
        }

        this.lines.splice(this.endOfSection(section), 0, line);
    }

    setBool(section, key, value) {
        this.set(section, key, value ? 'True' : 'False');
    }

    /** The members of an array key, in order. */
    getArray(section, key) {
        const values = [];

        for (const index of this.sectionRange(section)) {
            for (const operator of ['.', '+']) {
                if (this.lines[index].startsWith(`${operator}${key}=`)) {
                    values.push(this.lines[index].slice(key.length + 2));
                }
            }
        }

        return values;
    }

    /**
     * Replace an array key with these members, where it already stands or at
     * the end of its section.
     *
     * @param {string} section
     * @param {string} key
     * @param {string[]} values
     */
    setArray(section, key, values) {
        const existing = this.sectionRange(section).filter((index) =>
            ['!', '.', '+', '-'].some((operator) => this.lines[index].startsWith(`${operator}${key}=`)),
        );

        const position = existing.length === 0 ? null : existing[0];

        for (const index of [...existing].reverse()) {
            this.lines.splice(index, 1);
        }

        this.lines.splice(position ?? this.endOfSection(section), 0, `!${key}=ClearArray`, ...values.map((value) => `.${key}=${value}`));
    }

    /**
     * The rotation entries, each `(Map="…",Experiences="A+B",Lighting="…",ZoneAlternator="…")`.
     *
     * @returns {{ map: string, experiences: string[], lighting: string | null, zone: string | null }[]}
     */
    rotationEntries() {
        return this.getArray(ROTATION, 'RotationEntries').map((entry) => {
            const fields = {};

            for (const match of entry.matchAll(/(\w+)="([^"]*)"/g)) {
                fields[match[1]] = match[2];
            }

            const experiences = fields.Experiences ?? fields.Experience ?? '';

            return {
                map: fields.Map ?? '',
                experiences: experiences === '' ? [] : experiences.split('+'),
                lighting: (fields.Lighting ?? '') === '' ? null : fields.Lighting,
                zone: (fields.ZoneAlternator ?? '') === '' ? null : fields.ZoneAlternator,
            };
        });
    }

    /** @param {{ map: string, experiences: string[], lighting: string | null, zone: string | null }[]} entries */
    setRotationEntries(entries) {
        this.setArray(ROTATION, 'RotationEntries', entries.map((entry) => {
            const fields = [
                ['Map', entry.map],
                [entry.experiences.length === 1 ? 'Experience' : 'Experiences', entry.experiences.join('+')],
                ['Lighting', entry.lighting],
                ['ZoneAlternator', entry.zone],
            ];

            return `(${fields.filter(([, value]) => value !== null && value !== '').map(([name, value]) => `${name}="${value}"`).join(',')})`;
        }));
    }

    /** The line holding a plain key in a section. */
    findKey(section, key) {
        for (const index of this.sectionRange(section)) {
            if (this.lines[index].startsWith(`${key}=`)) {
                return index;
            }
        }

        return null;
    }

    /** The line numbers inside a section, header excluded. */
    sectionRange(section) {
        const range = [];
        let inside = false;

        this.lines.forEach((line, index) => {
            const match = line.match(/^\[(.+)\]\s*$/);

            if (match) {
                inside = match[1] === section;

                return;
            }

            if (inside) {
                range.push(index);
            }
        });

        return range;
    }

    /**
     * Where a new line of this section goes: after its last line that is
     * not blank. A missing section is added at the end of the document first.
     */
    endOfSection(section) {
        const header = this.lines.findIndex((line) => line.trimEnd() === `[${section}]`);

        if (header === -1) {
            while (this.lines.length > 0 && this.lines[this.lines.length - 1].trim() === '') {
                this.lines.pop();
            }

            if (this.lines.length > 0) {
                this.lines.push('');
            }

            this.lines.push(`[${section}]`, '');

            return this.lines.length - 1;
        }

        let end = header + 1;

        for (const index of this.sectionRange(section)) {
            if (this.lines[index].trim() !== '') {
                end = index + 1;
            }
        }

        return end;
    }
}

/**
 * The plain settings and reserved IDs as the form shows them.
 *
 * @param {WardogsConfig} config
 */
export function settingsValues(config) {
    const values = {};

    for (const [field, [section, key, type]] of Object.entries(FIELDS)) {
        values[field] = type === 'bool' ? config.getBool(section, key) : type === 'int' ? config.getInt(section, key) : config.get(section, key) ?? '';
    }

    values.reserved_steam_ids = config.getArray(SESSION, 'DefaultReservedPlayerIds');

    return values;
}

/** @param {WardogsConfig} config */
export function rotationValues(config) {
    return {
        enabled: config.getBool(ROTATION, 'bEnabled'),
        mode: config.get(ROTATION, 'RotationMode') ?? LIMITS.rotationModes[0],
        entries: config.rotationEntries(),
    };
}

/**
 * Set one of the plain settings (FIELDS) in the document.
 *
 * @param {WardogsConfig} config
 * @param {string} field
 * @param {unknown} value
 */
export function writeField(config, field, value) {
    const [section, key, type] = FIELDS[field];

    if (type === 'bool') {
        config.setBool(section, key, Boolean(value));
    } else if (type === 'int') {
        config.set(section, key, String(Math.trunc(Number(value) || 0)));
    } else if (type === 'quoted') {
        config.set(section, key, `"${value}"`);
    } else {
        config.set(section, key, String(value));
    }
}

/**
 * A key pinned by the server's launch arguments comes back as not writable.
 *
 * @param {{ sections?: { section: string, keyOverrides?: { key: string, writable?: boolean }[] }[] }} document
 */
export function isWritable(document, section, key) {
    for (const described of document.sections ?? []) {
        if (described.section !== section) {
            continue;
        }

        for (const override of described.keyOverrides ?? []) {
            if (override.key === key) {
                return override.writable ?? true;
            }
        }
    }

    return true;
}

/**
 * Check settings the way the website's SaveServerSettingsRequest does, so
 * the server never gets a value it would clamp or refuse. Returns field =>
 * message for each problem.
 *
 * @param {Record<string, any>} values
 */
export function validateSettings(values) {
    const errors = {};
    const between = (field, min, max, label) => {
        const value = values[field];

        if (value === undefined) {
            return;
        }

        if (!Number.isInteger(value) || value < min || value > max) {
            errors[field] = `${label} must be a whole number from ${min.toLocaleString('en-GB')} to ${max.toLocaleString('en-GB')}.`;
        }
    };

    between('max_players', LIMITS.maxPlayersMin, LIMITS.maxPlayersMax, 'Player slots');
    between('score_period', LIMITS.scorePeriodMin, LIMITS.scorePeriodMax, 'Score period');
    between('min_players_to_start', 0, LIMITS.maxPlayersMax, 'Players needed to start');
    between('max_reserved_slots', 0, LIMITS.maxPlayersMax, 'Reserved spots');
    between('overpopulated_team_threshold', 0, LIMITS.teamLeadMax, 'Team lead');
    between('min_level', 0, LIMITS.levelMax, 'Minimum level');
    between('max_level', 0, LIMITS.levelMax, 'Maximum level');
    between('min_cash', 0, LIMITS.cashMax, 'Minimum cash');
    between('max_cash', 0, LIMITS.cashMax, 'Maximum cash');

    if (typeof values.server_password === 'string' && (values.server_password.length > LIMITS.passwordMax || /[\s"]/.test(values.server_password))) {
        errors.server_password = `The join password can be at most ${LIMITS.passwordMax} characters, without spaces or quotes.`;
    }

    if (typeof values.image_url === 'string' && values.image_url !== '' && !/^https:\/\/[^\s"]+$/.test(values.image_url)) {
        errors.image_url = 'The banner must be an https:// link.';
    }

    if (values.max_level > 0 && values.min_level > values.max_level) {
        errors.min_level = 'The minimum level is above the maximum.';
    }

    if (values.max_cash > 0 && values.min_cash > values.max_cash) {
        errors.min_cash = 'The minimum cash is above the maximum.';
    }

    if (Array.isArray(values.reserved_steam_ids)) {
        if (values.reserved_steam_ids.length > LIMITS.maxReservedIds) {
            errors.reserved_steam_ids = `At most ${LIMITS.maxReservedIds} reserved players.`;
        } else if (values.reserved_steam_ids.some((steamId) => !/^\d{17}$/.test(steamId))) {
            errors.reserved_steam_ids = 'Every reserved player must be a 17-digit Steam ID.';
        }
    }

    if (typeof values.server_name === 'string' && (values.server_name.trim() === '' || values.server_name.length > 100)) {
        errors.server_name = 'The server name must be 1 to 100 characters.';
    }

    return errors;
}

/**
 * @param {{ enabled: boolean, mode: string, entries: { map: string, experiences: string[] }[] }} rotation
 */
export function validateRotation(rotation) {
    if (!LIMITS.rotationModes.includes(rotation.mode)) {
        return 'Pick ordered or random.';
    }

    if (rotation.entries.length > LIMITS.maxRotationEntries) {
        return `A rotation holds at most ${LIMITS.maxRotationEntries} matches.`;
    }

    if (rotation.enabled && rotation.entries.length === 0) {
        return 'Add at least one match, or turn the rotation off.';
    }

    if (rotation.entries.some((entry) => !entry.map || entry.experiences.length === 0)) {
        return 'Every match needs a map and a game mode.';
    }

    return null;
}
