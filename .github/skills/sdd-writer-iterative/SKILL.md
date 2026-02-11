# SDD Writer (Iterative)

## Purpose

Generate comprehensive Software Design Documents (SDDs) through a systematic, iterative review process with exactly 2 loops of 20 critique points each.

## When to Use

- Designing a new Cooper feature that spans multiple subsystems
- Architecture changes affecting main process, preload, or renderer
- New SDK integration patterns or major UI overhauls

## When NOT to Use

- Small bug fixes or single-component changes
- Documentation updates

## SDD Structure (15 Required Sections)

1. Executive Summary
2. Problem Statement
3. Goals / Non-Goals
4. Functional Requirements
5. Non-Functional Requirements
6. Assumptions & Constraints
7. Proposed Solution (architecture overview, components, data flow, APIs, tech choices)
8. Security / Privacy / Compliance
9. Observability & Operations
10. Rollout / Migration Plan
11. Testing Strategy
12. Risks & Mitigations
13. Open Questions
14. Appendix
15. Iteration History

**REQUIRED**: At least one Mermaid diagram (architecture, sequence, or data flow).

## Iterative Review Process

### Loop Structure (2 loops total)

For each loop:

1. **Generate 20 critique points** — Review as a principal engineer
2. **Make Accept/Reject decisions** — With reasoning for each
3. **Apply ONLY accepted changes** — Rejected items don't modify the SDD
4. **Document the loop** — Full critique + decisions + changes in Iteration History

### Accept Criteria

- Improves clarity, completeness, or accuracy
- Addresses genuine gaps or risks
- Aligns with Cooper's architecture patterns

### Reject Criteria

- Out of scope for this design
- Insufficient evidence
- Conflicts with stated requirements
- Premature optimization

## File Output

**Location**: `docs/design/<YYYY-MM-DD>-<short-title>.md`

**Example**: `docs/design/2026-02-10-mcp-server-management.md`

## Cooper-Specific Context

Before generating the SDD, ground in Cooper's architecture:

1. Check `docs/` for prior design documents
2. Review the Electron three-process model (main/preload/renderer)
3. Consult `src/main/` for existing patterns
4. Check `src/renderer/types/` for existing interfaces
5. Review `.github/copilot-instructions.md` for conventions

## Hard Rules

1. ✅ Exactly 2 loops, 20 critique points per loop
2. ✅ All 15 sections required
3. ✅ At least one Mermaid diagram
4. ✅ Save to `docs/design/` with date prefix
5. ✅ No invented facts — unknowns go in "Open Questions"
6. ✅ Generate GitHub summary with iteration statistics

## Success Criteria

- SDD v3 (final) has all 15 sections
- 2 loops completed and documented (40 total critiques)
- Each critique has Accept/Reject with reason
- File saved to correct location
- GitHub summary generated

## Related Skills

- [planning-and-scoping](../planning-and-scoping/) — Decompose design task
- [security-review](../security-review/) — If SDD involves auth/IPC
- [context-engineering](../context-engineering/) — Build full context first
