import type { Config } from './types.js'
import type { Store } from './store.js'
import type { Observer } from './observer.js'
import type { Tools } from './tools.js'
import type { QualityControl } from './checks.js'

export interface Adapters {
  tools: Tools
  store: Store
  observer: Observer
  config: Config
  controls: QualityControl[]
}
