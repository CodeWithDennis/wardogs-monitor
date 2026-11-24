const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only door between the window and the main process. The window never
 * sees an RCON password or the server's config document.
 */
const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

const listen = (channel) => (callback) => {
    if (typeof callback !== 'function') {
        return () => {};
    }

    const listener = (_event, value) => callback(value);
    ipcRenderer.on(channel, listener);

    return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('panel', {
    servers: {
        list: invoke('servers:list'),
        save: invoke('servers:save'),
        remove: invoke('servers:remove'),
        reorder: invoke('servers:reorder'),
        addDemo: invoke('servers:addDemo'),
    },
    server: {
        live: invoke('server:live'),
        bans: invoke('server:bans'),
        rotation: invoke('server:rotation'),
        catalog: invoke('server:catalog'),
        identity: invoke('server:identity'),
        settings: invoke('server:settings'),
        act: invoke('server:act'),
        refresh: invoke('server:refresh'),
    },
    activity: { list: invoke('activity:list') },
    banLists: {
        list: invoke('banlists:list'),
        save: invoke('banlists:save'),
        remove: invoke('banlists:remove'),
        plan: invoke('banlists:plan'),
        sync: invoke('banlists:sync'),
    },
    preferences: {
        get: invoke('preferences:get'),
        set: invoke('preferences:set'),
        onChange: listen('preferences:changed'),
    },
    setZoom: invoke('zoom:set'),
    limits: invoke('limits'),
    appInfo: invoke('app:info'),
    widgets: {
        open: invoke('widgets:open'),
        close: invoke('widgets:close'),
        list: invoke('widgets:list'),
        onChange: listen('widgets:changed'),
    },
    focusMain: invoke('main:focus'),
    openExternal: invoke('external:open'),
    rememberBootColors: invoke('boot:colors'),
    tray: {
        /** Fire and forget: sent after readings change, nothing to wait for. */
        summary: (value) => ipcRenderer.send('tray:summary', value),
        onOpenServer: listen('tray:open-server'),
    },
});
