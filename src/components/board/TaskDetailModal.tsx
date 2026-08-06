import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, Play, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Badge, Label, Separator } from '@/components/ui/misc'
import { db } from '@/lib/db'
import { formatDate, formatDuration, formatTimeOfDay } from '@/lib/format'
import { MarkdownLite } from '@/lib/markdownLite'
import { deleteTask, setTaskComplete, updateTask } from '@/lib/repo'
import { PHASE_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'

export function TaskDetailModal({
  taskId,
  onClose,
}: {
  taskId: string | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const task = useLiveQuery(async () => (taskId ? db.tasks.get(taskId) : undefined), [taskId])
  const sessions = useLiveQuery(
    async () =>
      taskId
        ? (await db.sessions.where('taskId').equals(taskId).toArray()).sort(
            (a, b) => b.startedAt - a.startedAt,
          )
        : [],
    [taskId],
  )

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Seeded once per opening: this is an edit form, so it must not fight the
  // user by resetting their in-flight text every time the row round-trips
  // through Dexie — but reopening the same card must show what is stored now.
  const seededFor = useRef<string | null>(null)
  useEffect(() => {
    seededFor.current = null
  }, [taskId])
  useEffect(() => {
    if (!task || seededFor.current === task.id) return
    seededFor.current = task.id
    setTitle(task.title)
    setNotes(task.notes ?? '')
    setEditingNotes(!task.notes)
  }, [task])

  const pomos = (sessions ?? []).filter((s) => s.type === 'work' && s.completed).length
  const focusedSec = (sessions ?? []).reduce((sum, s) => sum + (s.type === 'work' ? s.durationSec : 0), 0)

  function addTag() {
    if (!task) return
    const tag = tagDraft.trim().replace(/^#/, '')
    if (!tag || task.tags.includes(tag)) {
      setTagDraft('')
      return
    }
    void updateTask(task.id, { tags: [...task.tags, tag] })
    setTagDraft('')
  }

  return (
    <Dialog open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        {!task ? (
          <DialogHeader>
            <DialogTitle>Card not found</DialogTitle>
            <DialogDescription>It may have been deleted in another tab.</DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Card details</DialogTitle>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  const next = title.trim()
                  if (next && next !== task.title) void updateTask(task.id, { title: next })
                  else setTitle(task.title)
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="h-auto border-0 px-0 text-lg font-semibold shadow-none"
                aria-label="Card title"
              />
              <DialogDescription>
                Created {formatDate(task.createdAt)}
                {task.completedAt ? ` · completed ${formatDate(task.completedAt)}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="work"
                onClick={() => {
                  onClose()
                  navigate(`/?task=${task.id}&start=1`)
                }}
                disabled={!!task.completedAt}
              >
                <Play className="fill-current" />
                Start pomodoro
              </Button>
              <Button
                size="sm"
                variant={task.completedAt ? 'secondary' : 'outline'}
                onClick={() => void setTaskComplete(task.id, !task.completedAt)}
              >
                {task.completedAt ? 'Mark not done' : 'Mark done'}
              </Button>
              <span className="tabular text-sm text-muted-foreground">
                🍅 {pomos}
                {task.estimatePomos !== undefined ? `/${task.estimatePomos}` : ''} ·{' '}
                {formatDuration(focusedSec)}
              </span>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Notes</Label>
              {editingNotes ? (
                <Textarea
                  autoFocus
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => {
                    void updateTask(task.id, { notes: notes.trim() || undefined })
                    if (notes.trim()) setEditingNotes(false)
                  }}
                  placeholder="Markdown-lite: **bold**, *italic*, `code`, - bullets"
                  className="min-h-24"
                />
              ) : (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="w-full rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent/50"
                >
                  <MarkdownLite text={notes} />
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="estimate">Estimate (pomodoros)</Label>
                <Input
                  id="estimate"
                  type="number"
                  min={0}
                  value={task.estimatePomos ?? ''}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10)
                    void updateTask(task.id, {
                      estimatePomos: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
                    })
                  }}
                  placeholder="—"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tag">Tags</Label>
                <Input
                  id="tag"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag()
                    }
                  }}
                  onBlur={addTag}
                  placeholder="Add a tag and press Enter"
                />
                {task.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {task.tags.map((tag) => (
                      <Badge key={tag} variant="muted" className="gap-1 pr-1">
                        {tag}
                        <button
                          onClick={() =>
                            void updateTask(task.id, {
                              tags: task.tags.filter((t) => t !== tag),
                            })
                          }
                          className="rounded-full p-0.5 transition-colors hover:bg-background"
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Session history</Label>
              {(sessions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No pomodoros logged against this card yet.
                </p>
              ) : (
                <ul className="scrollbar-thin max-h-40 space-y-1 overflow-y-auto pr-1">
                  {(sessions ?? []).map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="tabular w-28 shrink-0 text-muted-foreground">
                        {formatDate(s.startedAt).replace(/, \d{4}$/, '')} {formatTimeOfDay(s.startedAt)}
                      </span>
                      <span className={cn('tabular w-12 shrink-0', !s.completed && 'text-muted-foreground')}>
                        {formatDuration(s.durationSec)}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {PHASE_LABEL[s.type]}
                        {s.completed ? '' : ' — ended early'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void updateTask(task.id, { archived: !task.archived })}
              >
                {task.archived ? <ArchiveRestore /> : <Archive />}
                {task.archived ? 'Unarchive' : 'Archive'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Delete
              </Button>
            </div>

            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title={`Delete "${task.title}"?`}
              description="The card goes away, but its logged pomodoros stay in Activity."
              confirmLabel="Delete card"
              destructive
              onConfirm={() => {
                void deleteTask(task.id)
                onClose()
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
