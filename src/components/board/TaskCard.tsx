import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckCircle2, GripVertical, Play } from 'lucide-react'
import { Badge } from '@/components/ui/misc'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'

export function TaskCardBody({
  task,
  pomos,
  onOpen,
  onStart,
  dragging,
  handleProps,
}: {
  task: Task
  pomos: number
  onOpen?: () => void
  onStart?: () => void
  dragging?: boolean
  handleProps?: React.HTMLAttributes<HTMLElement>
}) {
  const overEstimate = task.estimatePomos !== undefined && pomos > task.estimatePomos

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-border bg-card p-2.5 shadow-xs transition-colors',
        !dragging && 'hover:border-work/50',
        task.completedAt && 'opacity-60',
        dragging && 'rotate-1 shadow-xl',
      )}
    >
      <div className="flex items-start gap-1.5">
        <span
          {...handleProps}
          className={cn(
            'mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 transition-colors',
            'hover:text-muted-foreground active:cursor-grabbing',
            !handleProps && 'invisible',
          )}
          aria-label="Drag card"
        >
          <GripVertical className="size-3.5" />
        </span>

        <button
          onClick={onOpen}
          disabled={!onOpen}
          className="min-w-0 flex-1 text-left text-sm leading-snug"
        >
          <span className={cn('block break-words', task.completedAt && 'line-through')}>
            {task.title}
          </span>
        </button>

        {onStart && !task.completedAt && (
          <button
            onClick={onStart}
            className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-work hover:text-work-foreground focus-visible:opacity-100 group-hover:opacity-100"
            title="Start a pomodoro on this card"
            aria-label={`Start a pomodoro on ${task.title}`}
          >
            <Play className="size-3.5 fill-current" />
          </button>
        )}
      </div>

      {(task.tags.length > 0 || pomos > 0 || task.estimatePomos || task.completedAt) && (
        <div className="mt-2 flex flex-wrap items-center gap-1 pl-6">
          {task.tags.map((tag) => (
            <Badge key={tag} variant="muted">
              {tag}
            </Badge>
          ))}
          {(pomos > 0 || task.estimatePomos !== undefined) && (
            <span
              className={cn(
                'text-[11px] tabular text-muted-foreground',
                overEstimate && 'text-work',
              )}
              title={`${pomos} pomodoro${pomos === 1 ? '' : 's'} logged`}
            >
              🍅 {pomos}
              {task.estimatePomos !== undefined ? `/${task.estimatePomos}` : ''}
            </span>
          )}
          {task.completedAt && <CheckCircle2 className="size-3.5 text-short" />}
        </div>
      )}
    </div>
  )
}

export function SortableTaskCard(props: {
  task: Task
  pomos: number
  onOpen: () => void
  onStart: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
    data: { type: 'task', columnId: props.task.columnId },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <TaskCardBody
        {...props}
        handleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLElement>}
      />
    </div>
  )
}
