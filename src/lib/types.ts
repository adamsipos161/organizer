// Riadky zodpovedajú stĺpcom v Supabase (snake_case), aby sa nemuseli prekladať.

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Project {
  id: string
  user_id: string
  name: string
  color: string
  archived: boolean
  sort_order: number
  created_at: string
  note?: string
}

export interface Subtask {
  id: string
  title: string
  done: boolean
  due: string | null
}

export interface Task {
  id: string
  user_id: string
  project_id: string | null
  title: string
  note: string
  due_date: string | null // YYYY-MM-DD
  priority: number // 0 žiadna, 1 nízka, 2 stredná, 3 vysoká
  status: TaskStatus
  subtasks: Subtask[]
  sort_order: number
  created_at: string
  completed_at: string | null
}

export interface Meeting {
  id: string
  user_id: string
  project_id: string | null
  title: string
  starts_at: string // ISO UTC
  ends_at: string
  location: string
  note: string
  created_at: string
}

export interface Settings {
  user_id: string
  default_meeting_minutes: number
}

export interface Data {
  projects: Project[]
  tasks: Task[]
  meetings: Meeting[]
  settings: Settings | null
}

export const emptyData = (): Data => ({ projects: [], tasks: [], meetings: [], settings: null })

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Na spravenie',
  in_progress: 'Rozpracované',
  done: 'Hotovo',
}

export const PRIORITY_LABEL = ['Bez priority', 'Nízka', 'Stredná', 'Vysoká']

export const PALETTE = [
  { hex: '#4F86C6', name: 'Modrá' },
  { hex: '#D9825B', name: 'Oranžová' },
  { hex: '#3E9E8F', name: 'Tyrkysová' },
  { hex: '#8E6CC0', name: 'Fialová' },
  { hex: '#C9A23F', name: 'Zlatá' },
  { hex: '#C2678F', name: 'Ružová' },
  { hex: '#6B8E4E', name: 'Zelená' },
  { hex: '#7A8794', name: 'Sivá' },
]

export type ItemRef = { kind: 'task'; id: string } | { kind: 'meeting'; id: string }
