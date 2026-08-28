# CSA Motion Runtime

`@csa/motion` is the implementation boundary for motion approved by the canonical
CSA Experience System. It combines Anime.js 4.5.0 with Motion 13.1.1 on the web
and exposes a dependency-free native adapter. Content remains usable before
animation starts, Motion features load lazily, and every entry point has an
explicit reduced-motion path.

This package adapts the architecture of `lrl-systems/packages/motion` at commit
`dc4b1ebfa30e455fd4fef60b112ad5d483c9e851`. It is CSA-owned: identifiers,
profiles, identity inputs, lifecycle rules, and runtime boundaries are expressed
for this repository. Source provenance is recorded in `MOTION_PROVENANCE`.

The package implements decisions. It does not replace
`design-system/CSA-EXPERIENCE-SYSTEM.md`, invent a creative direction, or make a
baseline surface compliant merely by being installed.

## One property, one owner

| Layer    | Owns                                                                                                                                             | Does not own                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Motion   | React presence, shared layout, state-driven continuity, hover/tap/focus/drag gestures, and component-local scroll state                          | Split text, global page choreography, route curtains, or direct-DOM counters |
| Anime.js | Hero and route timelines, text split/scramble, one-time section choreography, counters, bars, SVG, direct-DOM scroll, and sparse ambient signals | React mount/unmount or state-driven list layout                              |
| CSS      | Color, border, focus, image-crop zoom, and simple nonessential transitions                                                                       | A property already owned by Motion or Anime.js on the same element           |

One animated property on one element has one owner. Parent/child composition is
valid: Motion may tilt a shell while Anime.js reveals descendants and CSS zooms
an image child. Declarative Anime targets are marked
`data-csa-motion-owner="anime"`; the runtime skips a target already claimed by a
different engine.

## Entry points

- `@csa/motion`: runtime-neutral canonical timing, easing, stagger, and spring
  vocabulary. It has no DOM, React, or native imports.
- `@csa/motion/web`: `MotionProvider`, `MotionLift`, route-transition control,
  Motion primitives, and selected Anime.js capabilities.
- `@csa/motion/native`: reduced-motion, duration, seconds, easing, and native
  plan helpers without DOM or React Native imports.
- `@csa/motion/styles.css`: required web runtime styles. Import it once at the
  application root when the provider is adopted.

`MotionProvider` supports semantic `public` and `operations` profiles. They are
behavioral intensity profiles, not separate design systems. It requires the
surface label and complete curtain material pairing; there is deliberately no
package-level brand or palette fallback.

The required `effects` prop is an explicit allow-list. `effects={[]}` mounts an
inert provider: it adds no scroll indicator, scene choreography, curtain, or
link interception. Enable provider effects independently:

| Effect              | Enables                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `declarative-scene` | The scoped Anime.js declarative hooks listed below                    |
| `route-transition`  | A curtain, route-link interception, and `useMotionTransition` control |
| `scroll-progress`   | The fixed Motion-owned reading progress indicator                     |

Every enabled entry requires a matching approved effect in the current scoped
manifest and interaction/motion plan; the surface aggregate may index that
record but does not approve the effect. In particular, `route-transition` is
only valid for an approved full page/document change; provider adoption alone
does not authorize it.

## Web declarative hooks

- `data-csa-motion-split`: accessible word-split entrance.
- `data-csa-motion-scramble`: restrained system-text scramble.
- `data-csa-motion-enter="header|rise|slide|scale"`: initial choreography.
- `data-csa-motion-reveal="up|left|right"`: one-shot scroll reveal.
- `data-csa-motion-stagger="scroll"`: stagger direct children on entry.
- `data-csa-motion-draw`: draw SVG geometry once in view.
- `data-csa-motion-bars`: grow direct child bars from their baseline.
- `data-csa-motion-number`: count the first formatted number in an element.
- `data-csa-motion-hover`: Anime-owned fine-pointer magnetic response. Never
  combine it with Motion gesture transforms on the same node. It reverts on
  pointer cancel/lost capture, focus exit, pointer-capability or reduced-motion
  changes, offscreen/hidden state, and unmount.
- `data-csa-motion-pulse`, `data-csa-motion-orbit`, and
  `data-csa-motion-parallax`: sparse ambient signals. Loops pause outside the
  viewport; Anime.js also pauses its engine while the document is hidden.
- `data-csa-motion-native`: curtain, then full navigation.
- `data-csa-motion-ignore`: opt a link out of route interception.
- `data-csa-motion-scene`: replay boundary inside a stable operations shell.

The governing rule is functional motion first: orientation, hierarchy, state
continuity, and feedback. Ambient motion stays sparse. Every adopted effect must
also define normal, reduced-motion, no-JavaScript, input-parity, interruption,
ownership, stable-anchor, and lifecycle behavior in its scoped manifest.

`MotionLift` is an explicit component-level effect rather than a provider
default. Its press response uses the canonical `0.96` scale; spatial response is
fine-pointer-only and resets on cancel/lost capture, focus exit, input or motion
preference changes, offscreen/hidden state, and unmount. Both pointer paths
remove their observers/listeners and stop or revert owned values during cleanup.
