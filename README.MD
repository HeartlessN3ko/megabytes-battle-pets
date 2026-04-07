# Battle Pets — Game Design Document
**Status:** Pre-production | **Lead:** HeartlessN3ko | **Target:** iOS & Android

---

## The Concept

The internet is losing. Malware, slop, and corrupted data are spreading across Internet.city — and it's getting bad. A rogue AI art generator called Slopitron.exe has gone fully off the rails, flooding the network with grotesque generated monsters that look exactly like what you'd expect from a corrupted image model. The only counter is you. Trainers who raise MEGA-BYTES — digital creatures born from clean data — and send them into battle against the slop army.

That's the world. But the game is really about your MEGA-BYTE.

You hatch it, feed it, train it, care for it, and battle it. How you treat it determines what it becomes. The stats you train shape its body. The way you raise it shapes its personality. Push it too hard and it burns out. Neglect it and it hides from you. Raise it well and it lives a full life, leaves behind a data egg, and passes something on to the next generation. No two MEGA-BYTES look the same. That's the point.

---

## Core Loop

Hatch an egg from the nursery → care for it daily (feed, clean, rest, play) → train its stats → watch it evolve based on what you actually did → enter it in battles or pageants → earn Battlecoins → upgrade your home → do it again with a better byte next generation.

The game is designed for people who want something to check in on. Short sessions, meaningful choices, no punishment for being human about it.

---

## Evolution System

MEGA-BYTES evolve through five stages. Every stage is driven by your behavior, not a level gate.

**Stage 1 — Shape.** Your starter egg is assigned based on a personality questionnaire. Five base shapes: Circle, Square, Triangle, Diamond, Hexagon. This is your byte's permanent silhouette foundation.

**Stage 2 — Element.** Determined by your care habits and training patterns. Seven elements plus a rare Shadow/Holy polarity pair. Element affects battle matchups and sets the visual color palette and particle effects going forward.

**Stage 3 — Animal Type.** Twenty animal inspirations ranging from common (Cat, Dog, Bird) to very rare (Dragon, Octopus). Rarity is tied to your playstyle. The community will figure out the unlock conditions eventually — we're not publishing them.

**Stage 4 — Branch.** This is where the byte splits based on what you actually did with it. Heavy battler goes down the combat branch — bigger, heavier, sharper. Care-focused trainer goes down the nurture branch — softer, glowing, more expressive. Both paths lead to the same Stage 5 but look completely different getting there.

**Stage 5 — Temperament.** The final layer. Fifteen temperaments from Noble and Kind down to Unstable and Corrupt. Built from thousands of small daily choices — how often you praised it, how hard you pushed it, whether you were consistent. It's hidden until it locks in. You'll find out what kind of trainer you are when your byte evolves.

All evolution is additive. 80% of the base model carries forward, 20% new per stage. The artist works from a modular asset system — the byte grows, it doesn't get redrawn from scratch.

---

## Battle System

Battles are 60 seconds of auto-combat. You don't control your byte mid-fight. You set your loadout beforehand — four moves plus an ult — and then watch.

During the battle you can cheer, boo the opponent, taunt, or suggest your byte use its ult. Cheering has a small random chance of giving your byte a last-second mercy proc at 1HP. Suggesting the ult doesn't guarantee it fires. Your byte has its own personality and will make its own call. The opponent sees all of this in real time.

Moves are element-typed with five functions: Damage, Buff, Debuff, Status, and Utility. Fifty moves at launch across nine elements. Status effects last three turns, first applied wins, no stacking. Off-element moves are learnable but cost more energy and require higher stats to hit full power.

Your byte's current mood and energy affect its performance in 25% chunks. A tired, unhappy byte fights at a fraction of its potential. The game tracks this. So should you.

PvP is level-matched and blind — you don't see your opponent's exact stats before committing. Arena mode lets you list your byte passively so other trainers can challenge it while you're offline. Your byte earns wins and rewards whether you're watching or not. Results update when you check in.

---

## The MEGA-BYTE

Your byte has six need meters: Hunger, Bandwidth (energy), Hygiene, Social, Fun, and Mood. Let any of them bottom out long enough and your byte starts acting out — hiding in the home screen, refusing to train, making messes. They all act like cats. Small bytes like house cats. Big evolved ones like tigers.

Overtraining past zero energy risks permanent stat damage. Push it hard enough for long enough and it dies early. A well cared for byte can hit level 100 and live out its full lifespan. When it goes, it gets a memorial — a generated eulogy pulled from your actual care data — and leaves behind a data egg that carries one move and a stat bonus into the next generation.

There is no reviving a dead byte. That's the whole point.

---

## Home & Rooms

Your byte lives on your home screen and follows you between tabs. The environment reflects how you play.

Four rooms are always active: Bedroom, Kitchen, Bathroom, Training Center. Eight additional rooms unlock through level gates and Battlecoins — Play Room, Clinic, Pageant Hall, Gallery, Trophy Room, and six passive rooms that apply small always-on stat bonuses. You can run two passive rooms at a time. Swapping them out is part of the ongoing strategy.

---

## Tech Stack

- **Frontend:** React Native + Expo (iOS & Android from one codebase)
- **Backend:** Node.js + MongoDB Atlas
- **Deployment:** Expo EAS for app store submission
- **Pipeline:** AI-assisted development — Claude handles architecture and logic generation, humans drive design decisions and final implementation

This is not a team that pretends AI doesn't exist. It's a tool in the stack like any other. The design, the vision, and the creative direction are human. If that's a problem for you, this isn't the right project.

---

## Who We're Looking For

We're a small team building a real shipped game on a rev share model. Equal split minus overhead. We want people who are building because they want to make the thing, not because they're guaranteed a check.

**Character / Creature Artist**
You'll own the visual identity of this game. The MEGA-BYTE asset system is modular — you're designing a system of parts that assemble into thousands of combinations, not drawing individual monsters one by one. Cell shading or a strong defined style with clean linework is ideal. You need to be able to produce production-ready assets with consistent sizing, transparent backgrounds, and layering in mind. If you've done game assets before you already understand what this means. Portfolio required. Style is flexible — we'll build the visual language around the right person.

**Mobile Developer**
React Native and Expo experience. You've shipped something to an app store before, even something small. You're comfortable with async state, MongoDB, and working from a design doc rather than waiting to be told every step. Bonus if you've worked in an AI-assisted pipeline before.

Both roles need someone who can communicate, show up consistently, and handle a fast-moving build without going quiet for two weeks.

---

## Timeline & Commitment

The target is a shippable MVP in 1-2 months. That's real. That's also not a "whenever I get to it" pace.

Flexible schedule means life happens and we're not punching a clock. It does not mean low output. We need people who can put in significant focused hours when it counts and communicate when they can't. If you're juggling three other projects and can only give a few hours a week this probably isn't the right fit right now.

We'd rather take longer with the right people than rush it with the wrong ones. But we are trying to ship.

---

## Contact

Portfolio and prior work required with all inquiries.

**Email:** sky3vernon@gmail.com
**itch.io:** heartlessn3ko.itch.io
**GitHub:** github.com/HeartlessN3ko

If you made it this far and something about this project got you — reach out.