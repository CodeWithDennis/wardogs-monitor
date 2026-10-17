const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only door between the window and the main process. The window never
 * sees an RCON password or the server's config document.
 */
const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

const listen = (channel) => (callback) => {
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
    license: {
        status: invoke('license:status'),
        activate: invoke('license:activate'),
        remove: invoke('license:remove'),
        onChange: listen('license:changed'),
    },
    preferences: {
        get: invoke('preferences:get'),
        set: invoke('preferences:set'),
        onChange: listen('preferences:changed'),
    },
    setZoom: invoke('zoom:set'),
    limits: invoke('limits'),
    appInfo: invoke('app:info'),
    mini: {
        open: invoke('mini:open'),
        close: invoke('mini:close'),
        onServer: listen('mini:server'),
        onClosed: listen('mini:closed'),
    },
    focusMain: invoke('main:focus'),
    openExternal: invoke('external:open'),
});
