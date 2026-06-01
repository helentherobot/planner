import type { Task } from './types.js'

export interface ProgressEvent {
  brief: string
  completedTasks: Task[]
  totalTasks: number
  currentTask: Task | null
  isComplete: boolean
}

export interface Observer<THandle = unknown> {
  start(event: ProgressEvent): Promise<THandle>
  update(handle: THandle, event: ProgressEvent): Promise<void>
  complete(handle: THandle, event: ProgressEvent): Promise<void>
}
