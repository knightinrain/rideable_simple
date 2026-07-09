# 简易骑乘系统（Rideable Simple）

`rideable_simple` 是给苍梵界跑团使用的轻量 Foundry VTT 骑乘模块。它不依赖完整 Rideable 模块，提供骑上、下马、骑手跟随、尺寸限制、HUD 控制、相邻格下马和少量 Rideable 兼容 API。

模块技术 ID 保持为 `rideable_simple`，这是为了让 Foundry 能稳定识别更新。玩家和 GM 在 Foundry 里看到的标题、设置项、按钮提示和常见提示语会显示为中文。

## 安装地址

在 Foundry 的模块安装器里填写：

```text
https://raw.githubusercontent.com/knightinrain/rideable_simple/main/module.json
```

## 安装步骤

1. 打开 Foundry VTT 的管理后台。
2. 进入 **Add-on Modules / 附加模块**。
3. 点击 **Install Module / 安装模块**。
4. 粘贴上面的 Manifest URL。
5. 安装模块。
6. 进入世界，在 **Manage Modules / 管理模块** 中启用 **简易骑乘系统**。
7. 启用后刷新一次世界页面。

如果 Foundry 能在浏览器打开 manifest，但安装器仍拒绝安装，通常是服务器或缓存没有刷新。此仓库当前使用 GitHub 分支 zip 作为下载目标。

## 主要功能

- 选中骑手 token，指定一个坐骑 token，然后骑上去。
- 选中正在骑乘的 token 后下马。
- GM 可以从坐骑 token 的 HUD 上让所有骑手下马。
- 坐骑移动时，骑手跟随坐骑移动。
- 下马时，骑手会落到坐骑占据区域旁边 5 尺内的一格，优先选择未被占用的位置。
- 支持居中、横排、环绕三种骑手站位。
- 支持骑手高度偏移、朝向同步、骑手缩放。
- 支持可选的跟随功能。
- 支持自动添加“骑乘”或“擒抱”效应。
- 提供场景修复和清除骑乘关系的 API。
- 提供 `game.Rideable` 兼容别名，方便旧宏调用。

## 默认操作

- 选中骑手 token，目标指定一个坐骑 token，然后执行骑乘流程。
- GM 可以打开坐骑 token 的 HUD，使用新增的骑乘按钮。
- 按 `M`：让选中 token 骑上鼠标悬停的 token。
- 按 `N`：让选中且正在骑乘的 token 下马。

## 推荐设置

常用设置在模块设置页里，名称会显示为中文：

- 默认所有 token 可骑乘
- 启用尺寸限制
- 坐骑所需尺寸差
- 尺寸规则模式
- 每个坐骑最多骑手数
- 骑手站位
- 骑手被单独移动时
- 自动添加骑乘效应
- 自动添加擒抱效应

如果你希望“骑手和坐骑使用同一个速度，也就是坐骑速度”，建议把 **骑手被单独移动时** 设为：

- **移动坐骑**：拖动骑手时，坐骑按同样距离移动。
- 或 **返回骑乘位置**：只能移动坐骑，骑手会被拉回坐骑位置。

## 版本记录

- `0.3.3`：修复坐骑移动时骑手列表不同步的问题。模块会同时检查坐骑的骑手列表和骑手自身的骑乘标记。
- `0.3.4`：改进下马落点。骑手会落到坐骑周围一圈格子中，优先选择最近的未占用格。
- `0.3.5`：修复“骑手移动带动坐骑”时位移丢失的问题。
- `0.3.6`：加入中文显示层。模块标题、设置页、HUD 按钮、提示语和骑乘/擒抱效应改为中文显示。

## API

模块会暴露：

```js
game.rideableSimple
game.cangfanRideLink
game.Rideable
```

常用调用：

```js
game.rideableSimple.mountSelectedToTarget();
game.rideableSimple.dismountSelected();
game.rideableSimple.repairScene();
game.rideableSimple.clearScene();
```

Rideable 风格别名：

```js
game.Rideable.MountSelected();
game.Rideable.UnMountSelected();
game.Rideable.GrappleTargeted();
```

## 兼容说明

本模块会写入 `game.Rideable` 作为兼容别名。不要和完整 Rideable 模块同时启用，除非你明确希望由这个轻量模块提供这些 API 名称。

## 验证清单

启用模块后，用临时 token 验证以下内容，验证后删除测试 token：

- 选中骑手，指定坐骑，执行骑乘。
- 骑手获得“骑乘”效应。
- 移动坐骑，骑手跟随移动。
- 下马后，骑手出现在坐骑旁边 5 尺内的一格。
- 把“骑手被单独移动时”设为“移动坐骑”，拖动骑手，确认坐骑按同样距离移动。
- 用 GM 的 token HUD 测试骑上和下马按钮。
- 用一组合法体型和一组不合法体型测试尺寸限制。
- 重新载入场景后，如果旧场景骑乘关系异常，执行 `game.rideableSimple.repairScene()` 修复一次。
