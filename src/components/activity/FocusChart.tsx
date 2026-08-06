import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { formatDuration } from '@/lib/format'

export interface ChartPoint {
  label: string
  /** Focused seconds in this bucket. */
  value: number
  /** Highlighted bars mark "today" inside a week/month range. */
  highlight?: boolean
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value?: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const seconds = payload[0]?.value ?? 0
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-lg">
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground"> · {seconds > 0 ? formatDuration(seconds) : 'nothing'}</span>
    </div>
  )
}

export function FocusChart({
  data,
  labelInterval = 0,
  title,
}: {
  data: ChartPoint[]
  labelInterval?: number
  title: string
}) {
  const empty = data.every((d) => d.value === 0)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        {empty && <span className="text-xs text-muted-foreground">No focus logged yet</span>}
      </div>
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
            <XAxis
              dataKey="label"
              interval={labelInterval}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              height={20}
            />
            <Tooltip
              cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
              content={<ChartTooltip />}
              animationDuration={120}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false} minPointSize={0}>
              {data.map((point, i) => (
                <Cell
                  key={i}
                  fill={point.value === 0 ? 'var(--border)' : 'var(--work)'}
                  fillOpacity={point.highlight ? 1 : point.value === 0 ? 0.6 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
