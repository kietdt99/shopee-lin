# Changelog

## [0.1.3] — Unreleased

### Added

- Add an Admin-uploaded installment QR and Viewer payment dialog showing its fixed 1,800,000 VND amount and `be Lin tra gop s25u` transfer content.
- Show paid and unpaid totals for the applied order billing-cycle selection, with an explicit cycle context.
- Add a password visibility control and a full-screen loading state during sign-in and app initialization.
- Add unit coverage for billing-cycle order summaries and expand cross-browser auth, filter, search, and reduced-motion checks.

### Fixed

- Keep ordinary sign-in and expired activation links on the correct auth screen; restore the requested tab after refresh or browser navigation.
- Improve cycle summary helper text contrast to meet WCAG AA.
- Make password-field browser tests target the textbox rather than the adjacent visibility button.

### Quality

- Derive test redirects from the active Playwright port and include a desktop-only synthetic Orders performance baseline.
- Add a local API configuration guard that refuses hosted or non-loopback Supabase URLs.
