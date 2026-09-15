export const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in attempt',
  LOGOUT: 'Signed out',
  TOKEN_REFRESHED: 'Session refreshed',
  USER_CREATED: 'User account created',
  USER_UPDATED: 'User account updated',
  USER_ROLE_CHANGED: 'User role changed',
  USER_STATUS_CHANGED: 'User status changed',
  ORG_UNIT_CREATED: 'Organizational unit created',
  ORG_UNIT_UPDATED: 'Organizational unit updated',
  MEMBER_CREATED: 'Member registered',
  MEMBER_UPDATED: 'Member profile updated',
  MEMBER_STATUS_CHANGED: 'Member status changed',
  MEMBER_VERIFIED: 'Member verified',
  MEMBER_QR_REVOKED: 'Member QR code revoked',
  MEMBER_QR_REISSUED: 'Member QR code reissued',
  EVENT_CREATED: 'Event created',
  EVENT_UPDATED: 'Event updated',
  EVENT_STATUS_CHANGED: 'Event status changed',
  ATTENDANCE_RECORDED: 'Attendance recorded',
  ATTENDANCE_DUPLICATE_ATTEMPT: 'Duplicate check-in blocked',
  RESOURCE_CREATED: 'Resource created',
  RESOURCE_RESTOCKED: 'Resource restocked',
  ALLOCATION_CREATED: 'Allocation created',
  RESOURCE_ALLOCATION_REJECTED: 'Allocation rejected (insufficient stock)',
  RESOURCE_TRANSACTION_RECORDED: 'Resource transaction recorded',
  RESOURCE_TRANSACTION_REJECTED: 'Resource transaction rejected',
  DISTRIBUTION_CREATED: 'Distribution created',
  DISTRIBUTION_STATUS_CHANGED: 'Distribution status changed',
  RECEIPT_CONFIRMED: 'Distribution receipt confirmed',
  RECEIPT_REJECTED: 'Distribution receipt rejected',
  RECEIPT_REVERSED: 'Distribution receipt reversed',
  DOCUMENT_UPLOADED: 'Document uploaded',
  DOCUMENT_UPDATED: 'Document updated',
  DOCUMENT_DELETED: 'Document deleted',
  RESTRICTED_DOCUMENT_DOWNLOADED: 'Restricted document downloaded',
};

/** Session/auth housekeeping events — noise in an activity feed, not administrative activity. */
export const SESSION_ACTIONS = new Set(['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'TOKEN_REFRESHED']);

export function humanizeAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll('_', ' ').toLowerCase();
}
