/**
 * Exit codes for cron compatibility
 */
export class ExitCodes {
  static SUCCESS = 0;           // Orchestration completed
  static FAILURE = 1;           // Fatal error
  static AWAITING_APPROVAL = 2; // Waiting for user approval
  static IN_PROGRESS = 3;       // Still executing, check back later
}
