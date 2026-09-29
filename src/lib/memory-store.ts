// ─── Memory Store: In-memory store with provider interface ───────────────────
// Implements four memory layers with retain/recall/reflect pattern.
// Works entirely offline with seed data — no API keys needed.

import type {
  Customer,
  Ticket,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  AffectiveMemory,
  WinningFix,
  FailedSolution,
  BriefingCard,
  FrustrationLevel,
  AnalyticsData,
} from './types';

import {
  customers as seedCustomers,
  tickets as seedTickets,
  episodicMemories as seedEpisodic,
  semanticMemories as seedSemantic,
  proceduralMemories as seedProcedural,
  affectiveMemories as seedAffective,
  winningFixes as seedWinning,
  failedSolutions as seedFailed,
  analyticsData as seedAnalytics,
} from './seed-data';

// ─── Store State ─────────────────────────────────────────────────────────────

class MemoryStore {
  customers: Customer[] = [...seedCustomers];
  tickets: Ticket[] = [...seedTickets];
  episodic: EpisodicMemory[] = [...seedEpisodic];
  semantic: SemanticMemory[] = [...seedSemantic];
  procedural: ProceduralMemory[] = [...seedProcedural];
  affective: AffectiveMemory[] = [...seedAffective];
  winningFixes: WinningFix[] = [...seedWinning];
  failedSolutions: FailedSolution[] = [...seedFailed];
  analytics: AnalyticsData = { ...seedAnalytics };

  // ── Customer Operations ──────────────────────────────────────────────────

  getCustomer(id: string): Customer | undefined {
    return this.customers.find(c => c.id === id);
  }

  getAllCustomers(): Customer[] {
    return this.customers;
  }

  // ── Ticket Operations ────────────────────────────────────────────────────

  getTicket(id: string): Ticket | undefined {
    return this.tickets.find(t => t.id === id);
  }

  getTicketsForCustomer(customerId: string): Ticket[] {
    return this.tickets
      .filter(t => t.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getAllTickets(): Ticket[] {
    return this.tickets.sort((a, b) => {
      // Sort by: open first, then by priority, then by SLA status
      const statusOrder = { open: 0, in_progress: 1, escalated: 2, resolved: 3 };
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const slaOrder = { breached: 0, warning: 1, within: 2 };

      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;

      const slaDiff = slaOrder[a.slaStatus] - slaOrder[b.slaStatus];
      if (slaDiff !== 0) return slaDiff;

      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  getOpenTickets(): Ticket[] {
    return this.getAllTickets().filter(t => t.status !== 'resolved');
  }

  // ── Memory Recall ────────────────────────────────────────────────────────

  recallEpisodic(customerId: string): EpisodicMemory[] {
    return this.episodic.filter(m => m.customerId === customerId);
  }

  recallSemantic(customerId: string): SemanticMemory[] {
    return this.semantic.filter(m => m.customerId === customerId);
  }

  recallProcedural(customerId: string): ProceduralMemory[] {
    return this.procedural.filter(m => m.customerId === customerId);
  }

  recallAffective(customerId: string): AffectiveMemory | undefined {
    return this.affective.find(m => m.customerId === customerId);
  }

  // ── Failed Solutions Ledger ──────────────────────────────────────────────
  // CRITICAL: Never re-suggest a failed step for the same customer+category

  getFailedSolutions(customerId: string, category?: string): FailedSolution[] {
    return this.failedSolutions.filter(
      f => f.customerId === customerId && (!category || f.category === category)
    );
  }

  isFailedStep(customerId: string, category: string, step: string): boolean {
    return this.failedSolutions.some(
      f =>
        f.customerId === customerId &&
        f.category === category &&
        f.step.toLowerCase() === step.toLowerCase()
    );
  }

  // ── Winning Playbook ─────────────────────────────────────────────────────

  getWinningFixes(category?: string): WinningFix[] {
    if (category) {
      return this.winningFixes.filter(w => w.category === category);
    }
    return this.winningFixes;
  }

  // ── Briefing Card Generation ─────────────────────────────────────────────

  generateBriefingCard(customerId: string): BriefingCard | null {
    const customer = this.getCustomer(customerId);
    if (!customer) return null;

    const customerTickets = this.getTicketsForCustomer(customerId);
    const episodic = this.recallEpisodic(customerId);
    const semantic = this.recallSemantic(customerId);
    const procedural = this.recallProcedural(customerId);
    const affective = this.recallAffective(customerId);

    const failedSteps = procedural.filter(p => p.outcome === 'failure');
    const successSteps = procedural.filter(p => p.outcome === 'success');

    const frustrationLevel: FrustrationLevel = affective?.frustrationLevel ?? (0 as FrustrationLevel);
    const sentiment = affective?.sentiment ?? 'neutral';

    // Build "who they are"
    const planInfo = semantic.find(s => s.key === 'Current Plan')?.value ?? customer.plan;
    const techLevel = customer.communicationStyle.technicalLevel;
    const whoTheyAre = `${customer.name} — ${planInfo} plan, ${techLevel} user since ${customer.joinedDate}. ${customerTickets.length} total tickets.`;

    // What happened
    const whatHappened = episodic.slice(-5).map(e => `${e.event} (${e.ticketId})`);

    // What failed
    const whatFailed = failedSteps.map(f => `${f.step} — ${f.context ?? 'no details'} (${f.ticketId})`);

    // What worked
    const whatWorked = successSteps.map(s => `${s.step} (${s.ticketId})`);

    // Mood
    const moodDescriptions: Record<string, string> = {
      positive: 'Generally positive and patient',
      neutral: 'Neutral',
      negative: 'Frustrated and losing patience',
      angry: 'Very frustrated — high churn risk',
    };
    const currentMood = moodDescriptions[sentiment] ?? 'Unknown';

    // How to talk
    const style = customer.communicationStyle;
    const howToTalk = `Use ${style.preferredTone} tone. ${
      style.technicalLevel === 'non-technical'
        ? 'Avoid jargon, use simple step-by-step instructions.'
        : style.technicalLevel === 'power-user'
          ? 'Be direct and technical. Provide code examples when relevant.'
          : 'Balance technical detail with clarity.'
    } Preferred channel: ${style.preferredChannel}.`;

    // Next move
    const openTickets = customerTickets.filter(t => t.status === 'open');
    let nextMove = 'No open tickets.';
    if (openTickets.length > 0) {
      const latest = openTickets[0];
      if (frustrationLevel >= 7) {
        nextMove = `URGENT: Address ${latest.id} immediately. Customer is at frustration level ${frustrationLevel}/10. Consider escalation and a direct apology.`;
      } else if (failedSteps.length > 0) {
        nextMove = `Address ${latest.id}. Avoid re-suggesting: ${failedSteps.map(f => f.step).join(', ')}. Try winning playbook alternatives.`;
      } else {
        nextMove = `Address ${latest.id} (${latest.subject}).`;
      }
    }

    return {
      customerId,
      customerName: customer.name,
      plan: planInfo,
      whoTheyAre,
      whatHappened,
      whatFailed,
      whatWorked,
      currentMood,
      frustrationLevel,
      howToTalk,
      nextMove,
    };
  }

  // ── Memory Retain (write new memory) ─────────────────────────────────────

  retainEpisodic(memory: Omit<EpisodicMemory, 'id'>): EpisodicMemory {
    const newMemory = { ...memory, id: `ep-${Date.now()}` };
    this.episodic.push(newMemory);
    return newMemory;
  }

  retainSemantic(memory: Omit<SemanticMemory, 'id'>): SemanticMemory {
    // Update existing if same customer + key
    const existing = this.semantic.find(
      s => s.customerId === memory.customerId && s.key === memory.key
    );
    if (existing) {
      Object.assign(existing, memory, { lastUpdated: new Date().toISOString() });
      return existing;
    }
    const newMemory = { ...memory, id: `sem-${Date.now()}` };
    this.semantic.push(newMemory);
    return newMemory;
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  getAnalytics(): AnalyticsData {
    return this.analytics;
  }

  // ── Memory Stats ─────────────────────────────────────────────────────────

  getMemoryStats(customerId: string) {
    return {
      episodic: this.recallEpisodic(customerId).length,
      semantic: this.recallSemantic(customerId).length,
      procedural: this.recallProcedural(customerId).length,
      affective: this.recallAffective(customerId) ? 1 : 0,
      failedSolutions: this.getFailedSolutions(customerId).length,
      total:
        this.recallEpisodic(customerId).length +
        this.recallSemantic(customerId).length +
        this.recallProcedural(customerId).length +
        (this.recallAffective(customerId) ? 1 : 0),
    };
  }
}

// Singleton
export const memoryStore = new MemoryStore();
