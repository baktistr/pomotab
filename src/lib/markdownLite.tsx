import { Fragment, type ReactNode } from 'react'

/**
 * A deliberately tiny Markdown subset for card notes: headings, bullets,
 * `**bold**`, `*italic*` and `` `code` ``.
 *
 * It builds React elements rather than HTML strings, so there is no
 * `dangerouslySetInnerHTML` anywhere and no escaping to get wrong.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((chunk, i) => {
    const key = `${keyPrefix}-${i}`
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return (
        <strong key={key} className="font-semibold">
          {chunk.slice(2, -2)}
        </strong>
      )
    }
    if (chunk.startsWith('*') && chunk.endsWith('*')) {
      return (
        <em key={key} className="italic">
          {chunk.slice(1, -1)}
        </em>
      )
    }
    if (chunk.startsWith('`') && chunk.endsWith('`')) {
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {chunk.slice(1, -1)}
        </code>
      )
    }
    return <Fragment key={key}>{chunk}</Fragment>
  })
}

export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let bullets: string[] = []

  const flushBullets = () => {
    if (bullets.length === 0) return
    const items = bullets
    bullets = []
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-0.5 pl-5">
        {items.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    )
  }

  lines.forEach((line, index) => {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      bullets.push(bullet[1])
      return
    }
    flushBullets()
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push(
        <p key={`h-${index}`} className="font-semibold">
          {renderInline(heading[2], `h-${index}`)}
        </p>,
      )
      return
    }
    if (line.trim() === '') {
      blocks.push(<div key={`sp-${index}`} className="h-2" />)
      return
    }
    blocks.push(<p key={`p-${index}`}>{renderInline(line, `p-${index}`)}</p>)
  })
  flushBullets()

  return <div className="space-y-1 text-sm leading-relaxed">{blocks}</div>
}
