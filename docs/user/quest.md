# Quest join

Same Wi-Fi as the Mac. Quest Browser, not an APK.

1. On the Mac tab at `https://127.0.0.1:7322`, click **Enter Quest**,
   or read the QR / code printed by `pnpm dev` / `pnpm serve`.
2. That panel shows a LAN URL, a QR, and a 6-character code (about five
   minutes, single use).
3. On the headset, open `https://<mac-ip>:7322/pair`, accept the cert
   once, type the code. A phone can scan the QR instead (token is in the
   URL fragment).
4. Allow WebXR, then **Enter Studio**. In the headset settings, **Pass** is
   passthrough and **Studio** is the grid room. **Light** / **Dark** paints
   the menus in both, and the studio floor when you are in Studio.

Join URLs always use port **7322**, never the dev API port. After pairing,
the headset stores a device token (`sfab-bench.deviceToken` in
localStorage) and can open the viewer without typing the code again.

Mac and Quest share recents, the thread list for a given folder, and
messages at rest. Quest picks a folder from the Mac's recents and starts
on the one the Mac opened last. Opening a folder on the Mac does not move
the Quest. Each headset or tab keeps its own loaded STEP, selection,
camera, XR layout, and live chat.

Opening `https://<lan-ip>:7322` on the Mac is treated as a guest: it
must pair.
