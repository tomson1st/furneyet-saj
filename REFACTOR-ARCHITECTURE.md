# Frontend Component Refactor

This version keeps the existing React/Vite architecture and functionality, but separates the monolithic `client/src/main.jsx` into clear modules.

## Structure

```text
client/src/
├── main.jsx                 # Vite entry point only
├── App.jsx                  # Route-level app switch
├── style.css                # Existing global/site styles
├── lib/
│   └── utils.js             # API, money formatting, theme/meta helpers
├── context/
│   └── ProgressContext.jsx  # Shared action-progress context
├── components/
│   ├── shared/
│   │   ├── LiquidGlassDefs.jsx
│   │   └── TrackingResultInline.jsx
│   ├── customer/
│   │   ├── Home.jsx
│   │   ├── TrackOrder.jsx
│   │   ├── CustomerPanel.jsx
│   │   ├── CartModal.jsx
│   │   ├── TrackingModal.jsx
│   │   ├── SuccessModal.jsx
│   │   ├── Footer.jsx
│   │   └── Login.jsx
│   └── admin/
│       ├── Admin.jsx
│       ├── Orders.jsx
│       ├── Items.jsx
│       ├── Editor.jsx
│       ├── MarketingPanel.jsx
│       ├── AnalyticsPanel.jsx
│       ├── SettingsPanel.jsx
│       ├── UsersPanel.jsx
│       ├── UserEditor.jsx
│       ├── SideButton.jsx
│       └── perms.js
```

## Important

- No new framework or dependency was introduced.
- Existing API routes and business logic are preserved.
- Existing global CSS remains in `style.css` to avoid an unrelated styling rewrite.
- The refactor is organizational: future changes can target one component file instead of editing a 380-line `main.jsx`.
