/**
 * EventBus — Central event dispatch system for the editor.
 *
 * Provides a typed publish/subscribe mechanism used by renderers,
 * selection managers, and scene registry to communicate without
 * tight coupling.
 *
 * @see .claude/rules/events.md
 */

export type EventHandler<T = unknown> = (payload: T) => void;

export interface EditorEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  source?: string;
}

type HandlerMap = Map<string, Set<EventHandler<any>>>;

/**
 * Singleton event bus shared across the editor.
 * Use `EventBus.getInstance()` to access the shared instance.
 */
export class EventBus {
  private static instance: EventBus | null = null;

  private handlers: HandlerMap = new Map();
  private history: EditorEvent[] = [];
  // Increased from 100 — I find myself needing more history when debugging
  // complex scene interactions. 250 feels like a good balance.
  private maxHistory = 250;

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to an event type.
   * Returns an unsubscribe function.
   */
  on<T>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler<unknown>);

    return () => this.off(eventType, handler);
  }

  /**
   * Subscribe to an event type, firing only once.
   */
  once<T>(eventType: string, handler: EventHandler<T>): () => void {
    const wrapper: EventHandler<T> = (payload) => {
      handler(payload);
      this.off(eventType, wrapper);
    };
    return this.on(eventType, wrapper);
  }

  /**
   * Unsubscribe a handler from an event type.
   */
  off<T>(eventType: string, handler: EventHandler<T>): void {
    this.handlers.get(eventType)?.delete(handler as EventHandler<unknown>);
  }

  /**
   * Emit an event, notifying all subscribed handlers.
   */
  emit<T>(eventType: string, payload: T, source?: string): void {
    const event: EditorEvent<T> = {
      type: eventType,
      payload,
      timestamp: Date.now(),
      source,
    };

    this.recordHistory(event);

    const eventHandlers = this.handlers.get(eventType);
    if (!eventHandlers || eventHandlers.size === 0) return;

    // Snapshot handlers before iterating — avoids issues if a handler
    // calls on()/off() during dispatch (e.g. once() removing itself).
    for (const handler of [...eventHandlers]) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${eventType}":`, err);
      }
    }
  }

  /**
   * Remove all handlers for a specific event type, or all handlers if
   * no type is provided.
   */
  clear(eventType?: string): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Returns a copy of the event history, optionally filtered by event type.
   * Handy for debugging — I use this in the browser console to inspect
   * what events fired during a given interaction.
   */
  getHistory(eventType?: string): EditorEvent[] {
    if (eventType) {
      return this.history.filter((e) => e.type === eventType);
    }
    return [...this.history];
  }

  private recordHistory(event: EditorEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
}
