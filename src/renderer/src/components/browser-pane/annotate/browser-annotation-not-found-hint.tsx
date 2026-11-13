import { LocateOff } from 'lucide-react'
import { translate } from '@/i18n/i18n'

/** Marks a note whose element was not found again in the current document. */
export function BrowserAnnotationNotFoundHint(): React.JSX.Element {
  return (
    <span
      className="flex items-center gap-0.5"
      title={translate(
        'auto.components.browserPane.annotate.notFoundOnPage',
        'Element not found on this page; the note still sends'
      )}
    >
      <LocateOff className="size-3" />
      {translate('auto.components.browserPane.annotate.notFound', 'not found')}
    </span>
  )
}
