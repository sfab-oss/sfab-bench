import type {
  WorldSender,
  WorldServerMessage,
  WorldState,
} from "@sfab-bench/contract";
import { useEffect } from "react";

import { getDeviceToken } from "@/lib/api";
import { commandNotice, isOwnCommandNonce } from "@/lib/world-issues";
import { worldLiveSocketUrl } from "@/lib/world-live-url";
import { worldCommandNonce } from "@/lib/world-nonce";
import { worldSocketKey } from "@/lib/world-socket";
import { invalidateSceneNow } from "@/scene/invalidate";
import {
  appendBoardSerial,
  noteBoardSent,
  resetBoardConsole,
} from "@/state/board-console";
import {
  setWorldLiveState,
  useWorld,
  worldLiveState,
  worldStore,
} from "@/state/world";

const SIM_TIME_MS = 200;
const ATTACH_COMMAND_MS = 300;
const NOTICE_MS = 3200;

let socket: WebSocket | null = null;
/** Nonces this tab has sent and not yet seen echoed. */
const sentNonces = new Set<string>();

export function sendWorldCommand(type: "play" | "pause") {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const nonce = worldCommandNonce();
  sentNonces.add(nonce);
  socket.send(JSON.stringify({ type, nonce }));
}

export function sendBoardSerial(board: string, text: string) {
  if (!board || !text || socket?.readyState !== WebSocket.OPEN) return;
  const nonce = worldCommandNonce();
  socket.send(JSON.stringify({ type: "serial-send", board, text, nonce }));
}

function senderLabel(by: WorldSender): string {
  return by.kind === "agent" ? "agent" : by.label || "someone";
}

function backoff(attempt: number): number {
  return Math.min(8_000, 400 * 2 ** attempt);
}

/**
 * One socket for the open world. Poses stay in a ref. React hears
 * play state, a throttled sim time, the last remote command, and errors.
 */
export function useWorldRun(project: string, world: string) {
  const loadId = useWorld((s) => s.loadId);
  // revision is intentionally absent: a reload refetches meshes only.
  const socketKey = worldSocketKey({ project, world, loadId });
  useEffect(() => {
    if (!project || !world) return;
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let noticeTimer: ReturnType<typeof setTimeout> | null = null;
    let attachTimer: ReturnType<typeof setTimeout> | null = null;
    let lastHud = 0;
    let sawState = false;
    let attachCommand = false;
    const hud = worldStore.getState();
    resetBoardConsole();

    const clearAttach = () => {
      if (attachTimer) clearTimeout(attachTimer);
      attachTimer = null;
      attachCommand = false;
    };

    const publish = (state: WorldState) => {
      setWorldLiveState(state);
      invalidateSceneNow();
      const now = performance.now();
      const current = worldStore.getState();
      current.setBoards(state.boards);
      const playingChanged = current.playing !== state.playing;
      const due = now - lastHud >= SIM_TIME_MS || current.connection !== "live";
      if (!playingChanged && !due) return;
      lastHud = now;
      current.setRun(state.playing, due ? state.simTime : current.simTime);
    };

    const showNotice = (text: string) => {
      worldStore.getState().setNotice(text);
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        worldStore.getState().setNotice(null);
      }, NOTICE_MS);
    };

    const onMessage = (raw: string) => {
      let message: WorldServerMessage;
      try {
        message = JSON.parse(raw) as WorldServerMessage;
      } catch {
        return;
      }
      if (message.type === "state") {
        if (!sawState) {
          sawState = true;
          attachCommand = true;
          if (attachTimer) clearTimeout(attachTimer);
          // The attach snapshot's `command` follows `state` immediately.
          // A later command is someone acting, and every client shows it.
          attachTimer = setTimeout(() => {
            attachCommand = false;
          }, ATTACH_COMMAND_MS);
        }
        worldStore.getState().clearRunProblem();
        publish(message.state);
        return;
      }
      if (message.type === "command") {
        const duringAttach = attachCommand;
        if (duringAttach) clearAttach();
        const playing = message.command === "play";
        const live = worldLiveState();
        if (live) setWorldLiveState({ ...live, playing });
        worldStore.getState().setRun(playing, worldStore.getState().simTime);
        const own = isOwnCommandNonce(message.nonce, sentNonces);
        if (message.nonce) sentNonces.delete(message.nonce);
        if (duringAttach || own) return;
        showNotice(commandNotice(message.command, message.by));
        return;
      }
      if (message.type === "reloaded") {
        resetBoardConsole();
        worldStore.getState().noteReload();
        return;
      }
      if (message.type === "serial") {
        appendBoardSerial(message.board, message.text, message.next);
        return;
      }
      if (message.type === "serial-sent") {
        noteBoardSent(message.board, message.text, senderLabel(message.by));
        return;
      }
      if (message.type === "error") {
        // One board's firmware fault leaves the run playing. The board
        // snapshot on the next state carries the reason.
        if (message.board) return;
        const live = worldLiveState();
        if (live) setWorldLiveState({ ...live, playing: false });
        worldStore.getState().setRunProblem(message.errors, message.message);
        invalidateSceneNow();
      }
    };

    const connect = () => {
      if (closed) return;
      sawState = false;
      clearAttach();
      const url = worldLiveSocketUrl({
        pageProtocol: window.location.protocol,
        host: window.location.host,
        project,
        world,
        token: getDeviceToken(),
      });
      const ws = new WebSocket(url);
      socket = ws;
      ws.onmessage = (ev) => {
        if (closed || socket !== ws) return;
        onMessage(String(ev.data));
      };
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onclose = () => {
        if (socket === ws) socket = null;
        if (closed) return;
        worldStore.getState().setConnection("reconnecting");
        const wait = backoff(attempt);
        attempt += 1;
        retry = setTimeout(connect, wait);
      };
    };

    hud.setConnection(
      hud.connection === "live" ? "reconnecting" : "connecting"
    );
    connect();

    return () => {
      closed = true;
      sentNonces.clear();
      if (retry) clearTimeout(retry);
      if (noticeTimer) clearTimeout(noticeTimer);
      clearAttach();
      // StrictMode mounts, cleans up, and mounts again. Closing here
      // leaves one socket for this key.
      socket?.close();
      socket = null;
    };
  }, [socketKey]);
}
