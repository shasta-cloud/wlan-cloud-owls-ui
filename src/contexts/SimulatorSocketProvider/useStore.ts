import create from 'zustand';
import { SocketEventCallback, WebSocketNotification } from './utils';
import { axiosOwls } from 'constants/axiosInstances';

export type WebSocketMessage =
  | {
      type: 'NOTIFICATION';
      data: WebSocketNotification;
      timestamp: Date;
    }
  | { type: 'UNKNOWN'; data: Record<string, unknown>; timestamp: Date };

export type SimulationOperationStatus = {
  rx: number;
  tx: number;
  msgsRx: number;
  msgsTx: number;
  timestamp: Date;
  operationId: string;
  rawData: {
    rx: number;
    tx: number;
    msgsRx: number;
    msgsTx: number;
  };
};

export type SimulatorStoreState = {
  lastMessage?: WebSocketMessage;
  allMessages: WebSocketMessage[];
  addMessage: (message: WebSocketNotification) => void;
  eventListeners: SocketEventCallback[];
  addEventListeners: (callback: SocketEventCallback[]) => void;
  webSocket?: WebSocket;
  send: (str: string) => void;
  startWebSocket: (token: string, tries?: number) => void;
  isWebSocketOpen: boolean;
  setWebSocketOpen: (isOpen: boolean) => void;
  currentSimulationData: SimulationOperationStatus[];
};

export const useSimulatorStore = create<SimulatorStoreState>((set, get) => ({
  allMessages: [] as WebSocketMessage[],
  addMessage: (msg: WebSocketNotification) => {
    const obj: WebSocketMessage = {
      type: 'NOTIFICATION',
      data: msg,
      timestamp: new Date(),
    };
    const prevContent = get().currentSimulationData;
    const newSimStatusMsg: SimulationOperationStatus = {
      rx: 0,
      tx: 0,
      msgsRx: 0,
      msgsTx: 0,
      timestamp: obj.timestamp,
      operationId: msg.content.id,
      rawData: {
        rx: msg.content.rx,
        tx: msg.content.tx,
        msgsRx: msg.content.msgsRx,
        msgsTx: msg.content.msgsTx,
      },
    };
    const prevEntry = prevContent[Math.max(0, prevContent.length - 1)];
    if (prevEntry?.operationId === newSimStatusMsg.operationId) {
      newSimStatusMsg.rx = Math.max(0, newSimStatusMsg.rawData.rx - prevEntry.rawData.rx);
      newSimStatusMsg.tx = Math.max(0, newSimStatusMsg.rawData.tx - prevEntry.rawData.tx);
      newSimStatusMsg.msgsRx = Math.max(0, newSimStatusMsg.rawData.msgsRx - prevEntry.rawData.msgsRx);
      newSimStatusMsg.msgsTx = Math.max(0, newSimStatusMsg.rawData.msgsTx - prevEntry.rawData.msgsTx);
    }
    const newCurrSimStatus =
      prevEntry?.operationId === newSimStatusMsg.operationId ? [...prevContent, newSimStatusMsg] : [newSimStatusMsg];

    const eventsToFire = get().eventListeners.filter(({ type }) => type === msg.type);

    if (eventsToFire.length > 0) {
      for (const event of eventsToFire) {
        event.callback();
      }

      return set((state) => ({
        allMessages:
          state.allMessages.length <= 1000 ? [...state.allMessages, obj] : [...state.allMessages.slice(1), obj],
        lastMessage: obj,
        eventListeners: get().eventListeners.filter(({ id }) => !eventsToFire.find(({ id: findId }) => findId === id)),
        currentSimulationData: newCurrSimStatus.length <= 60 * 10 ? newCurrSimStatus : newCurrSimStatus.slice(1),
      }));
    }

    return set((state) => ({
      allMessages:
        state.allMessages.length <= 1000 ? [...state.allMessages, obj] : [...state.allMessages.slice(1), obj],
      lastMessage: obj,
      currentSimulationData: newCurrSimStatus.length <= 60 * 10 ? newCurrSimStatus : newCurrSimStatus.slice(1),
    }));
  },
  eventListeners: [] as SocketEventCallback[],
  addEventListeners: (events: SocketEventCallback[]) =>
    set((state) => ({ eventListeners: [...state.eventListeners, ...events] })),
  isWebSocketOpen: false,
  setWebSocketOpen: (isOpen: boolean) => set({ isWebSocketOpen: isOpen }),
  send: (str: string) => {
    const ws = get().webSocket;
    if (ws) ws.send(str);
  },
  startWebSocket: (token: string, tries = 0) => {
    const newTries = tries + 1;
    if (tries <= 10) {
      set({
        webSocket: new WebSocket(
          `${
            axiosOwls?.defaults?.baseURL ? axiosOwls.defaults.baseURL.replace('https', 'wss').replace('http', 'ws') : ''
          }/ws`,
        ),
      });
      const ws = get().webSocket;
      if (ws) {
        ws.onopen = () => {
          set({ isWebSocketOpen: true });
          ws.send(`token:${token}`);
        };
        ws.onclose = () => {
          set({ isWebSocketOpen: false });
          setTimeout(() => get().startWebSocket(token, newTries), 3000);
        };
      }
    }
  },
  currentSimulationData: [] as SimulationOperationStatus[],
}));
