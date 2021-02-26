/**
 * An interface descibing a Mod.
 * @interface
 */
GDAPI.Mod = class Mod {
  /**
   * Function called when the scene switched.
   * @param {gdjs.RuntimeScene} runtimeScene - The new Scene.
   */
  sceneChanged(runtimeScene) {}

  /**
   * Function called before the scene's event sheet.
   * @param {gdjs.RuntimeScene} runtimeScene - The current Scene.
   */
  preEvent(runtimeScene) {}

  /**
   * Function called after the scene's event sheet.
   * @param {gdjs.RuntimeScene} runtimeScene - The current Scene.
   */
  postEvent(runtimeScene) {}
};

/**
 * A Manager for mods.
 * @namespace
 */
GDAPI.ModManager = {
  mods: {},
  callbacks: {},
};

/**
 * Adds a mod to the manager.
 * @param {GDAPI.Mod} mod - The mod to add to the manager.
 */
GDAPI.ModManager.add = function (uid, mod) {
  this.mods[uid] = mod;
  const callbacks = (this.callbacks[uid] = {});
  if (mod.preEvent) {
    const callback = (scene) => mod.preEvent(scene);
    GDAPI.registerCallback(GDAPI.CALLBACKS.PRE_EVENTS, callback);
    callbacks.preEvent = callback;
  }
  if (mod.postEvent) {
    const callback = (scene) => mod.postEvent(scene);
    GDAPI.registerCallback(GDAPI.CALLBACKS.POST_EVENTS, callback);
    callbacks.postEvent = callback;
  }
  if (mod.sceneChanged) {
    const callback = (scene) => mod.sceneChanged(scene);
    GDAPI.registerCallback(GDAPI.CALLBACKS.SCENE_LOADED, callback);
    callbacks.sceneChanged = callback;
  }
};

/**
 * Get a mod by uid.
 * @param {string} modUID - The mods UID.
 * @returns {GDAPI.Mod}
 */
GDAPI.ModManager.get = function (modUID) {
  return this.mods[modUID];
};

/**
 * Check the existence of a mod by uid.
 * @param {string} modUID - The mods UID.
 * @returns {boolean}
 */
GDAPI.ModManager.has = function (modUID) {
  return modUID in this.mods;
};

/**
 * Unloads a mod by uid.
 * @param {string} modUID - The mods UID.
 */
GDAPI.ModManager.unload = function (modUID) {
  const mod = this.mods[modUID];
  if (mod == undefined) return;
  if (mod.unload) mod.unload();

  const callbacks = this.callbacks[modUID];
  if (callbacks.preEvent)
    GDAPI.unregisterCallback(GDAPI.CALLBACKS.PRE_EVENTS, callbacks.preEvent);
  if (callbacks.postEvent)
    GDAPI.unregisterCallback(GDAPI.CALLBACKS.POST_EVENTS, callbacks.postEvent);
  if (callbacks.sceneChanged)
    GDAPI.unregisterCallback(
      GDAPI.CALLBACKS.SCENE_LOADED,
      callbacks.sceneChanged
    );

  delete this.callbacks[modUID];
  delete this.mods[modUID];
};

/**
 * Get an array of all loaded mods.
 * @returns {Array<GDAPI.Mod>}
 */
GDAPI.ModManager.getAllMods = function () {
  return Object.values(this.mods);
};

/**
 * @typedef MainManifest
 * @property {string} name
 * @property {string} description
 * @property {string} version
 * @property {string} author
 * @property {string} uid
 */

/**
 * @typedef {Array<string>} IncludesManifest
 */

/**
 * @typedef {Array<{file: string, name: string, kind: string}>} ResourcesManifest
 */

/**
 * @typedef Manifests
 * @property {MainManifest} mainManifest
 * @property {IncludesManifest} includes
 * @property {ResourcesManifest} resources
 */

/**
 * @typedef ModFile
 * @property {Buffer | ArrayBuffer | Blob} file
 * @property {Manifests} manifest
 */

/**
 * Parses a mod from a zip.
 * @param {Buffer | ArrayBuffer | Blob} rawFile - The Mod file.
 * @returns {Promise<ModFile>}
 */
GDAPI.parseModManifest = async function (rawFile) {
  // Load the zip
  const file = await new JSZip().loadAsync(rawFile);

  // Load the files
  const mainManifestFile = file.file("data/GDMod.json");
  const includesFile = file.file("data/includes.json");
  const resourcesFile = file.file("data/resources.json");

  // Verify their presence
  if (
    mainManifestFile == undefined ||
    includesFile == undefined ||
    resourcesFile == undefined
  )
    throw new Error("A manifest file is missing! Is this a GDMod mod?");

  if (GDAPI.currentScene == undefined)
    throw new Error(
      "The game seems unpatched or not fully loaded. Please wait for the game to fully load."
    );

  // Parse the files into a Manifests object
  try {
    return {
      manifest: {
        mainManifest: JSON.parse(await mainManifestFile.async("string")),
        includes: JSON.parse(await includesFile.async("string")),
        resources: JSON.parse(await resourcesFile.async("string")),
      },
      file: rawFile,
    };
  } catch (e) {
    throw new Error(
      "A manifest could not be parsed! Make sure it is valid JSON. " + e
    );
  }
};

/**
 * Loads a pre-parsed mod.
 * This is what is used to actually load a mod file.
 * @param {ModFile} modFile - The Mod file.
 */
GDAPI.loadModFile = async function (modFile) {
  const {
    manifest: { resources, includes, mainManifest },
    file: rawFile,
  } = modFile;
  // Load the zip
  const file = await JSZip.loadAsync(rawFile);

  // Load resources
  if (resources.length !== 0) {
    const promises = [];
    for (let resource of resources)
      promises.push(async () => {
        // Get an URL for the image Blob
        const resourceFile = await file
          .file("resources/" + resource.file)
          .async("blob");
        const blobURL = URL.createObjectURL(resourceFile);

        // Create an HTML image element
        const img = new Image();
        img.src = blobURL;

        // Wait for the image to load
        await new Promise((resolve) =>
          img.addEventListener("load", () => resolve())
        );

        // Load the image as a pixi texture
        GDAPI.game
          .getImageManager()
          ._loadedTextures.put(
            resource.name,
            new PIXI.Texture(new PIXI.BaseTexture(img))
          );

        // Revoke the URL as we are done with loading the image
        URL.revokeObjectURL(blobURL);
      });

    // Wait for all ressources to load before loading the code
    await Promise.all(promises);
  }

  // Load the code
  let modLoaded = false;
  if (includes.length !== 0)
    for (let include of includes) {
      const jsFile = await file.file("code/" + include).async("string");
      const potentialMod = eval(`(function() {${jsFile}}())`);
      if (typeof potentialMod === "function" && !modLoaded) {
        // Load a GDAPI.Mod instance
        GDAPI.ModManager.add(mainManifest.uid, new potentialMod());
        modLoaded = true; // Only allow one mod to load (else there would be multiple mods with the same metadata).
      }
    }

  // Load dummy mod for mod list
  if (!modLoaded) GDAPI.loadMod(GDAPI.Mod, mainManifest);
};
