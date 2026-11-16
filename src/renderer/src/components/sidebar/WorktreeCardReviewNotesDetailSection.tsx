import React from 'react'
import { MessageSquare } from 'lucide-react'
import {
  WorktreeCardDetailSection,
  WorktreeCardDetailSectionContent
} from './WorktreeCardDetailSection'
import { DetailHeader } from './WorktreeCardMetadataControls'
import { translate } from '@/i18n/i18n'

/** "N unsent review note(s)", shared by the card badge's a11y label and the hover row. */
export function unsentReviewNotesLabel(count: number): string {
  return translate(
    'auto.components.sidebar.WorktreeCardMeta.unsentReviewNotes',
    '{{count}} unsent review notes',
    { count, defaultValue_one: '{{count}} unsent review note' }
  )
}

export function WorktreeCardReviewNotesDetailSection({
  count
}: {
  count: number
}): React.JSX.Element {
  return (
    <WorktreeCardDetailSection>
      <DetailHeader
        icon={<MessageSquare className="size-3 text-muted-foreground" />}
        label={translate(
          'auto.components.sidebar.WorktreeCardMeta.reviewNotesHeader',
          'Review notes'
        )}
      />
      <WorktreeCardDetailSectionContent>
        <div className="text-[11.5px] leading-snug text-foreground">
          {unsentReviewNotesLabel(count)}
        </div>
      </WorktreeCardDetailSectionContent>
    </WorktreeCardDetailSection>
  )
}

/** Review notes ride in the details hover's `detailsAfter` slot, ahead of what the caller puts there. */
export function withReviewNotesDetails(
  count: number,
  detailsAfter: React.ReactNode
): React.ReactNode {
  return count > 0 ? (
    <>
      <WorktreeCardReviewNotesDetailSection count={count} />
      {detailsAfter}
    </>
  ) : (
    detailsAfter
  )
}
