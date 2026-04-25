import { EventPayload, EventType } from './catalog'

type EventHandler<T extends EventType> = (payload: EventPayload<T>) => void | Promise<void>

type HandlerRegistry = {
  [K in EventType]?: Set<EventHandler<K>>
}

class EventBus {
  private handlers: HandlerRegistry = {}

  public on<T extends EventType>(type: T, handler: EventHandler<T>): void {
    if (!this.handlers[type]) {
      this.handlers[type] = new Set<EventHandler<T>>() as HandlerRegistry[T]
    }

    this.handlers[type]?.add(handler as EventHandler<T>)
  }

  public async emit<T extends EventType>(type: T, payload: EventPayload<T>): Promise<void> {
    await this.persistEvent(type, payload)

    const handlers = this.handlers[type]
    if (!handlers || handlers.size === 0) {
      return
    }

    await Promise.allSettled(
      Array.from(handlers).map((handler) => handler(payload)),
    )
  }

  private async persistEvent<T extends EventType>(type: T, payload: EventPayload<T>): Promise<void> {
    console.log('persistEvent stub', { type, payload })
  }
}

export const eventBus = new EventBus()
