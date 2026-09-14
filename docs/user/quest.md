# Quest join

Same Wi-Fi as the Mac. Quest Browser, not an APK.

1. On the Mac tab at `https://127.0.0.1:7322`, click **Enter Quest**,
   or read the QR / code printed by `pnpm dev` / `pnpm serve`.
2. That panel shows a LAN URL, a QR, and a 6-character code (about five
   minutes, single use).
3. On the headset, open `https://<mac-ip>:7322/pair`, accept the cert
   once, type the code. A phone can scan the QR instead (token is in the
   URL fragment).
4. Allow WebXR, then **Enter Studio**. Passthrough is in the in-headset
   settings.

Join URLs always use port **7322**, never the dev API port. After pairing,
the headset stores a device token (`sfab-bench.deviceToken` in
localStorage) and can open the viewer without typing the code again.

Mac and Quest share the open folder, file recents, the thread list, and
messages at rest. Each headset or tab keeps its own loaded STEP, selection,
camera, XR layout, and live chat. Opening a file on the Mac does not change
what the Quest is looking at.

Opening `https://<lan-ip>:7322` on the Mac is treated as a guest: it
must pair.
