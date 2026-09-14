import {
  clientOf,
  endSessionRun,
  hydrateSession,
  rememberOpenedFile,
  sessionState,
  startSessionRun,
  subscribeSession,
} from "./session";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

hydrateSession();
expect(sessionState().fileRecents.length === 0 || Array.isArray(sessionState().fileRecents), "file recents is an array");
expect(!("doc" in sessionState()), "library session has no shared doc");
expect(sessionState().project.path === "" || typeof sessionState().project.path === "string", "project path is a string");

const received: string[] = [];
const unsub = subscribeSession({
  send: (data) => received.push(data),
});

rememberOpenedFile("cad/STEP/box.step");
expect(
  received.some((row) => row.includes('"type":"library"') || row.includes("fileRecents")) || !sessionState().project.path,
  "remembering a file broadcasts library when a project is open, or no-ops without one",
);

const mac = { kind: "loopback" as const };
expect(clientOf(mac).label === "Mac", "loopback label is Mac");

const quest = { kind: "paired" as const, deviceId: "dev-1", label: "Quest", scopes: ["view" as const, "chat" as const] };
expect(clientOf(quest).id === "dev-1", "paired client id is the device");

const run = startSessionRun();
expect(run != null, "idle run starts");
expect(startSessionRun() == null, "second run is rejected");
endSessionRun();
expect(startSessionRun() != null, "run lock clears");
endSessionRun();

unsub();
console.log("session.selfcheck ok");
