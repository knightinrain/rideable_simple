const MODULE_ID = "rideable_simple";

const SETTING_TEXT = {
  rideableByDefault: {
    name: "默认所有 token 可骑乘",
    hint: "关闭后，必须通过 API 或 token 标记把目标设为可骑乘。"
  },
  enforceSizeRestriction: {
    name: "启用尺寸限制",
    hint: "启用后，骑手只能骑乘符合尺寸差要求的目标。"
  },
  requiredSizeDifference: {
    name: "坐骑所需尺寸差",
    hint: "1 表示坐骑默认至少比骑手大一个体型等级。"
  },
  sizeRule: {
    name: "尺寸规则模式",
    hint: "“至少达到所需差值”较宽松；“必须正好等于所需差值”保留旧版严格规则。",
    choices: {
      atLeast: "至少达到所需差值",
      exact: "必须正好等于所需差值"
    }
  },
  maxRiders: {
    name: "每个坐骑最多骑手数",
    hint: "0 表示不限人数。默认 2。"
  },
  riderPlacement: {
    name: "骑手站位",
    choices: {
      center: "居中",
      row: "横排",
      circle: "环绕"
    }
  },
  riderElevationOffset: {
    name: "骑手高度偏移",
    hint: "骑手高度等于坐骑高度，加上此数值和任何额外高度。"
  },
  ridersCanMoveFreely: {
    name: "默认允许骑手自由调整位置",
    hint: "启用后，骑手可以在坐骑上调整相对位置。"
  },
  riderMovement: {
    name: "骑手被单独移动时",
    choices: {
      free: "记录为自由偏移",
      prevent: "返回骑乘位置",
      dismount: "下马",
      moveMount: "移动坐骑"
    }
  },
  syncRotation: {
    name: "同步朝向"
  },
  mountingDistance: {
    name: "骑乘距离限制",
    hint: "0 表示 GM 不检查距离；非 GM 用户在数值大于 0 时会检查距离。"
  },
  preventEnemyRiding: {
    name: "禁止骑乘敌对目标"
  },
  applyMountedEffect: {
    name: "自动添加骑乘效应"
  },
  applyGrappledEffect: {
    name: "自动添加擒抱效应"
  },
  riderScale: {
    name: "骑手缩放"
  },
  enableFollowing: {
    name: "启用跟随"
  },
  followDistance: {
    name: "跟随距离"
  }
};

const EXACT_MESSAGES = new Map([
  ["Missing rider or mount.", "缺少骑手或坐骑。"],
  ["A token cannot mount itself.", "一个 token 不能骑乘自己。"],
  ["Rider and mount must be in the same scene.", "骑手和坐骑必须在同一场景。"],
  ["Enemy riding is disabled.", "当前设置不允许骑乘敌对目标。"],
  ["Riding loops are not allowed.", "不能形成循环骑乘关系。"],
  ["Select one or more rider tokens first.", "请先选择一个或多个骑手 token。"],
  ["Target exactly one mount token.", "请只指定一个坐骑 token 为目标。"],
  ["Select rider tokens, then open the mount token HUD.", "请先选择骑手 token，再打开坐骑 token 的 HUD。"],
  ["Select mounted rider tokens first.", "请先选择正在骑乘的骑手 token。"],
  ["Ride links cleared for the current scene.", "已清除当前场景的骑乘关系。"],
  ["Ride links resynced for the current scene.", "已重新同步当前场景的骑乘关系。"]
]);

const HUD_TITLES = new Map([
  ["Mount selected tokens on this token", "让选中的 token 骑上此 token"],
  ["Unmount this token", "让此 token 下马"],
  ["Unmount all riders", "让所有骑手下马"]
]);

function applyChineseSettings() {
  for (const [key, text] of Object.entries(SETTING_TEXT)) {
    const setting = game.settings.settings.get(`${MODULE_ID}.${key}`);
    if (!setting) continue;
    if (text.name) setting.name = text.name;
    if (text.hint) setting.hint = text.hint;
    if (text.choices) setting.choices = text.choices;
  }
}

function translateMessage(message) {
  if (typeof message !== "string") return message;
  if (EXACT_MESSAGES.has(message)) return EXACT_MESSAGES.get(message);

  let match = message.match(/^(.+) does not meet the configured size requirement for (.+)\.$/);
  if (match) return `${match[1]} 不符合 ${match[2]} 的尺寸要求。`;

  match = message.match(/^(.+) is not rideable\.$/);
  if (match) return `${match[1]} 未设置为可骑乘。`;

  match = message.match(/^(.+) is too far from (.+)\.$/);
  if (match) return `${match[1]} 距离 ${match[2]} 太远。`;

  match = message.match(/^(.+) has no rider space left\.$/);
  if (match) return `${match[1]} 已没有骑乘位置。`;

  match = message.match(/^(.+) mounted (.+)\.$/);
  if (match) return `${match[1]} 骑上了 ${match[2]}。`;

  match = message.match(/^(.+) dismounted\.$/);
  if (match) return `${match[1]} 下马。`;

  match = message.match(/^(.+) is not mounted\.$/);
  if (match) return `${match[1]} 当前没有骑乘。`;

  return message;
}

function patchNotifications() {
  const notifications = ui?.notifications;
  if (!notifications || notifications[`${MODULE_ID}ZhPatched`]) return;
  for (const method of ["info", "warn", "error"]) {
    const original = notifications[method]?.bind(notifications);
    if (!original) continue;
    notifications[method] = (message, ...args) => original(translateMessage(message), ...args);
  }
  notifications[`${MODULE_ID}ZhPatched`] = true;
}

function translateHudButtons(html) {
  const root = globalThis.jQuery && html instanceof globalThis.jQuery ? html[0] : html;
  if (!root?.querySelectorAll) return;
  for (const button of root.querySelectorAll(".cf-ride-link-hud-button")) {
    if (HUD_TITLES.has(button.title)) button.title = HUD_TITLES.get(button.title);
  }
}

async function translateRideEffect(effect) {
  if (!effect?.getFlag || !effect?.update) return;
  const mode = effect.getFlag(MODULE_ID, "mode");
  if (!mode) return;
  const nextName = mode === "grappled" ? "擒抱" : "骑乘";
  if (effect.name !== nextName) await effect.update({ name: nextName });
}

async function translateExistingRideEffects() {
  if (!game.user?.isGM) return;
  for (const actor of game.actors ?? []) {
    for (const effect of actor.effects ?? []) await translateRideEffect(effect);
  }
}

Hooks.once("init", applyChineseSettings);
Hooks.once("ready", () => {
  patchNotifications();
  translateExistingRideEffects();
});
Hooks.on("renderTokenHUD", (_hud, html) => translateHudButtons(html));
Hooks.on("createActiveEffect", effect => translateRideEffect(effect));
