import { BACKLOG_NOT_SAVED_CODE } from '../../shared/backlog-types'

/** A save refused before the CLI ran; the RPC passes its code through so the editor can offer a retry. */
export class BacklogNotSavedError extends Error {
  readonly code = BACKLOG_NOT_SAVED_CODE
}

/** The CLI ran, or may have, without confirming: the task may or may not have been written. */
export class BacklogSaveUnconfirmedError extends Error {}
