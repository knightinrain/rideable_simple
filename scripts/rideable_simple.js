const MODULE_ID = "rideable_simple";
const FLAG_RIDERS = "riders";
const FLAG_MOUNT = "mount";
const FLAG_CONFIG = "config";
const FLAG_FOLLOW = "follow";
const DEFAULT_SEAT_OFFSET = { x: 0, y: 0 };
const pendingMountSyncs = new Map();
const RIDER_EFFECT_FLAG = "rideEffect";

function gridSize() {
  return canvas?.grid?.size ?? canvas?.scene?.grid?.size ?? 100;
}

function gridDistance() {
  return canvas?.scene?.grid?.distance ?? 5;
}

function tokenCenter(tokenDoc) {
  const size = gridSize();
  return {
    x: Number(tokenDoc.x ?? 0) + Number(tokenDoc.width ?? 1) * size / 2,
    y: Number(tokenDoc.y ?? 0) + Number(tokenDoc.height ?? 1) * size / 2
  };
}

function topLeftFromCenter(tokenDoc, center) {
  const size = gridSize();
  return {
    x: Math.round(center.x - Number(tokenDoc.width ?? 1) * size / 2),
    y: Math.round(center.y - Number(tokenDoc.height ?? 1) * size / 2)
  };
}

function currentScene() {
  return canvas?.scene ?? game?.scenes?.active ?? null;
}

function sceneOf(tokenDoc) {
  return tokenDoc?.parent ?? currentScene();
}

function tokenById(scene, tokenId) {
  if (!scene || !tokenId) return null;
  return scene.tokens?.get(tokenId) ?? null;
}

function controlledTokenDocs() {
  return (canvas?.tokens?.controlled ?? []).map(token => token?.document).filter(Boolean);
}

function targetedTokenDocs() {
  return [...(game?.user?.targets ?? [])].map(token => token?.document).filter(Boolean);
}

function hoveredTokenDoc() {
  return canvas?.tokens?.hover?.document ?? null;
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean))];
}

function moduleSetting(key, fallback) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_err) {
    return fallback;
  }
}

function tokenConfig(tokenDoc) {
  return tokenDoc?.getFlag(MODULE_ID, FLAG_CONFIG) ?? {};
}

function tokenOption(tokenDoc, key, fallback) {
  const config = tokenConfig(tokenDoc);
  return config[key] ?? moduleSetting(key, fallback);
}

function getMountFlag(tokenDoc) {
  return tokenDoc?.getFlag(MODULE_ID, FLAG_MOUNT) ?? null;
}

function getRiderIds(mountDoc) {
  return mountDoc?.getFlag(MODULE_ID, FLAG_RIDERS) ?? [];
}

function tokenSizeRank(tokenDoc) {
  const actorSize = tokenDoc?.actor?.system?.traits?.size;
  const size = actorSize ?? tokenConfig(tokenDoc).size ?? null;
  const ranks = { tiny: 0, sm: 1, small: 1, med: 2, medium: 2, lg: 3, large: 3, huge: 4, grg: 5, gargantuan: 5 };
  if (size && ranks[size] !== undefined) return ranks[size];
  const footprint = Math.max(Number(tokenDoc?.width ?? 1), Number(tokenDoc?.height ?? 1));
  if (footprint <= 0.5) return 0;
  if (footprint < 1) return 1;
  if (footprint < 2) return 2;
  if (footprint < 3) return 3;
  if (footprint < 4) return 4;
  return 5;
}

function validMountSize(riderDoc, mountDoc) {
  if (!moduleSetting("enforceSizeRestriction", true)) return true;
  const requiredDifference = Number(moduleSetting("requiredSizeDifference", 1) ?? 1);
  return tokenSizeRank(mountDoc) - tokenSizeRank(riderDoc) === requiredDifference;
}

function distanceBetween(a, b) {
  const ac = tokenCenter(a);
  const bc = tokenCenter(b);
  const pixels = Math.hypot(ac.x - bc.x, ac.y - bc.y);
  return pixels / gridSize() * gridDistance();
}

function sameDisposition(a, b) {
  return Number(a?.disposition ?? 0) === Number(b?.disposition ?? 0);
}

function canMount(riderDoc, mountDoc, options = {}) {
  if (!riderDoc || !mountDoc) return { ok: false, reason: "Missing rider or mount." };
  if (riderDoc.id === mountDoc.id) return { ok: false, reason: "A token cannot mount itself." };
  if (sceneOf(riderDoc)?.id !== sceneOf(mountDoc)?.id) return { ok: false, reason: "Rider and mount must be in the same scene." };

  const mountConfig = tokenConfig(mountDoc);
  if (!validMountSize(riderDoc, mountDoc) && !options.force) return { ok: false, reason: `${mountDoc.name} does not meet the configured size requirement for ${riderDoc.name}.` };
  const rideable = mountConfig.rideable ?? moduleSetting("rideableByDefault", true);
  if (!rideable && !options.force) return { ok: false, reason: `${mountDoc.name} is not rideable.` };

  const distanceLimit = Number(tokenOption(mountDoc, "mountingDistance", 0) ?? 0);
  if (!game.user?.isGM && distanceLimit > 0 && distanceBetween(riderDoc, mountDoc) > distanceLimit) {
    return { ok: false, reason: `${riderDoc.name} is too far from ${mountDoc.name}.` };
  }

  if (!game.user?.isGM && moduleSetting("preventEnemyRiding", false) && !sameDisposition(riderDoc, mountDoc)) {
    return { ok: false, reason: "Enemy riding is disabled." };
  }

  const currentRiders = getRiderIds(mountDoc).filter(id => id !== riderDoc.id);
  const maxRiders = Number(tokenOption(mountDoc, "maxRiders", 2) ?? 2);
  if (maxRiders > 0 && currentRiders.length >= maxRiders) {
    return { ok: false, reason: `${mountDoc.name} has no rider space left.` };
  }

  let cursor = mountDoc;
  while (cursor) {
    const flag = getMountFlag(cursor);
    if (!flag?.mountId) break;
    if (flag.mountId === riderDoc.id) return { ok: false, reason: "Riding loops are not allowed." };
    cursor = tokenById(sceneOf(cursor), flag.mountId);
  }

  return { ok: true };
}

async function setRiderList(mountDoc, riderIds) {
  if (!mountDoc) return;
  await mountDoc.setFlag(MODULE_ID, FLAG_RIDERS, uniqueIds(riderIds));
}

async function removeRiderFromMount(mountDoc, riderId) {
  if (!mountDoc || !riderId) return;
  await setRiderList(mountDoc, getRiderIds(mountDoc).filter(id => id !== riderId));
}

async function clearMountFlag(tokenDoc) {
  if (!tokenDoc) return;
  await tokenDoc.unsetFlag(MODULE_ID, FLAG_MOUNT);
  if (tokenDoc.getFlag(MODULE_ID, FLAG_MOUNT)) {
    await tokenDoc.update({ [`flags.${MODULE_ID}.-=${FLAG_MOUNT}`]: null });
  }
}

function mountedRiders(mountDoc) {
  const scene = sceneOf(mountDoc);
  return getRiderIds(mountDoc)
    .map(id => tokenById(scene, id))
    .filter(tokenDoc => tokenDoc && getMountFlag(tokenDoc)?.mountId === mountDoc.id);
}

function riderMode(options = {}) {
  if (options.Grappled || options.grappled) return "grappled";
  if (options.Familiar || options.familiar) return "familiar";
  return options.mode ?? "mounted";
}

function seatOffsetFor(mountDoc, riderDoc, index, count, mode = "mounted") {
  const size = gridSize();
  const config = tokenConfig(mountDoc);
  const placement = config.riderPlacement ?? moduleSetting("riderPlacement", "circle");
  const baseOffset = config.ridersOffset ?? { x: 0, y: 0 };
  const rotationalOffset = Number(config.ridersRotationalOffset ?? 0);

  if (mode === "familiar") {
    const corners = [
      { x: -0.35, y: -0.35 },
      { x: 0.35, y: -0.35 },
      { x: -0.35, y: 0.35 },
      { x: 0.35, y: 0.35 }
    ];
    const corner = corners[index % corners.length];
    return {
      x: corner.x * Number(mountDoc.width ?? 1) * size + Number(baseOffset.x ?? 0),
      y: corner.y * Number(mountDoc.height ?? 1) * size + Number(baseOffset.y ?? 0)
    };
  }

  if (mode === "grappled") {
    const side = index % 2 === 0 ? 1 : -1;
    return {
      x: side * (Number(mountDoc.width ?? 1) * size / 2 + Number(riderDoc.width ?? 1) * size / 2),
      y: (Math.floor(index / 2) - Math.max(0, count - 2) / 4) * size * 0.45
    };
  }

  if (placement === "center" || count <= 1) {
    return { x: Number(baseOffset.x ?? 0), y: Number(baseOffset.y ?? 0) };
  }

  if (placement === "row") {
    const spacing = size * 0.55;
    return {
      x: (index - (count - 1) / 2) * spacing + Number(baseOffset.x ?? 0),
      y: Number(baseOffset.y ?? 0)
    };
  }

  const radius = Math.max(Number(mountDoc.width ?? 1), Number(mountDoc.height ?? 1)) * size * 0.32;
  const angle = (Math.PI * 2 * index / count) + (rotationalOffset * Math.PI / 180);
  return {
    x: Math.cos(angle) * radius + Number(baseOffset.x ?? 0),
    y: Math.sin(angle) * radius + Number(baseOffset.y ?? 0)
  };
}

function mountHeight(mountDoc, riderDoc, mountFlag = {}) {
  const config = tokenConfig(mountDoc);
  const base = Number(config.ridingHeight ?? moduleSetting("riderElevationOffset", 1) ?? 1);
  return Number(mountDoc.elevation ?? 0) + base + Number(mountFlag.extraHeight ?? 0);
}

async function applyRideEffect(riderDoc, mode) {
  const shouldApply = mode === "grappled"
    ? moduleSetting("applyGrappledEffect", true)
    : moduleSetting("applyMountedEffect", true);
  if (!shouldApply || !riderDoc?.actor) return [];

  const label = mode === "grappled" ? "Grappled" : "Mounted";
  const icon = mode === "grappled" ? "icons/svg/net.svg" : "icons/svg/wingfoot.svg";
  const existing = riderDoc.actor.effects?.filter(effect => effect.getFlag?.(MODULE_ID, RIDER_EFFECT_FLAG) === riderDoc.id) ?? [];
  if (existing.length) return existing.map(effect => effect.id);

  try {
    const created = await riderDoc.actor.createEmbeddedDocuments("ActiveEffect", [{
      name: label,
      icon,
      disabled: false,
      changes: [],
      flags: { [MODULE_ID]: { [RIDER_EFFECT_FLAG]: riderDoc.id, mode } }
    }]);
    return created.map(effect => effect.id);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not create ${label} effect`, err);
    return [];
  }
}

async function removeRideEffects(riderDoc) {
  if (!riderDoc?.actor) return;
  const ids = (riderDoc.actor.effects ?? [])
    .filter(effect => effect.getFlag?.(MODULE_ID, RIDER_EFFECT_FLAG) === riderDoc.id)
    .map(effect => effect.id);
  if (ids.length) await riderDoc.actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

async function syncRiderToMount(riderDoc, mountDoc, index = 0, count = 1, options = {}) {
  if (!riderDoc || !mountDoc) return false;

  const mountFlag = getMountFlag(riderDoc) ?? {};
  const mode = mountFlag.mode ?? "mounted";
  const freeMove = Boolean(mountFlag.freeMove ?? tokenConfig(mountDoc).ridersCanMoveFreely ?? moduleSetting("ridersCanMoveFreely", false));
  const offset = freeMove
    ? mountFlag.offset ?? DEFAULT_SEAT_OFFSET
    : seatOffsetFor(mountDoc, riderDoc, index, count, mode);

  const mountCenter = tokenCenter(mountDoc);
  const nextCenter = {
    x: mountCenter.x + Number(offset.x ?? 0),
    y: mountCenter.y + Number(offset.y ?? 0)
  };
  const next = topLeftFromCenter(riderDoc, nextCenter);

  if (options.syncElevation !== false) next.elevation = mountHeight(mountDoc, riderDoc, mountFlag);
  if (tokenOption(mountDoc, "syncRotation", false)) {
    next.rotation = Number(mountDoc.rotation ?? 0) + Number(mountFlag.rotationOffset ?? 0);
  }

  const scale = Number(tokenConfig(mountDoc).ridersScale ?? moduleSetting("riderScale", 1) ?? 1);
  if (scale > 0 && scale !== 1) {
    next.texture = foundry.utils.mergeObject(foundry.utils.deepClone(riderDoc.texture ?? {}), {
      scaleX: scale,
      scaleY: scale
    }, { inplace: false });
  }

  await riderDoc.update(next, { animate: false, animation: { duration: 0 }, [MODULE_ID]: { syncing: true } });
  if (!freeMove) {
    const currentMountFlag = getMountFlag(riderDoc);
    if (currentMountFlag?.mountId === mountDoc.id) await riderDoc.setFlag(MODULE_ID, FLAG_MOUNT, { ...currentMountFlag, offset });
  }
  return true;
}

async function syncMount(mountDoc) {
  const riders = mountedRiders(mountDoc);
  for (let i = 0; i < riders.length; i++) {
    await syncRiderToMount(riders[i], mountDoc, i, riders.length);
  }
}

function scheduleMountSync(mountDoc) {
  const scene = sceneOf(mountDoc);
  if (!scene || !mountDoc?.id) return;
  const key = `${scene.id}.${mountDoc.id}`;
  if (pendingMountSyncs.has(key)) clearTimeout(pendingMountSyncs.get(key));
  const timeoutId = setTimeout(async () => {
    pendingMountSyncs.delete(key);
    const freshMountDoc = tokenById(scene, mountDoc.id);
    if (freshMountDoc) await syncMount(freshMountDoc);
  }, 75);
  pendingMountSyncs.set(key, timeoutId);
}

async function mountRider(riderDoc, mountDoc, options = {}) {
  const check = canMount(riderDoc, mountDoc, options);
  if (!check.ok) {
    ui.notifications?.warn(check.reason);
    return false;
  }

  const previousMountFlag = getMountFlag(riderDoc);
  if (previousMountFlag?.mountId && previousMountFlag.mountId !== mountDoc.id) {
    await removeRiderFromMount(tokenById(sceneOf(riderDoc), previousMountFlag.mountId), riderDoc.id);
  }

  const mode = riderMode(options);
  const freeMove = Boolean(options.freeMove ?? tokenConfig(mountDoc).ridersCanMoveFreely ?? moduleSetting("ridersCanMoveFreely", false));
  const offset = options.keepRelativePosition || freeMove
    ? {
        x: tokenCenter(riderDoc).x - tokenCenter(mountDoc).x,
        y: tokenCenter(riderDoc).y - tokenCenter(mountDoc).y
      }
    : DEFAULT_SEAT_OFFSET;

  const effectIds = await applyRideEffect(riderDoc, mode);
  await riderDoc.setFlag(MODULE_ID, FLAG_MOUNT, {
    mountId: mountDoc.id,
    sceneId: sceneOf(mountDoc).id,
    mode,
    freeMove,
    piloting: Boolean(options.Piloted ?? options.piloted ?? tokenConfig(mountDoc).pilotedByDefault ?? false),
    offset,
    rotationOffset: Number(options.rotationOffset ?? tokenConfig(mountDoc).ridersRotationalOffset ?? 0),
    effectIds,
    previous: {
      x: riderDoc.x,
      y: riderDoc.y,
      elevation: riderDoc.elevation ?? 0,
      rotation: riderDoc.rotation ?? 0
    }
  });

  await setRiderList(mountDoc, [...getRiderIds(mountDoc), riderDoc.id]);
  await syncMount(mountDoc);
  ui.notifications?.info(`${riderDoc.name} mounted ${mountDoc.name}.`);
  return true;
}

async function dismountRider(riderDoc, options = {}) {
  const mountFlag = getMountFlag(riderDoc);
  if (!mountFlag?.mountId) {
    ui.notifications?.warn(`${riderDoc?.name ?? "This token"} is not mounted.`);
    return false;
  }

  const scene = sceneOf(riderDoc);
  const mountDoc = tokenById(scene, mountFlag.mountId);
  await removeRiderFromMount(mountDoc, riderDoc.id);
  await clearMountFlag(riderDoc);
  await removeRideEffects(riderDoc);

  if (options.placeBeside !== false && mountDoc) {
    const size = gridSize();
    const next = {
      x: Math.round(Number(mountDoc.x ?? 0) + Number(mountDoc.width ?? 1) * size + size / 4),
      y: Math.round(Number(mountDoc.y ?? 0)),
      elevation: mountDoc.elevation ?? riderDoc.elevation ?? 0
    };
    await riderDoc.update(next, { [MODULE_ID]: { dismounting: true } });
  }

  if (!options.deferSync && mountDoc && getRiderIds(mountDoc).length) scheduleMountSync(mountDoc);
  ui.notifications?.info(`${riderDoc.name} dismounted.`);
  return true;
}

async function unmountAllRiders(mountDoc) {
  const riders = mountedRiders(mountDoc);
  for (const riderDoc of riders) await dismountRider(riderDoc, { deferSync: true });
  if (mountDoc && getRiderIds(mountDoc).length) scheduleMountSync(mountDoc);
  return riders.length;
}

async function mountSelectedToTarget(options = {}) {
  let riders = controlledTokenDocs();
  let targets = targetedTokenDocs();
  if (!targets.length && options.hovered) targets = [hoveredTokenDoc()].filter(Boolean);
  if (!riders.length) {
    ui.notifications?.warn("Select one or more rider tokens first.");
    return false;
  }
  if (targets.length !== 1) {
    ui.notifications?.warn("Target exactly one mount token.");
    return false;
  }
  const mountDoc = targets[0];
  riders = riders.filter(riderDoc => riderDoc.id !== mountDoc.id);
  for (const riderDoc of riders) await mountRider(riderDoc, mountDoc, options);
  return true;
}

async function mountSelectedOnHudToken(mountTokenOrDoc, options = {}) {
  const mountDoc = mountTokenOrDoc?.document ?? mountTokenOrDoc;
  const riders = controlledTokenDocs().filter(tokenDoc => tokenDoc.id !== mountDoc?.id);
  if (!mountDoc || !riders.length) {
    ui.notifications?.warn("Select rider tokens, then open the mount token HUD.");
    return false;
  }
  for (const riderDoc of riders) await mountRider(riderDoc, mountDoc, options);
  return true;
}

async function dismountSelected() {
  const riders = controlledTokenDocs();
  if (!riders.length) {
    ui.notifications?.warn("Select mounted rider tokens first.");
    return false;
  }
  for (const riderDoc of riders) await dismountRider(riderDoc);
  return true;
}

async function toggleMountSelected(options = {}) {
  const selected = controlledTokenDocs();
  if (!selected.length) return false;
  const anyMounted = selected.some(tokenDoc => getMountFlag(tokenDoc)?.mountId);
  return anyMounted ? dismountSelected() : mountSelectedToTarget(options);
}

async function mountMany(riderDocs, mountDoc, options = {}) {
  const results = [];
  for (const riderDoc of (Array.isArray(riderDocs) ? riderDocs : [riderDocs])) {
    results.push(await mountRider(riderDoc, mountDoc, options));
  }
  return results;
}

async function dismountMany(riderDocs) {
  const results = [];
  for (const riderDoc of (Array.isArray(riderDocs) ? riderDocs : [riderDocs])) {
    results.push(await dismountRider(riderDoc));
  }
  return results;
}

async function setTokenConfig(tokenDoc, config = {}) {
  if (!tokenDoc) return false;
  await tokenDoc.setFlag(MODULE_ID, FLAG_CONFIG, { ...tokenConfig(tokenDoc), ...config });
  return true;
}

async function clearScene(scene = currentScene()) {
  if (!scene) return;
  for (const tokenDoc of scene.tokens) {
    if (getMountFlag(tokenDoc)) {
      await clearMountFlag(tokenDoc);
      await removeRideEffects(tokenDoc);
    }
    if (getRiderIds(tokenDoc).length) await tokenDoc.unsetFlag(MODULE_ID, FLAG_RIDERS);
    if (tokenDoc.getFlag(MODULE_ID, FLAG_FOLLOW)) await tokenDoc.unsetFlag(MODULE_ID, FLAG_FOLLOW);
  }
  ui.notifications?.info("Ride links cleared for the current scene.");
}

async function repairScene(scene = currentScene()) {
  if (!scene) return;
  for (const tokenDoc of scene.tokens) {
    const mountFlag = getMountFlag(tokenDoc);
    if (!mountFlag?.mountId) continue;
    const mountDoc = tokenById(scene, mountFlag.mountId);
    if (!mountDoc) {
      await clearMountFlag(tokenDoc);
      continue;
    }
    if (!getRiderIds(mountDoc).includes(tokenDoc.id)) await setRiderList(mountDoc, [...getRiderIds(mountDoc), tokenDoc.id]);
  }
  for (const tokenDoc of scene.tokens) if (getRiderIds(tokenDoc).length) await syncMount(tokenDoc);
  ui.notifications?.info("Ride links resynced for the current scene.");
}

async function followToken(followerDoc, targetDoc, options = {}) {
  if (!followerDoc || !targetDoc || followerDoc.id === targetDoc.id) return false;
  await followerDoc.setFlag(MODULE_ID, FLAG_FOLLOW, {
    targetId: targetDoc.id,
    sceneId: sceneOf(targetDoc).id,
    distance: Number(options.distance ?? moduleSetting("followDistance", gridDistance()) ?? gridDistance())
  });
  return true;
}

async function stopFollowing(followerDoc) {
  if (!followerDoc) return false;
  await followerDoc.unsetFlag(MODULE_ID, FLAG_FOLLOW);
  return true;
}

async function syncFollowers(targetDoc) {
  if (!moduleSetting("enableFollowing", false)) return;
  const scene = sceneOf(targetDoc);
  const followers = scene.tokens.filter(tokenDoc => tokenDoc.getFlag(MODULE_ID, FLAG_FOLLOW)?.targetId === targetDoc.id);
  const targetCenter = tokenCenter(targetDoc);
  for (let i = 0; i < followers.length; i++) {
    const follower = followers[i];
    const distance = Number(follower.getFlag(MODULE_ID, FLAG_FOLLOW)?.distance ?? gridDistance());
    const px = distance / gridDistance() * gridSize();
    const angle = Math.PI + (i - (followers.length - 1) / 2) * 0.5;
    const nextCenter = { x: targetCenter.x + Math.cos(angle) * px, y: targetCenter.y + Math.sin(angle) * px };
    await follower.update(topLeftFromCenter(follower, nextCenter), { animate: false, animation: { duration: 0 }, [MODULE_ID]: { following: true } });
  }
}

async function handleIndependentRiderMovement(riderDoc, changes, options) {
  const mountFlag = getMountFlag(riderDoc);
  if (!mountFlag?.mountId) return;
  const scene = sceneOf(riderDoc);
  const mountDoc = tokenById(scene, mountFlag.mountId);
  if (!mountDoc) {
    await clearMountFlag(riderDoc);
    return;
  }

  const behavior = mountFlag.freeMove ? "free" : moduleSetting("riderMovement", "free");
  if (behavior === "free") {
    setTimeout(async () => {
      const freshRider = tokenById(scene, riderDoc.id);
      const freshMount = tokenById(scene, mountDoc.id);
      const freshFlag = getMountFlag(freshRider);
      if (!freshRider || !freshMount || freshFlag?.mountId !== freshMount.id) return;
      const riderCenter = tokenCenter(freshRider);
      const mountCenter = tokenCenter(freshMount);
      await freshRider.setFlag(MODULE_ID, FLAG_MOUNT, {
        ...freshFlag,
        freeMove: true,
        offset: { x: riderCenter.x - mountCenter.x, y: riderCenter.y - mountCenter.y }
      });
    }, 100);
    return;
  }

  if (behavior === "prevent") {
    scheduleMountSync(mountDoc);
    return;
  }

  if (behavior === "dismount") {
    await dismountRider(riderDoc, { placeBeside: false });
    return;
  }

  if (behavior === "moveMount" || mountFlag.piloting) {
    const dx = Number(changes.x ?? riderDoc.x) - Number(mountFlag.lastX ?? mountDoc.x);
    const dy = Number(changes.y ?? riderDoc.y) - Number(mountFlag.lastY ?? mountDoc.y);
    await mountDoc.update({ x: Number(mountDoc.x ?? 0) + dx, y: Number(mountDoc.y ?? 0) + dy }, { [MODULE_ID]: { movingMount: true } });
    scheduleMountSync(mountDoc);
  }
}

function addTokenHudButton(html, title, iconClass, onClick) {
  const root = globalThis.jQuery && html instanceof globalThis.jQuery ? html[0] : html;
  if (!root?.querySelector) return;
  const column = root.querySelector(".col.right") ?? root.querySelector(".right") ?? root;
  const button = document.createElement("div");
  button.className = "control-icon cf-ride-link-hud-button";
  button.title = title;
  button.innerHTML = `<i class="${iconClass}"></i>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  column.appendChild(button);
}

function registerSettings() {
  const register = (key, data) => game.settings.register(MODULE_ID, key, { scope: "world", config: true, ...data });
  register("rideableByDefault", { name: "Default all tokens rideable", hint: "When disabled, tokens must be marked rideable through API or token flags.", type: Boolean, default: true });
  register("enforceSizeRestriction", { name: "Enforce size restriction", hint: "When enabled, riders can only mount tokens that match the configured size difference.", type: Boolean, default: true });
  register("requiredSizeDifference", { name: "Required mount size difference", hint: "1 means the mount must be exactly one size category larger than the rider.", type: Number, default: 1, range: { min: 0, max: 5, step: 1 } });
  register("maxRiders", { name: "Maximum riders per mount", hint: "0 means unlimited riders. Default is 2.", type: Number, default: 2, range: { min: 0, max: 8, step: 1 } });
  register("riderPlacement", { name: "Rider placement", type: String, choices: { center: "Center", row: "Row", circle: "Circle" }, default: "circle" });
  register("riderElevationOffset", { name: "Rider elevation offset", hint: "Rider elevation equals mount elevation plus this value and any extra height.", type: Number, default: 1, range: { min: 0, max: 20, step: 1 } });
  register("ridersCanMoveFreely", { name: "Riders can move freely by default", hint: "When enabled, riders can adjust relative position on the mount.", type: Boolean, default: false });
  register("riderMovement", { name: "When rider moves independently", type: String, choices: { free: "Record as free offset", prevent: "Return to seat", dismount: "Dismount", moveMount: "Move mount" }, default: "free" });
  register("syncRotation", { name: "Sync rotation", type: Boolean, default: false });
  register("mountingDistance", { name: "Mounting distance limit", hint: "0 disables distance checks for GM; non-GM users are checked when value is above 0.", type: Number, default: 0, range: { min: 0, max: 120, step: 5 } });
  register("preventEnemyRiding", { name: "Prevent enemy riding", type: Boolean, default: false });
  register("applyMountedEffect", { name: "Apply Mounted effect automatically", type: Boolean, default: true });
  register("applyGrappledEffect", { name: "Apply Grappled effect automatically", type: Boolean, default: true });
  register("riderScale", { name: "Rider scale", type: Number, default: 1, range: { min: 0.25, max: 2, step: 0.05 } });
  register("enableFollowing", { name: "Enable following", type: Boolean, default: false });
  register("followDistance", { name: "Follow distance", type: Number, default: 5, range: { min: 0, max: 120, step: 5 } });
}

function activateRideLinkApi() {
  const api = {
    mountRider,
    dismountRider,
    unmountAllRiders,
    mountSelectedToTarget,
    mountSelectedOnHudToken,
    dismountSelected,
    toggleMountSelected,
    syncMount,
    scheduleMountSync,
    repairScene,
    clearScene,
    setTokenConfig,
    followToken,
    stopFollowing,
    syncFollowers,
    flags: { moduleId: MODULE_ID, mount: FLAG_MOUNT, riders: FLAG_RIDERS, config: FLAG_CONFIG, follow: FLAG_FOLLOW }
  };
  game.rideableSimple = api;
  game.cangfanRideLink = api;
  game.Rideable = {
    MountSelected: (pTargetHovered = false) => mountSelectedToTarget({ hovered: pTargetHovered }),
    MountSelectedFamiliar: (pTargetHovered = false) => mountSelectedToTarget({ hovered: pTargetHovered, Familiar: true }),
    GrappleTargeted: (pTargetHovered = false) => mountSelectedToTarget({ hovered: pTargetHovered, Grappled: true }),
    UnMountSelected: () => dismountSelected(),
    Mount: (pselectedTokens, pTarget, pRidingOptions = {}) => mountMany(pselectedTokens, pTarget, pRidingOptions),
    UnMount: (pTokens) => dismountMany(pTokens),
    UnMountallRiders: (pRidden) => unmountAllRiders(pRidden),
    MountbyID: (pselectedTokens, pTarget, pRidingOptions = {}, pSceneID = null) => {
      const scene = game.scenes.get(pSceneID) ?? currentScene();
      const target = tokenById(scene, pTarget);
      return mountMany((Array.isArray(pselectedTokens) ? pselectedTokens : [pselectedTokens]).map(id => tokenById(scene, id)), target, pRidingOptions);
    },
    UnMountbyID: (pTokens, pSceneID = null) => {
      const scene = game.scenes.get(pSceneID) ?? currentScene();
      return dismountMany((Array.isArray(pTokens) ? pTokens : [pTokens]).map(id => tokenById(scene, id)));
    },
    UnMountallRidersbyID: (pRidden, pSceneID = null) => unmountAllRiders(tokenById(game.scenes.get(pSceneID) ?? currentScene(), pRidden))
  };
  console.log(`${MODULE_ID} | Rideable Simple ready`);
}

Hooks.once("init", registerSettings);
if (game?.ready) activateRideLinkApi();
else Hooks.once("ready", activateRideLinkApi);

Hooks.on("renderTokenHUD", (hud, html) => {
  const tokenDoc = hud.object?.document;
  if (!tokenDoc || !game.user?.isGM) return;
  addTokenHudButton(html, "Mount selected tokens on this token", "fas fa-horse", () => mountSelectedOnHudToken(tokenDoc));
  addTokenHudButton(html, "Unmount this token", "fas fa-unlink", () => dismountRider(tokenDoc));
  addTokenHudButton(html, "Unmount all riders", "fas fa-users-slash", () => unmountAllRiders(tokenDoc));
});

Hooks.on("updateToken", async (tokenDoc, changes, options) => {
  if (options?.[MODULE_ID]?.syncing || options?.[MODULE_ID]?.dismounting || options?.[MODULE_ID]?.following || options?.[MODULE_ID]?.movingMount) return;
  const changedPosition = "x" in changes || "y" in changes || "elevation" in changes || "rotation" in changes;
  if (!changedPosition) return;

  if (mountedRiders(tokenDoc).length) {
    scheduleMountSync(tokenDoc);
    await syncFollowers(tokenDoc);
    return;
  }

  if (getMountFlag(tokenDoc)?.mountId) await handleIndependentRiderMovement(tokenDoc, changes, options);
  await syncFollowers(tokenDoc);
});

Hooks.on("deleteToken", async tokenDoc => {
  const scene = sceneOf(tokenDoc);
  for (const riderId of getRiderIds(tokenDoc)) {
    const riderDoc = tokenById(scene, riderId);
    if (riderDoc) {
      await clearMountFlag(riderDoc);
      await removeRideEffects(riderDoc);
    }
  }
  const mountFlag = getMountFlag(tokenDoc);
  if (mountFlag?.mountId) await removeRiderFromMount(tokenById(scene, mountFlag.mountId), tokenDoc.id);
});

Hooks.on("canvasReady", () => {
  for (const tokenDoc of canvas.scene?.tokens ?? []) {
    if (getRiderIds(tokenDoc).length) scheduleMountSync(tokenDoc);
  }
});

window.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.repeat) return;
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (["input", "textarea", "select"].includes(tag)) return;
  if (event.key?.toLowerCase() === "m") {
    event.preventDefault();
    mountSelectedToTarget({ hovered: true });
  }
  if (event.key?.toLowerCase() === "n") {
    event.preventDefault();
    dismountSelected();
  }
});
