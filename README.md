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

Version `0.3.2` fixes the `Move mount` behavior so it uses the rider's actual token movement instead of stale stored coordinates.

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
- Dismount the rider and confirm the effect is removed.
- Try the Token HUD mount and unmount controls as GM.
- Test the configured size rule with one valid and one invalid pair.
- If using `Move mount`, move the rider and confirm the mount moves by the same distance.
- Reload the scene and run scene repair if needed.

## Notes

This module is intentionally small. It is meant to cover the riding behavior needed at the table, while keeping the installation and troubleshooting surface manageable.
