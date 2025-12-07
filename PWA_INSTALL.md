# 📱 PWA Installation Guide

## What's a PWA?

**Progressive Web App** - It's a website that works like a native app!

✅ Works offline  
✅ Install on home screen  
✅ Runs full-screen (no browser UI)  
✅ Faster tap response (no 300ms delay)  
✅ App icon on your phone  

---

## iPhone Installation

1. **Open Safari** (must use Safari, not Chrome!)
2. **Go to** `https://gerritsxd.com/tww/`
3. **Tap the Share button** (square with arrow pointing up)
4. **Scroll down** and tap **"Add to Home Screen"**
5. **Tap "Add"** in the top right
6. **Done!** TWW icon appears on your home screen

### Now tap the icon to launch the app!

It will run in full-screen mode without Safari's UI - feels like a native app! 🎉

---

## Android Installation

1. **Open Chrome**
2. **Go to** `https://gerritsxd.com/tww/`
3. **Tap the ⋮ menu** (three dots)
4. **Tap "Add to Home screen"** or **"Install app"**
5. **Tap "Install"**
6. **Done!** TWW icon appears on your home screen

---

## Desktop Installation (Chrome/Edge)

1. **Open Chrome or Edge**
2. **Go to** `https://gerritsxd.com/tww/`
3. **Click the install icon** in the address bar (or go to Settings → Install)
4. **Click "Install"**
5. **Done!** TWW opens as a desktop app

---

## Benefits of Installing as PWA

### On iPhone:
- **No 300ms tap delay** - Instant response!
- **Full-screen** - No Safari UI stealing space
- **No double-tap zoom** - Taps work perfectly
- **Standalone mode** - Feels like a real app
- **Home screen icon** - Quick access

### On All Devices:
- **Faster** - Resources cached locally
- **Works offline** - View cached bubbles
- **Push notifications** (future feature!)
- **Battery efficient**

---

## Uninstalling

### iPhone:
Long-press the TWW icon → "Remove App" → "Delete App"

### Android:
Long-press the TWW icon → "Uninstall"

### Desktop:
Settings in app → "Uninstall TWW"

---

## Troubleshooting

**"Add to Home Screen" doesn't appear?**
- Make sure you're using Safari on iPhone (not Chrome/Firefox)
- Try reloading the page
- Check you're on HTTPS

**Icon doesn't show correctly?**
- The icon will appear after you generate it (see generate-icons.html)

**App doesn't update?**
- Close and reopen the app
- Or uninstall and reinstall

---

## For Developers

The app is now a PWA with:
- `manifest.json` - App configuration
- `service-worker.js` - Caching & offline support
- iOS meta tags - Full-screen mode
- `touch-action: manipulation` - No tap delay
- Standalone display mode

Push updates by bumping the cache version in `service-worker.js`!

