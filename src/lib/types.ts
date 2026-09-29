// ─── Core Types for Remi ─────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'escalated';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type SLAStatus = 'within' | 'warning' | 'breached';
export type AgentMode = 'assist' | 'autopilot';
export type FrustrationLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface Customer {
  id: string;
  name: string;
  email: string;
  plan: 'Starter' | 'Pro' | 'Business' | 'Enterprise';
  avatar: string; // initials-based
  environment: EnvironmentInfo;
  communicationStyle: CommunicationStyle;
  joinedDate: string;
  totalTickets: number;
  lifetimeValue: number;
}

export interface EnvironmentInfo {
  os: string;
  browser: string;
  appVersion: string;
  device: string;
  timezone: string;
  language: string;
}

export interface CommunicationStyle {
  preferredChannel: 'chat' | 'email' | 'phone';
  technicalLevel: 'non-technical' | 'intermediate' | 'technical' | 'power-user';
  preferredTone: 'casual' | 'professional' | 'concise' | 'detailed';
  language: string;
}

export interface Ticket {
  id: string;
  customerId: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  slaStatus: SLAStatus;
  slaDeadline: string;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
  tags: string[];
  assignedTo?: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface TicketMessage {
  id: string;
  role: 'customer' | 'agent' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

// ─── Memory Layers ───────────────────────────────────────────────────────────

export interface EpisodicMemory {
  id: string;
  customerId: string;
  ticketId: string;
  event: string;
  outcome: string;
  timestamp: string;
  emotionalContext?: string;
}

export interface SemanticMemory {
  id: string;
  customerId: string;
  category: 'environment' | 'plan' | 'product' | 'preference' | 'fact';
  key: string;
  value: string;
  confidence: number;
  lastUpdated: string;
}

export interface ProceduralMemory {
  id: string;
  customerId: string;
  category: string;
  step: string;
  outcome: 'success' | 'failure';
  ticketId: string;
  timestamp: string;
  context?: string;
}

export interface AffectiveMemory {
  id: string;
  customerId: string;
  frustrationLevel: FrustrationLevel;
  frustrationTrajectory: FrustrationPoint[];
  communicationPreferences: CommunicationStyle;
  sentiment: 'positive' | 'neutral' | 'negative' | 'angry';
  lastUpdated: string;
}

export interface FrustrationPoint {
  timestamp: string;
  level: FrustrationLevel;
  trigger: string;
  ticketId: string;
}

// ─── Winning Playbook & Failed Solutions ─────────────────────────────────────

export interface WinningFix {
  id: string;
  category: string;
  step: string;
  successCount: number;
  lastUsed: string;
  context: string;
  ticketIds: string[];
}

export interface FailedSolution {
  id: string;
  customerId: string;
  category: string;
  step: string;
  failureReason: string;
  ticketId: string;
  timestamp: string;
}

// ─── Agent Loop ──────────────────────────────────────────────────────────────

export type AgentStepType =
  | 'identify'
  | 'recall'
  | 'reason'
  | 'act'
  | 'respond'
  | 'reflect';

export type AgentToolName =
  | 'lookup_history'
  | 'get_environment'
  | 'check_failed_steps'
  | 'get_winning_playbook'
  | 'propose_fix'
  | 'draft_reply'
  | 'escalate_to_human'
  | 'update_memory';

export interface AgentStep {
  type: AgentStepType;
  description: string;
  tool?: AgentToolName;
  toolInput?: string;
  toolOutput?: string;
  timestamp: string;
  durationMs: number;
}

export interface AgentTrace {
  steps: AgentStep[];
  memoryItemsCreated: number;
  memoryItemsUpdated: number;
  totalDurationMs: number;
}

// ─── Briefing Card ───────────────────────────────────────────────────────────

export interface BriefingCard {
  customerId: string;
  customerName: string;
  plan: string;
  whoTheyAre: string;
  whatHappened: string[];
  whatFailed: string[];
  whatWorked: string[];
  currentMood: string;
  frustrationLevel: FrustrationLevel;
  howToTalk: string;
  nextMove: string;
}

// ─── Reply Copilot ───────────────────────────────────────────────────────────

export interface ReplyDraft {
  content: string;
  tone: 'empathetic' | 'professional' | 'casual' | 'technical';
  memoryCitations: string[];
  isMemorySafe: boolean;
  toneSliders: {
    formality: number;    // 0-100
    empathy: number;      // 0-100
    technicality: number; // 0-100
  };
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface AnalyticsData {
  totalTickets: number;
  resolvedTickets: number;
  avgResolutionTime: number; // minutes
  avgFrustrationReduction: number;
  memoryHits: number;
  repeatQuestionsPrevented: number;
  timeSavedMinutes: number;
  customerSatisfaction: number; // 0-100
  ticketsOverTime: { date: string; count: number }[];
  frustrationOverTime: { date: string; avg: number }[];
  topCategories: { category: string; count: number }[];
  memoryUtilization: { layer: string; count: number; hitRate: number }[];
}

// ─── Demo Mode ───────────────────────────────────────────────────────────────

export interface DemoStep {
  id: string;
  action: 'navigate' | 'type' | 'click' | 'wait' | 'highlight' | 'narrate';
  target?: string;
  value?: string;
  narration: string;
  durationMs: number;
}

export interface DemoScenario {
  name: string;
  description: string;
  customer: string;
  steps: DemoStep[];
  totalDurationMs: number;
}
