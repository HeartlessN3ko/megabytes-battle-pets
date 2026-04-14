# Main Room Parallax + Decor Placement Brief

Date: 2026-04-13
Project: MEGA-BYTES
Use: Main home room background for mobile, portrait, decor placement ready, subtle phone-tilt depth

## Goal

Create the main room as a layered, parallax-ready room kit for the home screen.

This is not a one-off wallpaper. It is a gameplay background system.

The room must support:
- a centered Byte/pet standing area
- subtle in-phone fake 3D depth from layered parallax
- fixed decor placement slots
- clean readability on mobile
- a futuristic digital atmosphere

## Reference Direction

Use the current dark neon-blue room concept as the composition and mood reference:
- enclosed cyber room
- locked frontal camera
- soft center floor glow
- readable wall/floor perspective
- calm digital atmosphere

Keep the mood premium, clean, and slightly mysterious.

## Final Output Package

Deliver a layered room kit as aligned transparent PNGs on the same portrait canvas.

Target master size:
- 1440 x 2560 minimum
- 2160 x 3840 ideal if performance pipeline can scale it down later

All layers must share:
- identical framing
- identical horizon/perspective
- identical camera placement

## Required Layer Stack

Export these as separate transparent PNGs:

1. `main-room-back-wall.png`
- rear wall only
- no foreground clutter

2. `main-room-left-wall.png`
- left side wall / panel structure

3. `main-room-right-wall.png`
- right side wall / panel structure

4. `main-room-floor.png`
- floor plane and floor glow

5. `main-room-glow.png`
- trim lights, bloom accents, side glows, soft room lighting accents

6. `main-room-particles.png`
- floating digital dust / pixel squares / ambient motes
- sparse, subtle, not noisy

7. `main-room-foreground-left.png`
- closest lower-left foreground prop mass

8. `main-room-foreground-right.png`
- closest lower-right foreground prop mass

Optional:

9. `main-room-placement-surfaces.png`
- helper surfaces if shelves, cabinets, ledges, or mounted panels need separate visual control

10. `main-room-preview-flat.png`
- a flattened preview composite for fast review

## Perspective + Parallax Rules

The room should feel like a display box or habitat inside the phone.

Parallax should be subtle. The image is meant to shift by small amounts when the phone moves.

Depth hierarchy:
- farthest: back wall
- far: left and right walls
- mid: floor
- mid-far: glow layer
- floating overlay: particles
- nearest: foreground left and right props

Do not design extreme perspective distortion. This needs to stay believable under small motion shifts.

## Decor Placement Requirement

The room must be intentionally composed for fixed slot placement.

Do not free-place visual clutter in these zones. These must remain visually readable and usable as anchor regions for future decor.

Required slot families:
- left wall frame/screen slot
- right wall frame/screen slot
- upper rear wall feature slot
- left cabinet or shelf zone
- right cabinet or shelf zone
- left device surface zone
- right device surface zone
- left floor decor zone
- right floor decor zone
- optional premium center-rear feature zone

Decor examples the room must support:
- cabinets
- pictures
- bookshelves
- tablets / iPads
- digital toys
- monitors / display panels
- small floor decor

Important:
- the room art should quietly suggest where objects belong
- the player should be able to understand likely placement areas without giant markers

## Visual Design Rules

Desired tone:
- dark
- futuristic
- cozy-digital
- neon blue / violet
- clean and premium

Keep:
- center area mostly open for Byte and interaction UI
- side structures readable
- floor perspective strong enough for object anchoring
- wall paneling structured enough to support placed art/screens

Avoid:
- text
- logos
- heavy clutter in slot areas
- random furniture blocking placement
- over-detailed texture noise
- flat wallpaper look
- fantasy or medieval styling
- baked UI elements

## Motion Spec For Implementation

These are the intended max layer offsets for phone-tilt parallax:

- back wall: `x +/-4px`, `y +/-2px`
- left wall: `x +/-6px`, `y +/-3px`
- right wall: `x +/-6px`, `y +/-3px`
- floor: `x +/-10px`, `y +/-6px`
- glow: `x +/-5px`, `y +/-3px`
- particles: `x +/-12px`, `y +/-8px`
- foreground left: `x +/-16px`, `y +/-10px`
- foreground right: `x +/-16px`, `y +/-10px`

Rules:
- clamp movement
- smooth movement
- no edge exposure
- keep motion subtle to avoid nausea

Each layer should include bleed beyond the visible frame:
- far layers: at least 3 percent
- mid layers: at least 5 percent
- near layers: at least 8 to 10 percent

## Implementation Notes For UI / Frontend

This room is for fixed-slot placement, not free placement.

The game system will:
- highlight valid slots for an item
- let the player tap a slot
- preview the decor in that slot
- ask for confirmation
- save the item in that slot

Because of this, the room art must preserve clean, consistent placement anchors.

## Suggested Slot IDs

Use these slot IDs as the naming baseline:

- `wall_left_frame`
- `wall_right_frame`
- `wall_center_feature`
- `cabinet_left`
- `cabinet_right`
- `surface_left_device`
- `surface_right_device`
- `floor_left_large`
- `floor_right_large`
- `floor_left_small`
- `floor_right_small`

## Review Checklist

Before final approval, check:
- does the room still read clearly on a phone screen
- is the Byte center area open enough
- are the decor zones obvious but not ugly
- do the layers separate cleanly
- do the side walls and floor still feel coherent when stacked
- does the room still look premium when flattened
- would subtle phone tilt make it feel deeper rather than sloppy
