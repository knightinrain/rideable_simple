# Rideable Simple

`Rideable Simple` is a lightweight Foundry VTT riding module for the Cangfanjie table setup.

It provides basic mounted-token handling without relying on the full Rideable module. It supports mount and dismount operations, token HUD controls, size restrictions, rider placement, following behavior, mounted/grappled effects, and a small compatibility API for macros that expect Rideable-style function names.

## Manifest URL

Use this URL in Foundry's module installer:

```text
https://raw.githubusercontent.com/knightinrain/rideable_simple/main/module.json
```

## Requirements

- Foundry VTT v13. Minimum target: v12.
- Designed for token-based play.
- Works best when the GM controls mount setup and scene repair.

## Installation

1. Open Foundry VTT Setup.
2. Go to **Add-on Modules**.
3. Click **Install Module**.
4. Paste the manifest URL above.
5. Install the module.
6. Open the world and enable **Rideable Simple** in **Manage Modules**.
7. Refresh the world once after enabling.

The current manifest uses GitHub's branch zip as the download target. If Foundry refuses to install the module even though the manifest opens in a browser, create a GitHub Release zip with `module.json`, `scripts/`, and `styles/` at the zip root, then update the `download` field to that asset URL.

## Main Features

- Mount selected rider tokens onto one targeted mount token.
- Dismount selected mounted tokens.
- Dismount all riders from a mount.
- Add Token HUD buttons for GM use.
- Keep riders positioned on the mount when the mount moves.
- Place a dismounted rider into an adjacent square beside the mount.
- Supports center, row, and circle rider placement.
- Optional rider elevation, rotation sync, and rider scale.
- Optional following behavior.
- Optional mounted or grappled Active Effects.
- Scene repair and scene clear helpers.
- Rideable-compatible API aliases for existing macros.

## Default Controls

- Select rider token(s), target one mount token, then use the mount workflow.
- GM can also open a mount token HUD and use the added riding buttons.
- Press `M` to mount selected tokens onto the hovered token.
- Press `N` to dismount selected mounted tokens.

## Size Rule

By default, size restriction is enabled. The mount must be at least one size category larger than the rider.

This can be changed in module settings:

- `Enforce Size Restriction`
- `Required Size Difference`
- `Size Rule Mode`: choose at least the required difference, or exactly the required difference.
- `Max Riders`
- `Rider Placement`
- `Mounting Distance`

## Rider Movement

The `When rider moves independently` setting controls what happens when a mounted rider token is moved directly:

- `Record as free offset`: store the rider's new relative position on the mount.
- `Return to seat`: move the rider back to the configured seat.
- `Dismount`: remove the riding link.
- `Move mount`: move the mount by the same x/y distance as the rider's attempted move.

For tables where the rider should always use the mount's tactical movement, set `When rider moves independently` to `Move mount` or `Return to seat`. `Move mount` lets dragging the rider move the mount by the same distance; `Return to seat` makes the mount token the only movement token.

Version `0.3.3` repairs mount movement follow-up by checking both sides of the riding link: the mount's rider list and each rider token's mounted flag. If an older scene has a stale mount rider list, moving the mount or running scene repair now rebuilds the list before syncing riders.

Version `0.3.4` changes dismount placement. When a rider dismounts, the module chooses a grid square in the one-square ring around the mount's occupied space. It prefers the closest unoccupied square and only falls back to the first adjacent square if all nearby positions are blocked.

Version `0.3.5` fixes rider-driven mount movement. When `Move mount` or piloting is active, the module now compares the rider's target position against the last stored rider position, so it does not lose movement distance if Foundry has already updated the token document before the hook runs.

## API

The module exposes:

```js
game.rideableSimple
game.cangfanRideLink
game.Rideable
```

Common calls include:

```js
game.rideableSimple.mountSelectedToTarget();
game.rideableSimple.dismountSelected();
game.rideableSimple.repairScene();
game.rideableSimple.clearScene();
```

Rideable-style aliases include:

```js
game.Rideable.MountSelected();
game.Rideable.UnMountSelected();
game.Rideable.GrappleTargeted();
```

## Compatibility Note

This module writes `game.Rideable` as a compatibility alias. Do not enable it together with the full Rideable module unless you intentionally want this smaller module to provide those API names.

## Verification Checklist

After enabling the module in a world, verify these points with temporary tokens and then delete them:

- Select a rider token and target one mount token.
- Mount the rider and confirm the rider receives the mounted effect.
- Move the mount and confirm the rider follows.
- Dismount the rider and confirm the rider appears in an adjacent square beside the mount.
- Set `When rider moves independently` to `Move mount`, move the rider, and confirm the mount moves by the same distance.
- Try the Token HUD mount and unmount controls as GM.
- Test the configured size rule with one valid and one invalid pair.
- Reload the scene and run scene repair if needed.
- For an existing broken riding pair, dismount and mount again, or run `game.rideableSimple.repairScene()` once, then move the mount to verify the rider follows.

## Notes

This module is intentionally small. It is meant to cover the riding behavior needed at the table, while keeping the installation and troubleshooting surface manageable.
