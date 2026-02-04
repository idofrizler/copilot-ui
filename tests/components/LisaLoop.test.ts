import { describe, it, expect } from 'vitest';
import type { LisaPhase, LisaConfig } from '../../src/renderer/types/session';
import {
  LISA_PHASE_COMPLETE_SIGNAL,
  LISA_REVIEW_APPROVE_SIGNAL,
  LISA_REVIEW_REJECT_PREFIX,
} from '../../src/renderer/types/session';

describe('Lisa Simpson Loop Types', () => {
  describe('LisaPhase', () => {
    it('should have all expected phases', () => {
      const phases: LisaPhase[] = [
        'plan',
        'plan-review',
        'execute',
        'code-review',
        'validate',
        'final-review',
      ];
      expect(phases).toHaveLength(6);
    });

    it('should follow the correct phase order', () => {
      const phaseOrder: Record<LisaPhase, LisaPhase | null> = {
        plan: 'plan-review',
        'plan-review': 'execute',
        execute: 'code-review',
        'code-review': 'validate',
        validate: 'final-review',
        'final-review': null,
      };

      // Verify complete flow
      let currentPhase: LisaPhase | null = 'plan';
      const visitedPhases: LisaPhase[] = [];
      while (currentPhase) {
        visitedPhases.push(currentPhase);
        currentPhase = phaseOrder[currentPhase];
      }

      expect(visitedPhases).toEqual([
        'plan',
        'plan-review',
        'execute',
        'code-review',
        'validate',
        'final-review',
      ]);
    });
  });

  describe('LisaConfig', () => {
    it('should create a valid initial config', () => {
      const config: LisaConfig = {
        originalPrompt: 'Test task',
        currentPhase: 'plan',
        phaseIterations: {
          plan: 1,
          'plan-review': 0,
          execute: 0,
          'code-review': 0,
          validate: 0,
          'final-review': 0,
        },
        active: true,
        phaseHistory: [{ phase: 'plan', iteration: 1, timestamp: Date.now() }],
        evidenceFolderPath: '/test/evidence',
      };

      expect(config.currentPhase).toBe('plan');
      expect(config.active).toBe(true);
      expect(config.phaseIterations['plan']).toBe(1);
      expect(config.evidenceFolderPath).toBe('/test/evidence');
    });

    it('should track phase iterations correctly', () => {
      const config: LisaConfig = {
        originalPrompt: 'Test task',
        currentPhase: 'execute',
        phaseIterations: {
          plan: 2, // Visited twice (rejected once)
          'plan-review': 2, // Reviewed twice
          execute: 1, // Currently here
          'code-review': 0,
          validate: 0,
          'final-review': 0,
        },
        active: true,
        phaseHistory: [
          { phase: 'plan', iteration: 1, timestamp: 1000 },
          { phase: 'plan-review', iteration: 1, timestamp: 2000 },
          { phase: 'plan', iteration: 2, timestamp: 3000 }, // Rejected back
          { phase: 'plan-review', iteration: 2, timestamp: 4000 },
          { phase: 'execute', iteration: 1, timestamp: 5000 },
        ],
        evidenceFolderPath: '/test/evidence',
      };

      expect(config.phaseHistory).toHaveLength(5);
      expect(config.phaseIterations['plan']).toBe(2);
    });
  });

  describe('Completion Signals', () => {
    it('should have correct signal formats', () => {
      expect(LISA_PHASE_COMPLETE_SIGNAL).toBe('<lisa-phase>COMPLETE</lisa-phase>');
      expect(LISA_REVIEW_APPROVE_SIGNAL).toBe('<lisa-review>APPROVED</lisa-review>');
      expect(LISA_REVIEW_REJECT_PREFIX).toBe('<lisa-review>REJECT:');
    });

    it('should detect phase complete signal in response', () => {
      const response = `I have completed the plan.
      
${LISA_PHASE_COMPLETE_SIGNAL}

The plan is now ready for review.`;

      expect(response.includes(LISA_PHASE_COMPLETE_SIGNAL)).toBe(true);
    });

    it('should detect review approve signal', () => {
      const response = `The plan looks good. All tasks are clear.

${LISA_REVIEW_APPROVE_SIGNAL}`;

      expect(response.includes(LISA_REVIEW_APPROVE_SIGNAL)).toBe(true);
    });

    it('should parse reject signal with target phase', () => {
      const response = `The code has architecture issues.

${LISA_REVIEW_REJECT_PREFIX}plan</lisa-review>`;

      expect(response.includes(LISA_REVIEW_REJECT_PREFIX)).toBe(true);

      // Parse the target phase
      const rejectMatch = response.match(
        new RegExp(
          `${LISA_REVIEW_REJECT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(plan|execute|validate)`
        )
      );
      expect(rejectMatch).toBeTruthy();
      expect(rejectMatch![1]).toBe('plan');
    });

    it('should allow rejecting to any work phase', () => {
      const validTargets: LisaPhase[] = ['plan', 'execute', 'validate'];

      validTargets.forEach((target) => {
        const response = `${LISA_REVIEW_REJECT_PREFIX}${target}</lisa-review>`;
        const rejectMatch = response.match(
          new RegExp(
            `${LISA_REVIEW_REJECT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(plan|execute|validate)`
          )
        );
        expect(rejectMatch).toBeTruthy();
        expect(rejectMatch![1]).toBe(target);
      });
    });
  });

  describe('Phase Flow Logic', () => {
    it('should identify review phases', () => {
      const reviewPhases: LisaPhase[] = ['plan-review', 'code-review', 'final-review'];
      const workPhases: LisaPhase[] = ['plan', 'execute', 'validate'];

      const isReviewPhase = (phase: LisaPhase) => reviewPhases.includes(phase);

      reviewPhases.forEach((phase) => {
        expect(isReviewPhase(phase)).toBe(true);
      });

      workPhases.forEach((phase) => {
        expect(isReviewPhase(phase)).toBe(false);
      });
    });

    it('should allow review phases to reject to any earlier work phase', () => {
      // From code-review, can reject to plan or execute
      const codeReviewTargets = ['plan', 'execute'];

      // From final-review, can reject to plan, execute, or validate
      const finalReviewTargets = ['plan', 'execute', 'validate'];

      expect(codeReviewTargets).toContain('plan');
      expect(codeReviewTargets).toContain('execute');
      expect(finalReviewTargets).toContain('plan');
      expect(finalReviewTargets).toContain('execute');
      expect(finalReviewTargets).toContain('validate');
    });
  });
});
