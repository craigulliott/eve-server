import { EventBus } from "./EventBus";
import { EventTopics } from "./EventBus/EventTopics";
import { v4 as uuidv4 } from 'uuid'
import { Eve } from ".";
import { ModuleName } from "./types/ModuleName";

export abstract class Base<Name extends ModuleName> {
  private readonly eventBus = new EventBus()
  private sequence = 0

  public readonly id = uuidv4()

  public readonly name: Name
  public readonly eve: Eve

  constructor(eve: Eve, name: Name) {
    this.eve = eve
    this.name = name
  }

  // can be overridden in child classes
  public getSummaryData() {
    return {}
  }

  public log(message: string, meta?: any) {
    if (typeof meta === 'undefined') {
      console.log(`${this.name} (${this.id}): ${message}`)
    }
    else {
      console.log(`${this.name} (${this.id}): ${message}`, meta)
    }
  }

  public getSummary() {
    const sequence = this.sequence += 1
    return Object.assign({}, this.getSummaryData(), { id: this.id, type: sequence})
  }

  // a convenience wrapper to subscribe to events
  public on<T extends keyof EventTopics[Name], C extends (e: EventTopics[Name][T]) => void>(topic: T, callback: C) {
    return this.eventBus.on(this.name, topic, callback)
  }

  // a convenience wrapper to unsubscribe to events
  public off<T extends keyof EventTopics[Name], C extends (e: EventTopics[Name][T]) => void>(topic: T, callback: C) {
    return this.eventBus.off(this.name, topic, callback)
  }

  // a convenience wrapper for triggering events
  protected trigger<T extends keyof EventTopics[Name], D extends EventTopics[Name][T]>(topic: T, data?: D) {
    return this.eventBus.trigger(this.name, topic, data)
  }

  public sendToClient() {
    this.eve.messages.sendMessage(this.name, this.getSummary())
  }

}
