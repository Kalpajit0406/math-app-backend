/**
 * Centralized Enums and Constants for MathsWithSD Ecosystem
 */

const AccountType = {
  NORMAL: 'NORMAL',
  TRIAL: 'TRIAL',
  JOINT: 'JOINT',
  PREMIUM: 'PREMIUM',
  ADMIN: 'ADMIN'
};

const AccountStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  BLACKLISTED: 'BLACKLISTED',
  SUSPENDED: 'SUSPENDED'
};

const PermissionFlags = {
  CAN_ACCESS_EXAMS: 'canAccessExams',
  CAN_ACCESS_TEACHER_EXAMS: 'canAccessTeacherExams',
  CAN_GENERATE_PRACTICE: 'canGeneratePractice',
  CAN_RECEIVE_NOTIFICATIONS: 'canReceiveNotifications',
  CAN_VIEW_PREMIUM_ANALYTICS: 'canViewPremiumAnalytics',
  CAN_ACCESS_LEADERBOARD: 'canAccessLeaderboard',
  CAN_JOIN_JOINT_ENTRANCE: 'canJoinJointEntrance'
};

const ExamStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  COMPLETED: 'COMPLETED'
};

const OCRStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed'
};

const ExtractionState = {
  RAW: 'RAW',
  PARSED: 'PARSED',
  VALIDATED: 'VALIDATED'
};

const VerificationState = {
  UNVERIFIED: 'UNVERIFIED',
  VERIFIED: 'VERIFIED',
  FLAGGED: 'FLAGGED'
};

const AntiCheatSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  CRITICAL: 'critical'
};

module.exports = {
  AccountType,
  AccountStatus,
  PermissionFlags,
  ExamStatus,
  OCRStatus,
  ExtractionState,
  VerificationState,
  AntiCheatSeverity
};
