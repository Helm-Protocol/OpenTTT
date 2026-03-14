import WindowWrapper from './__polyfills__/window.mjs';

var StorageKeys;
(function (StorageKeys) {
    StorageKeys["Session"] = "@turnkey/session/v2";
    StorageKeys["Client"] = "@turnkey/client";
})(StorageKeys || (StorageKeys = {}));
var StorageLocation;
(function (StorageLocation) {
    StorageLocation["Local"] = "local";
    StorageLocation["Secure"] = "secure";
    StorageLocation["Session"] = "session";
})(StorageLocation || (StorageLocation = {}));
const STORAGE_VALUE_LOCATIONS = {
    [StorageKeys.Session]: StorageLocation.Session,
    [StorageKeys.Client]: StorageLocation.Session,
};
const STORAGE_LOCATIONS = {
    [StorageLocation.Local]: WindowWrapper.localStorage,
    [StorageLocation.Secure]: WindowWrapper.localStorage,
    [StorageLocation.Session]: WindowWrapper.localStorage,
};
const getStorageValue = async (storageKey) => {
    const storageLocation = STORAGE_VALUE_LOCATIONS[storageKey];
    const browserStorageLocation = STORAGE_LOCATIONS[storageLocation];
    const storageItem = browserStorageLocation.getItem(storageKey);
    return storageItem ? JSON.parse(storageItem) : undefined;
};
const setStorageValue = async (storageKey, storageValue) => {
    const storageLocation = STORAGE_VALUE_LOCATIONS[storageKey];
    const browserStorageLocation = STORAGE_LOCATIONS[storageLocation];
    browserStorageLocation.setItem(storageKey, JSON.stringify(storageValue));
};
const removeStorageValue = async (storageKey) => {
    const storageLocation = STORAGE_VALUE_LOCATIONS[storageKey];
    const browserStorageLocation = STORAGE_LOCATIONS[storageLocation];
    browserStorageLocation.removeItem(storageKey);
};
/**
 * Saves a session and client to storage.
 *
 * @param {Session} session - The session response containing session details.
 * @param {AuthClient} authClient - The authentication client used for the session.
 * @throws Will throw an error if the authentication client is not set.
 * @returns {Promise<void>} A promise that resolves when the session is saved.
 */
const storeSession = async (session, client) => {
    await setStorageValue(StorageKeys.Session, session);
    if (client) {
        await setStorageValue(StorageKeys.Client, client);
    }
};

export { StorageKeys, getStorageValue, removeStorageValue, setStorageValue, storeSession };
//# sourceMappingURL=storage.mjs.map
