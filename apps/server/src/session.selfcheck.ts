import {
  clientOf,
  hydrateSession,
  publishSessionThread,
  sessionState,
  setSessionDoc,
  setSessionSelection,
  startSessionRun,
  subscribeSession,
  viewerStamp,
} from "./session";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

hydrateSession();
expect(sessionState().status === "idle", "fresh session is idle");

const received: string[] = [];
const unsub = subscribeSession({
  send: (data) => received.push(data),
});

setSessionDoc("cad/STEP/box.step", { skipResolve: true });
expect(sessionState().doc.file === "cad/STEP/box.step", "setDoc stores file");
expect(received.some((row) => row.includes('"type":"doc"') && row.includes("box.step")), "setDoc broadcasts");

const firstRev = sessionState().doc.rev;
setSessionDoc("cad/STEP/box.step", { skipResolve: true, reload: true });
expect(sessionState().doc.rev === firstRev + 1, "reload bumps rev");

const mac = { kind: "loopback" as const };
setSessionSelection("#o1", "Yoke", mac);
expect(sessionState().doc.selection?.ref === "#o1", "selection stored");
expect(sessionState().doc.selection?.by === "loopback", "selection by Mac");
expect(clientOf(mac).label === "Mac", "loopback label is Mac");

const quest = { kind: "paired" as const, deviceId: "dev-1", label: "Quest", scopes: ["view" as const, "chat" as const] };
setSessionSelection("#o2", "Shell", quest);
expect(sessionState().doc.selection?.by === "dev-1", "selection by Quest");
expect(viewerStamp().selected === "#o2", "stamp uses session selection");
expect(viewerStamp().file === "cad/STEP/box.step", "stamp uses session file");

const run = startSessionRun();
expect(run != null, "idle run starts");
expect(startSessionRun() == null, "second run is rejected");
publishSessionThread([], "idle", true);

unsub();
console.log("session.selfcheck ok");
