# Brand Palette

| | |
|---|---|
| **Source of truth** | The four colors inside `apps/web/public/parinaam-logo.svg` |
| **Status** | Reference — **not yet applied**. The current theme (`apps/web/src/theme`) wears the HTML prototype's terracotta/cream, which predates the logo. Adopting this palette is a token swap (§6), not a redesign |
| **Derived** | 2026-08-25, with WCAG contrast checks on every text-bearing pairing |

## 1. Brand anchors — straight from the SVG

| Color | Hex | In the logo | Contrast note |
|---|---|---|---|
| **Parinaam Blue** | `#2691D0` | The "P" disc and the PARINAAM wordmark — the identity color | 3.2:1 on white — large text/graphics only, never body text or small button labels |
| **Orbit Teal** | `#0AAABA` | The two swooshes encircling the mark — the secondary voice | 2.9:1 on white — decorative/large only |
| **Sun Yellow** | `#FFD036` | The centre dot — pure accent | Never as text; dark text *on* yellow is 10.9:1 ✓ |
| **Slate** | `#445563` | The FOUNDATION lettering — the workhorse text color | 7.9:1 on white ✓ body-text safe |

## 2. Working shades

The raw blue and teal are too light to carry white text, so anything interactive steps one
shade down; tints carry selected states and soft backgrounds.

| Token | Hex | Use | Contrast (white text) |
|---|---|---|---|
| Blue 600 | `#1E7AB2` | Primary buttons, CTAs | 4.6:1 ✓ |
| Blue 700 | `#1B6EA0` | Hover / pressed / links / info | 5.5:1 ✓ |
| Blue 100 | `#D9EDF9` | Selected rows, active nav | — |
| Blue 50 | `#EDF6FC` | Soft panels, code chips | — |
| Teal 700 | `#078894` | Secondary buttons, focus rings | 4.5:1 ✓ |
| Teal 100 | `#D6F2F4` | Info chips, phase badges | — |
| Sun 700 | `#B37E00` | Warning text on light surfaces | 4.7:1 ✓ |
| Sun 100 | `#FFF3C9` | Highlights, "pending" fills | — |

## 3. Neutrals — slate-tinted, not grey

Every neutral leans toward the slate's blue hue so the chrome feels related to the mark.

| Token | Hex | Use |
|---|---|---|
| Ink | `#1F2B36` | Headings, app bar, emphatic text (14.4:1 ✓) |
| Slate | `#445563` | Body text (7.9:1 ✓) |
| Muted | `#5E6E7E` | Captions, secondary text (5.1:1 ✓) |
| Line | `#D8E0E8` | Borders, dividers |
| Cloud | `#F4F7FA` | Page background |
| Paper | `#FFFFFF` | Cards, tables, dialogs |

## 4. Semantic colors

Success is a true green — teal is a brand color here, so it cannot double as "good".
Warning derives from the sun; danger is a warm red that does not fight the blue.

| State | Color | Tint | Used for |
|---|---|---|---|
| Success | `#1E7F4F` | `#DCF2E6` | attended, enrolled, sent, active |
| Warning | `#B37E00` | `#FFF3C9` | pending, waitlisted, in progress |
| Danger | `#C9403B` | `#FAE3E2` | cancelled, rejected, failed, absent |
| Info | `#1B6EA0` | `#D9EDF9` | completed, notices (reuses Blue 700) |

## 5. Rules of use

1. **Blue leads, teal supports, yellow punctuates** — roughly 60 / 30 / 10, and yellow never
   carries text. Reserve the sun for one thing per screen (the highlight, the "new" badge).
2. Raw `#2691D0` / `#0AAABA` are for logos, icons and large display type only; anything
   interactive uses the 600/700 shades.
3. Semantic green/amber/red mean **state**, never decoration — a "cancelled" red must always
   mean something.
4. Every neutral comes from the slate ramp; a grey with no blue in it isn't ours.

## 6. Drop-in mapping to the existing theme tokens

Adopting the palette is a find-and-replace in `apps/web/src/theme`:

| Existing token | Today (prototype) | Brand-true value | Notes |
|---|---|---|---|
| `ink` (primary) | `#0f2b2d` | **`#1F2B36`** | App bar, headings |
| `accent` (secondary) | `#d96c3f` | **`#1E7AB2`** | Pill buttons — Blue 600 |
| `accentStrong` | `#bc5328` | **`#1B6EA0`** | Hover / pressed — Blue 700 |
| `mint` | `#8db8a6` | **`#0AAABA`** | Decorative fills — the orbit teal, used literally at last |
| `textMain` | `#132325` | **`#445563`** | Body — the FOUNDATION slate itself |
| `textMuted` | `#5e6a62` | **`#5E6E7E`** | Same lightness, blue-shifted hue |
| `success` | `#1d6b4d` | **`#1E7F4F`** | Nearly unchanged |
| `info` | `#3a60a0` | **`#1B6EA0`** | Folds into brand blue |
| `background.default` | `#f4ede2` (cream) | **`#F4F7FA`** | Warm → cool paper, same lightness |
| `background.paper` | `#fffcf7` | **`#FFFFFF`** | Cards / tables |
| *(new)* `sun` | — | **`#FFD036`** | The one-per-screen highlight |

Things to re-check if the swap is ever made: the neutral toast styling, chart series colors
on the metrics dashboard, the certificate PDF header (it embeds the logo PNG, so it already
matches the brand), and the email template gradient buttons
(`linear-gradient(135deg,#d96c3f,#bc5328)` → `linear-gradient(135deg,#2691D0,#1B6EA0)`).

## 7. Dark-mode companion values

If a dark theme ever ships, the anchors brighten rather than invert:
blue `#4FAADD`, teal `#2CC2CF`, sun stays `#FFD036`, slate text `#A9B8C6`,
ink text `#E6EDF3`, page `#101820`, paper `#18222C`, line `#2A3846`.
