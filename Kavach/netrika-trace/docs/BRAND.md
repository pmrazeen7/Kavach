# Kavach brand

Source files live in `/logo` and are never edited. `npm run brand` (in `frontend/`) regenerates everything derived from
them: the inline SVG data used by the `<Logo />` component, favicons, PWA icons, `og.png`, and the files in `docs/assets/`.

## Files

| File | Use |
|---|---|
| `kavach-logo.svg` | Animated lockup on light backgrounds |
| `kavach-logo-dark.svg` | Animated lockup on dark backgrounds |
| `kavach-logo-static.svg` | Lockup where motion is not wanted (footers, print, email, docs) |
| `kavach-mark.svg` / `kavach-mark-static.svg` | The shield alone, animated or static |
| `kavach-mark-512.png`, `favicon-64.png` | Raster fallbacks |

## In the app

```tsx
<Logo variant="full" size={44} animated />          // lockup, height in px
<LogoMark size={36} />                              // shield only
<LogoMark size={18} tint="blocked" tintKey={n} />   // brief pink-red tint; "safe" gives a mint pulse
```

`theme="auto"` (default) colors the wordmark from the `--fg` and `--muted` tokens, so it follows light and dark mode.
`theme="light"` and `theme="dark"` pin the brand colors. Every instance gets its own gradient and clip ids.

## Rules

- **Minimum size:** mark 16px, lockup 120px wide (about 32px tall). Below that, use the mark alone.
- **Motion:** below 32px the mark is always static. At most two animated logos are on screen at once (the component
  enforces this; extra ones render static). Animation pauses when the tab is hidden and stops under
  `prefers-reduced-motion`.
- **Clear space:** keep a margin equal to the width of the K's stem (17 of the mark's 256 units, about 6.6% of its size)
  on every side. `clearSpace` on `<Logo />` adds it.
- **Backgrounds:** the light lockup goes on light surfaces, the dark lockup on dark ones. Use `theme="auto"` in the app.

### Do

- Use the static mark for favicons, tiny badges, and anywhere motion would distract.
- Use the animated lockup once per screen, in the navbar or hero.
- Give meaningful uses an `aria-label`; mark decorative copies `aria-hidden` (`decorative`).

### Don't

- Stretch, skew, rotate, outline, or add shadows to the logo.
- Recolor the shield or the wordmark. The status tint is a brief overlay, not a recolor.
- Place the animated logo over busy imagery, or put several animated copies side by side.
- Redraw the K or retype the wordmark in a font.
