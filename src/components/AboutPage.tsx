import { ListCard, ListRow } from './ListCard'

/**
 * A page of written guidance: headings and paragraphs, and nothing clever.
 *
 * The content is plain strings in `src/about/pages.ts`. Nothing here reads the
 * statistics model or any other part of the app, so a page can be rewritten
 * without knowing what else it might affect — which is the point. An earlier
 * version generated half of each page from `StatsView`, and the result was
 * prose nobody could edit without first understanding where it came from.
 *
 * The only markup is `*emphasis*`, because the bucket names read badly without
 * it. Anything more would be a document format, and these are six short pages.
 */

export interface AboutSection {
  title: string
  /** Paragraphs, in order. `*like this*` comes out italic. */
  paragraphs: readonly string[]
  /** An optional way out to somewhere else in the app. */
  link?: { label: string; to: string }
}

export type AboutContent = readonly AboutSection[]

export function AboutPage({
  content,
  intro,
}: {
  content: AboutContent
  /** Sits above the first heading, for a page that wants an opening line. */
  intro?: string
}) {
  return (
    <div className="flex flex-col gap-7 p-4 pb-10">
      {intro && (
        <p className="px-1 text-sm leading-relaxed text-content-muted">
          <Emphasised text={intro} />
        </p>
      )}

      {content.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="px-1 text-base font-semibold">{section.title}</h2>

          <div className="flex flex-col gap-3 px-1 text-sm leading-relaxed text-content-muted">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>
                <Emphasised text={paragraph} />
              </p>
            ))}
          </div>

          {section.link && (
            <div className="pt-1">
              <ListCard>
                <ListRow
                  to={section.link.to}
                  label={section.link.label}
                  chevron
                />
              </ListCard>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

/** `*text*` becomes italic. The one piece of markup these pages have. */
function Emphasised({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*[^*]+\*)/g)
        .map((part, i) =>
          part.length > 2 && part.startsWith('*') && part.endsWith('*') ? (
            <em key={i}>{part.slice(1, -1)}</em>
          ) : (
            part
          ),
        )}
    </>
  )
}
