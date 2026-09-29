// ─── Agent Mock Provider ─────────────────────────────────────────────────────
// Deterministic offline mock that emits the same tool-call trace every time.
// No network needed — demo path runs entirely client-side.

import type { AgentStep, AgentTrace, ReplyDraft } from './types';
import { memoryStore } from './memory-store';

// ─── Agent Tool Implementations ──────────────────────────────────────────────

function lookupHistory(customerId: string): string {
  const episodes = memoryStore.recallEpisodic(customerId);
  if (episodes.length === 0) return 'No previous history found.';
  return episodes.map(e => `• ${e.event} → ${e.outcome} (${e.ticketId})`).join('\n');
}

function getEnvironment(customerId: string): string {
  const semantic = memoryStore.recallSemantic(customerId);
  const envItems = semantic.filter(s => s.category === 'environment');
  if (envItems.length === 0) return 'No environment info stored.';
  return envItems.map(e => `${e.key}: ${e.value}`).join(', ');
}

function checkFailedSteps(customerId: string, category: string): string {
  const failed = memoryStore.getFailedSolutions(customerId, category);
  if (failed.length === 0) return 'No previously failed solutions found.';
  return failed.map(f => `✗ "${f.step}" — failed: ${f.failureReason} (${f.ticketId})`).join('\n');
}

function getWinningPlaybook(category: string): string {
  const wins = memoryStore.getWinningFixes(category);
  if (wins.length === 0) return 'No winning fixes found for this category.';
  return wins.map(w => `✓ "${w.step}" — ${w.successCount} success(es), context: ${w.context}`).join('\n');
}

function proposeFix(customerId: string, category: string): string {
  const failed = memoryStore.getFailedSolutions(customerId, category);
  const failedSteps = new Set(failed.map(f => f.step.toLowerCase()));
  const wins = memoryStore.getWinningFixes(category);

  // Filter out previously failed steps
  const safeFixes = wins.filter(w => !failedSteps.has(w.step.toLowerCase()));

  if (safeFixes.length === 0) {
    return 'All known fixes have been tried and failed for this customer. Recommend escalation to engineering team with full history.';
  }

  return safeFixes.map(w => `Recommended: "${w.step}" (${w.successCount} prior successes)`).join('\n');
}

function getAffectiveContext(customerId: string): string {
  const affective = memoryStore.recallAffective(customerId);
  if (!affective) return 'No affective data available.';

  const trajectory = affective.frustrationTrajectory
    .slice(-3)
    .map(p => `  ${p.timestamp.split('T')[0]}: Level ${p.level} — ${p.trigger}`)
    .join('\n');

  return `Current frustration: ${affective.frustrationLevel}/10\nSentiment: ${affective.sentiment}\nRecent trajectory:\n${trajectory}`;
}

// ─── Generate Deterministic Reply ────────────────────────────────────────────

function generateReply(customerId: string, ticketId: string, message: string): ReplyDraft {
  const customer = memoryStore.getCustomer(customerId);
  const ticket = memoryStore.getTicket(ticketId);
  const briefing = memoryStore.generateBriefingCard(customerId);
  const affective = memoryStore.recallAffective(customerId);
  const failed = memoryStore.getFailedSolutions(customerId);
  const semantic = memoryStore.recallSemantic(customerId);

  const frustration = affective?.frustrationLevel ?? 0;
  const citations: string[] = [];
  const knownInfo: string[] = [];

  // Collect known information to avoid asking
  semantic.forEach(s => {
    knownInfo.push(`${s.key}: ${s.value}`);
  });

  // Build contextual reply
  let reply = '';

  // High frustration = empathetic opening
  if (frustration >= 7) {
    reply += `I completely understand your frustration, ${customer?.name?.split(' ')[0]}. `;
    reply += `This is the ${getOrdinal(failed.filter(f => f.category === ticket?.category).length + 1)} time you've faced this issue, and I want you to know I've reviewed your entire history. `;
    citations.push(`Frustration level: ${frustration}/10`);
  } else if (frustration >= 4) {
    reply += `Thank you for your patience, ${customer?.name?.split(' ')[0]}. `;
    reply += `I can see from your history that this is a recurring concern. `;
  } else {
    reply += `Hi ${customer?.name?.split(' ')[0]}! `;
  }

  // Reference failed fixes
  if (failed.length > 0 && ticket) {
    const relevantFailed = failed.filter(f => f.category === ticket.category);
    if (relevantFailed.length > 0) {
      reply += `\n\nI can see the following have already been tried and did not work:\n`;
      relevantFailed.forEach(f => {
        reply += `• ~~${f.step}~~ (tried in ${f.ticketId})\n`;
        citations.push(f.ticketId);
      });
    }
  }

  // Suggest from winning playbook, excluding failed steps
  if (ticket) {
    const category = ticket.category;
    const failedSteps = new Set(failed.filter(f => f.category === category).map(f => f.step.toLowerCase()));
    const wins = memoryStore.getWinningFixes(category);
    const safeFixes = wins.filter(w => !failedSteps.has(w.step.toLowerCase()));

    if (safeFixes.length > 0) {
      reply += `\nBased on what has worked before, I recommend:\n`;
      safeFixes.forEach(w => {
        reply += `✓ **${w.step}** (worked ${w.successCount} time${w.successCount > 1 ? 's' : ''} previously)\n`;
        w.ticketIds.forEach(tid => citations.push(tid));
      });
    } else if (failed.length > 0) {
      reply += `\nAll standard solutions have been attempted for your case. I'm escalating this directly to our engineering team with your complete history — including all ${failed.length} previously attempted fixes. You won't need to repeat anything.\n`;
      reply += `\nI've also flagged your account for priority monitoring to prevent this from happening again.\n`;
    }
  }

  // Reference known environment
  if (customer) {
    const env = customer.environment;
    reply += `\n*Based on your setup: ${env.os}, ${env.browser}, app v${env.appVersion}.*\n`;
    citations.push('Environment data');
  }

  // Tone
  const tone = customer?.communicationStyle.preferredTone ?? 'professional';
  const toneMap = {
    concise: { formality: 60, empathy: 50, technicality: 40 },
    professional: { formality: 75, empathy: 60, technicality: 50 },
    detailed: { formality: 70, empathy: 50, technicality: 80 },
    casual: { formality: 30, empathy: 70, technicality: 30 },
  };

  return {
    content: reply.trim(),
    tone: frustration >= 6 ? 'empathetic' : (tone === 'detailed' ? 'technical' : tone === 'casual' ? 'casual' : 'professional'),
    memoryCitations: [...new Set(citations)],
    isMemorySafe: true, // Mock always passes
    toneSliders: toneMap[tone] ?? toneMap.professional,
  };
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Run Agent Loop ──────────────────────────────────────────────────────────

export interface AgentLoopResult {
  trace: AgentTrace;
  reply: ReplyDraft;
  briefing: ReturnType<typeof memoryStore.generateBriefingCard>;
}

export async function runAgentLoop(
  customerId: string,
  ticketId: string,
  message: string
): Promise<AgentLoopResult> {
  const steps: AgentStep[] = [];
  const startTime = Date.now();

  // Simulated delays for realistic feel
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Step 1: Identify
  steps.push({
    type: 'identify',
    description: `Identifying customer ${customerId} and their context`,
    timestamp: new Date().toISOString(),
    durationMs: 120,
  });
  await delay(120);

  // Step 2: Recall — lookup_history
  const historyResult = lookupHistory(customerId);
  steps.push({
    type: 'recall',
    description: 'Retrieving customer history from episodic memory',
    tool: 'lookup_history',
    toolInput: customerId,
    toolOutput: historyResult,
    timestamp: new Date().toISOString(),
    durationMs: 200,
  });
  await delay(200);

  // Step 3: Recall — get_environment
  const envResult = getEnvironment(customerId);
  steps.push({
    type: 'recall',
    description: 'Loading customer environment from semantic memory',
    tool: 'get_environment',
    toolInput: customerId,
    toolOutput: envResult,
    timestamp: new Date().toISOString(),
    durationMs: 150,
  });
  await delay(150);

  // Step 4: Recall — check_failed_steps
  const ticket = memoryStore.getTicket(ticketId);
  const category = ticket?.category ?? 'general';
  const failedResult = checkFailedSteps(customerId, category);
  steps.push({
    type: 'recall',
    description: 'Checking Failed-Solutions Ledger',
    tool: 'check_failed_steps',
    toolInput: `${customerId}, ${category}`,
    toolOutput: failedResult,
    timestamp: new Date().toISOString(),
    durationMs: 100,
  });
  await delay(100);

  // Step 5: Recall — get_winning_playbook
  const playbookResult = getWinningPlaybook(category);
  steps.push({
    type: 'recall',
    description: 'Loading Winning Playbook for category',
    tool: 'get_winning_playbook',
    toolInput: category,
    toolOutput: playbookResult,
    timestamp: new Date().toISOString(),
    durationMs: 100,
  });
  await delay(100);

  // Step 6: Reason
  const affectiveResult = getAffectiveContext(customerId);
  steps.push({
    type: 'reason',
    description: `Analyzing frustration level and communication style. ${affectiveResult.split('\n')[0]}`,
    timestamp: new Date().toISOString(),
    durationMs: 300,
  });
  await delay(300);

  // Step 7: Act — propose_fix
  const fixResult = proposeFix(customerId, category);
  steps.push({
    type: 'act',
    description: 'Proposing fix from playbook (excluding failed solutions)',
    tool: 'propose_fix',
    toolInput: `${customerId}, ${category}`,
    toolOutput: fixResult,
    timestamp: new Date().toISOString(),
    durationMs: 200,
  });
  await delay(200);

  // Step 8: Act — draft_reply
  const reply = generateReply(customerId, ticketId, message);
  steps.push({
    type: 'act',
    description: 'Drafting memory-safe, style-matched reply',
    tool: 'draft_reply',
    toolInput: 'Using frustration level, failed solutions, and winning playbook',
    toolOutput: `Reply drafted with ${reply.memoryCitations.length} memory citations. Memory-safe: ${reply.isMemorySafe}`,
    timestamp: new Date().toISOString(),
    durationMs: 400,
  });
  await delay(400);

  // Step 9: Respond
  steps.push({
    type: 'respond',
    description: 'Delivering response to agent',
    timestamp: new Date().toISOString(),
    durationMs: 50,
  });

  // Step 10: Reflect — update_memory
  steps.push({
    type: 'reflect',
    description: 'Writing back to memory layers',
    tool: 'update_memory',
    toolInput: 'Updating episodic + semantic memories',
    toolOutput: 'Memory updated: 2 new items (1 episodic, 1 semantic)',
    timestamp: new Date().toISOString(),
    durationMs: 150,
  });
  await delay(150);

  const totalDurationMs = Date.now() - startTime;

  const trace: AgentTrace = {
    steps,
    memoryItemsCreated: 2,
    memoryItemsUpdated: 1,
    totalDurationMs,
  };

  const briefing = memoryStore.generateBriefingCard(customerId);

  return { trace, reply, briefing };
}

// ─── Demo Mode Script ────────────────────────────────────────────────────────

export interface DemoMessage {
  role: 'customer' | 'agent' | 'narrator';
  content: string;
  delay: number; // ms before showing
}

export const demoScript: DemoMessage[] = [
  {
    role: 'narrator',
    content: '🎬 Demo Mode: Meet Priya — a loyal Business customer facing her 4th billing sync issue.',
    delay: 0,
  },
  {
    role: 'narrator',
    content: 'Remi instantly recalls her entire history — 3 failed fixes, 1 that worked, and her rising frustration.',
    delay: 3000,
  },
  {
    role: 'customer',
    content: 'I cannot believe this. My billing is out of sync FOR THE FOURTH TIME. Cache clearing did not work. Re-linking did not work. Your webhook fix did not last. The reconciliation script only worked once. I need a permanent solution or I am switching to a competitor.',
    delay: 5000,
  },
  {
    role: 'narrator',
    content: '🧠 Agent reasoning: Identifying → Recalling history → Checking failed solutions → Loading winning playbook → Drafting memory-safe reply...',
    delay: 8000,
  },
  {
    role: 'agent',
    content: 'I completely understand your frustration, Priya. This is the 4th time you\'ve faced this issue, and I want you to know I\'ve reviewed your entire history.\n\nI can see the following have already been tried and did not work:\n• ~~Clear billing cache and force sync~~ (tried in TKT-4821)\n• ~~Re-link payment method~~ (tried in TKT-4821)\n\nAll standard solutions have been attempted for your case. I\'m escalating this directly to our engineering team with your complete history — including all 3 previously attempted fixes. You won\'t need to repeat anything.\n\nI\'ve also flagged your account for priority monitoring to prevent this from happening again.\n\n*Based on your setup: Windows 11, Chrome 140, app v4.5.2.*',
    delay: 12000,
  },
  {
    role: 'narrator',
    content: '✅ Memory updated: 2 new items. Frustration acknowledged. Failed solutions never re-suggested. No information re-asked.',
    delay: 18000,
  },
  {
    role: 'narrator',
    content: '🎬 Demo complete. Remi remembered everything — so Priya didn\'t have to repeat a thing.',
    delay: 22000,
  },
];
