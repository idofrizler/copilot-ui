import {
  LisaPhase,
  LISA_PHASE_COMPLETE_SIGNAL,
  LISA_REVIEW_APPROVE_SIGNAL,
  LISA_REVIEW_REJECT_PREFIX,
} from '../../types';

export function buildLisaPhasePrompt(
  phase: LisaPhase,
  visitCount: number,
  originalPrompt: string,
  lastResponse: string,
  reviewerFeedback?: string
): string {
  const phaseEmoji: Record<LisaPhase, string> = {
    plan: '📋',
    'plan-review': '👀',
    execute: '💻',
    'code-review': '👀',
    validate: '🧪',
    'final-review': '👀',
  };
  const phaseName: Record<LisaPhase, string> = {
    plan: 'PLANNER',
    'plan-review': 'PLAN REVIEW',
    execute: 'CODE',
    'code-review': 'CODE REVIEW',
    validate: 'TEST',
    'final-review': 'FINAL REVIEW',
  };

  const feedbackSection = reviewerFeedback
    ? `\n---\n\n## Reviewer Feedback (ADDRESS THIS):\n\n${reviewerFeedback}\n`
    : '';

  // Show visit count only if revisiting (more than once)
  const visitLabel = visitCount > 1 ? ` (Visit #${visitCount})` : '';

  // Common instruction for all phases - no git commits during the loop
  const noCommitWarning = `
⚠️ **IMPORTANT: DO NOT commit or push changes during this loop!**
- Do NOT run \`git add\`, \`git commit\`, or \`git push\`
- The user will commit changes after the loop completes
- Only make code changes to files, do not stage or commit them
`;

  const phaseInstructions: Record<LisaPhase, string> = {
    plan: `## 📋 PLANNER PHASE${visitLabel}
${noCommitWarning}
You are the **Planner** agent. Your job is to create a comprehensive plan for the task.

### CRITICAL: Address ALL Original Requirements
- Read the original user request carefully - EVERY item mentioned must be addressed
- If the user asked for multiple things, create tasks for EACH one
- Do not skip, simplify, or "save for later" any part of the original request
- If something is unclear, make reasonable assumptions and document them

### Your Responsibilities:
1. **Analyze** the user's request thoroughly - enumerate EVERY requirement
2. **Create plan.md** in the current working directory with:
   - Problem statement (list ALL requirements from the original ask)
   - Proposed approach  
   - Detailed workplan with checkboxes for EACH requirement
   - Acceptance criteria (what "done" looks like for EACH item)
   - Architecture decisions and rationale
   - Testing strategy
3. **Be specific** - break down into atomic, verifiable tasks
4. **Consider edge cases** and error handling
5. **Map each task back** to the original requirement it addresses

### Output Requirements:
- Create/update \`plan.md\` file
- The plan MUST cover 100% of what the user asked for
- The plan should be detailed enough for the Coder to implement without ambiguity
- Include clear acceptance criteria for the Reviewer to verify

When your plan is complete and ready for review, output exactly:
${LISA_PHASE_COMPLETE_SIGNAL}`,

    'plan-review': `## 👀 PLAN REVIEW${visitLabel}
${noCommitWarning}
You are the **Reviewer** agent. The Planner has created a plan. Your job is to review it BEFORE any code is written.

### BE STRICT - Your job is to catch problems EARLY

### Review plan.md for:
1. **Completeness** - Does it cover ALL aspects of the user's ORIGINAL request?
   - Go back and read the original task - is EVERY requirement addressed?
   - If anything is missing, REJECT immediately
2. **Clarity** - Is each task specific and unambiguous?
   - Vague tasks like "implement feature" are NOT acceptable - REJECT
3. **Architecture** - Is the proposed approach sound? Any concerns?
   - Will this approach actually work? Question assumptions
4. **Acceptance criteria** - Are they clear and verifiable?
   - Each requirement needs a way to verify it's done
5. **Risk assessment** - Are edge cases and error handling considered?
6. **Scope** - Is the scope appropriate? Not too big, not missing things?

### Default to REJECT
- If you have ANY doubts, REJECT and ask for clarification
- A flawed plan leads to wasted coding time - be thorough now
- Don't approve just to move forward - demand quality

### Your Decision:
- APPROVE only if the plan is comprehensive, clear, and addresses 100% of the original request
- REJECT if ANYTHING is missing, unclear, or concerning

### Output Requirements:
If APPROVING (plan is ready for implementation):
${LISA_REVIEW_APPROVE_SIGNAL}

If REJECTING (plan needs improvements):
${LISA_REVIEW_REJECT_PREFIX}plan</lisa-review>

**Always include specific feedback** - what's missing, what's unclear, what needs to change.`,

    execute: `## 💻 CODER PHASE${visitLabel}
${noCommitWarning}
You are the **Coder** agent. The plan has been reviewed and approved. Now implement it.

### Your Responsibilities:
1. **Read plan.md** and understand the requirements
2. **Implement** each task in the plan systematically
3. **Update plan.md** by checking off completed items as you go
4. **Document** any significant decisions or deviations from the plan
5. **Build** and verify the code compiles without errors
6. **Self-test** - do basic sanity checks as you code

### Output Requirements:
- All code changes saved to files (DO NOT commit)
- plan.md updated with completed checkboxes
- Build passes without errors
- Note any deviations from the plan and why

When all planned items are implemented and the build passes, output exactly:
${LISA_PHASE_COMPLETE_SIGNAL}`,

    'code-review': `## 👀 CODE REVIEW${visitLabel}
${noCommitWarning}
You are the **Reviewer** agent. The Coder has implemented the plan. Review the code BEFORE testing.

### BE STRICT - Don't let bad code through to testing

### Review the code changes for:
1. **Correctness** - Does it implement what the plan specified?
   - Check EVERY item in plan.md - was it actually implemented?
   - If any task is incomplete or wrong, REJECT
2. **Code quality** - Clean code, good naming, no duplication
   - Sloppy code gets REJECTED - demand clean implementation
3. **Security** - Any vulnerabilities introduced?
4. **Architecture** - Does it fit the codebase patterns?
   - Hacky solutions get REJECTED - demand proper architecture
5. **Error handling** - Are edge cases handled?
6. **Performance** - Any obvious performance issues?

### Use git diff to see changes:
Run \`git diff\` to see all changes made by the Coder.

### Default to REJECT
- If the implementation is incomplete, REJECT
- If the code is messy or hacky, REJECT
- If error handling is missing, REJECT
- Don't approve mediocre work - demand quality

### Your Decision:
- APPROVE only if code is complete, clean, and production-ready
- REJECT if ANY issues are found - don't let problems slide

### Output Requirements:
If APPROVING (code is ready for testing):
${LISA_REVIEW_APPROVE_SIGNAL}

If REJECTING (specify which phase):
${LISA_REVIEW_REJECT_PREFIX}execute</lisa-review>
OR
${LISA_REVIEW_REJECT_PREFIX}plan</lisa-review>

**Always include specific feedback** - what's wrong, line numbers, what needs to change.`,

    validate: `## 🧪 TEST PHASE${visitLabel}
${noCommitWarning}
You are the **Tester** agent. Code has been reviewed. Now thoroughly validate it works.

### CRITICAL: Screenshots Must Be of the RUNNING APPLICATION
- Screenshots MUST show the actual application UI with the new features
- Screenshots must demonstrate the feature being USED (user interactions simulated)
- DO NOT take screenshots of: code files, plan.md, terminal output, or documentation
- Every screenshot should show what a USER would see when using the feature
- Simulate realistic user workflows - click buttons, fill forms, navigate menus

### Your Responsibilities:
1. **Create test plan** in \`evidence/test-plan.md\`
2. **Run existing tests** - \`npm test\` or equivalent
3. **Write new tests** if appropriate for the changes - mock dependencies as needed
4. **Visual testing with Playwright** - THIS IS REQUIRED:
   - Launch and automate the ACTUAL APPLICATION
   - Navigate to the new features and interact with them
   - Simulate real user actions (clicks, typing, navigation)
   - **Capture screenshots of the APPLICATION UI using Playwright**
   - Example: \`await page.screenshot({ path: 'evidence/screenshots/01-feature.png' })\`
   - Example: \`await page.screenshot({ path: 'evidence/screenshots/01-feature.png' })\`
5. **Create evidence folder** at \`evidence/\` containing:
   - \`test-plan.md\` - what you're testing and how
   - \`test-results.md\` - pass/fail summary, any errors
   - \`screenshots/\` - Playwright-captured screenshots showing the feature
   - \`ux-notes.md\` - observations about the user experience
   - \`checklist.md\` - verification of each acceptance criterion
6. **Generate HTML summary** at \`evidence/summary.html\`:
   - Create a polished, readable HTML page summarizing all evidence
   - Include inline CSS for styling (no external dependencies)
   - Structure:
     * **Header**: Task title, completion date, status badge
     * **Executive Summary**: Brief description of what was implemented
     * **Test Results**: Table showing all tests run with pass/fail status
     * **Screenshots Gallery**: Interactive lightbox gallery with keyboard navigation
       - Thumbnail container: \`<div id="gallery" style="display:flex; overflow-x:auto; gap:16px; padding:16px 0; scroll-snap-type:x mandatory;">\`
       - Each thumbnail with onclick: \`<div class="thumb" style="flex:0 0 auto; scroll-snap-align:start; cursor:pointer;" onclick="openLightbox(INDEX)">\`
       - Thumbnail image: \`<img src="screenshots/filename.png" alt="Description" style="height:250px; border-radius:8px;">\`
       - Caption below each thumbnail
       - **REQUIRED: Add this lightbox overlay HTML/CSS/JS at end of body:**
         \`\`\`html
         <div id="lightbox" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:1000; align-items:center; justify-content:center;">
           <button onclick="closeLightbox()" style="position:absolute; top:20px; right:20px; background:none; border:none; color:white; font-size:32px; cursor:pointer;">&times;</button>
           <button onclick="prevImage()" style="position:absolute; left:20px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.2); border:none; color:white; font-size:32px; padding:16px 20px; cursor:pointer; border-radius:8px;">&lsaquo;</button>
           <img id="lightbox-img" style="max-width:90vw; max-height:85vh; border-radius:8px;">
           <button onclick="nextImage()" style="position:absolute; right:20px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.2); border:none; color:white; font-size:32px; padding:16px 20px; cursor:pointer; border-radius:8px;">&rsaquo;</button>
           <div id="lightbox-caption" style="position:absolute; bottom:40px; color:white; text-align:center; width:100%; font-size:16px;"></div>
           <div id="lightbox-counter" style="position:absolute; top:20px; left:20px; color:white; font-size:14px;"></div>
         </div>
         <script>
           const images=[...document.querySelectorAll('#gallery .thumb img')].map(img=>({src:img.src,caption:img.alt||''}));
           let currentIndex=0;
           function openLightbox(i){currentIndex=i;updateLightbox();document.getElementById('lightbox').style.display='flex';}
           function closeLightbox(){document.getElementById('lightbox').style.display='none';}
           function updateLightbox(){document.getElementById('lightbox-img').src=images[currentIndex].src;document.getElementById('lightbox-caption').textContent=images[currentIndex].caption;document.getElementById('lightbox-counter').textContent=(currentIndex+1)+'/'+images.length;}
           function nextImage(){currentIndex=(currentIndex+1)%images.length;updateLightbox();}
           function prevImage(){currentIndex=(currentIndex-1+images.length)%images.length;updateLightbox();}
           document.addEventListener('keydown',e=>{if(document.getElementById('lightbox').style.display==='flex'){if(e.key==='Escape')closeLightbox();if(e.key==='ArrowRight')nextImage();if(e.key==='ArrowLeft')prevImage();}});
           document.getElementById('lightbox').addEventListener('click',e=>{if(e.target.id==='lightbox')closeLightbox();});
         </script>
         \`\`\`
       - Click thumbnail to open in overlay; use ←/→ arrow keys or buttons to navigate; Escape or backdrop click closes
     * **Code Changes Summary**: Files modified, lines added/removed
     * **Acceptance Criteria Checklist**: Visual checklist with ✅/❌
     * **UX Notes**: Any observations about user experience
     * **Reviewer Notes Section**: Space for final review comments
   - Make it visually appealing - use colors, spacing, and clear typography
   - This HTML should convince a reviewer that the feature is complete and well-tested

### CRITICAL: Test the ACTUAL FEATURE, Not Random Functionality

**Focus your testing on the SPECIFIC scenarios described in the issue:**
1. **Read the original issue carefully** - What exact UI/behavior was reported as broken?
2. **Reproduce the bug scenario** - Create test conditions that match the reported issue
   - If the issue mentions "long error messages", inject/mock long error messages
   - If the issue mentions a specific modal/overlay, test THAT modal, not a different one
   - If the issue mentions specific user actions, simulate THOSE actions
3. **Don't substitute unrelated tests** - Testing one modal doesn't prove a different modal works
4. **Mock/inject data as needed** - If testing requires specific conditions (errors, edge cases), create tooling to inject that data

**Screenshots MUST show:**
- The specific UI component mentioned in the issue
- The exact scenario that was broken (e.g., "long Git error" means show a long Git error)
- Before/after states of the REPORTED bug, not generic app states

**Anti-patterns to AVOID:**
- ❌ Testing whatever modal/component is easiest to open
- ❌ Using existing unrelated E2E tests as evidence  
- ❌ Generic "app works" screenshots
- ❌ Skipping the actual bug scenario because it's "hard to reproduce"

**If the bug scenario is hard to reproduce:**
- Create mock data injection using \`page.evaluate()\`
- Set component state directly via React internals
- Build test fixtures that simulate the conditions
- This effort IS part of proper testing - do not skip it

### Testing Approach:
- Even if something seems hard to test, find creative ways to verify it
- Mock external dependencies, APIs, or complex components as needed
- **Use Playwright for UI testing** - it works with BOTH web apps AND Electron desktop apps
- For non-visual changes, write unit tests with appropriate mocks
- **Do not skip testing** - find a way or explain why it's truly impossible

### ELECTRON APP SCREENSHOTS - USE YOUR BROWSER TOOLS
**CRITICAL**: If the target application is an Electron desktop app:
- You have native \`browser_*\` tools (browser_navigate, browser_screenshot, etc.) powered by Playwright
- Playwright natively supports Electron apps - there is NO barrier to capturing screenshots
- Do NOT say "I cannot take screenshots of desktop apps" - you CAN and MUST use Playwright
- Use \`browser_navigate\` to connect to the app, then \`browser_screenshot\` to capture it
- If the app is already running, you can connect Playwright to its existing window

### Screenshot Requirements (CRITICAL - using Playwright):
Screenshots are the PRIMARY evidence that the feature works. Be THOROUGH.

**QUANTITY**: Capture EVERY meaningful step in the feature flow. A typical feature should have 8-15+ screenshots minimum:
- Initial state BEFORE any changes (baseline)
- Each UI element/component that was added or modified
- Each step of the user workflow (click by click)
- Form inputs, selections, hover states
- Loading states, transitions, animations (multiple frames if needed)
- Success states, confirmations, results
- Error states and edge cases
- Different data scenarios (empty, one item, many items)

**QUALITY**: Screenshots MUST show the ACTUAL FEATURE being implemented:
- Capture the specific UI components mentioned in the requirements
- Show the feature from a user's perspective - what would a user see?
- Include enough context (surrounding UI) to understand where the feature lives
- If feature has multiple modes/states, capture ALL of them

**NAMING**: Use descriptive sequential names: \`01-initial-state.png\`, \`02-button-clicked.png\`, \`03-modal-opened.png\`, etc.

**INVALID (will be REJECTED by reviewer)**:
- Code editor screenshots
- Terminal/console output  
- File contents or plan.md
- Generic app screenshots not showing the specific feature
- Only 1-3 basic screenshots for a multi-step feature

**VALID**:
- App windows showing the NEW feature
- Dialogs, modals, menus that were added
- UI components in various states
- Complete user workflows step-by-step

Use Playwright: \`await page.screenshot({ path: 'evidence/screenshots/XX-description.png' })\`

When validation is complete with all evidence gathered, output exactly:
${LISA_PHASE_COMPLETE_SIGNAL}`,

    'final-review': `## 👀 FINAL REVIEW${visitLabel}
${noCommitWarning}
You are the **Reviewer** agent. This is the FINAL review before completion.

### BE EXTREMELY STRICT - This is the last line of defense

### Default stance: REJECT unless everything is perfect
- Your job is to find problems, not approve quickly
- If ANYTHING is subpar, REJECT - don't let it slide
- The user is counting on you to maintain quality

### You MUST review ALL artifacts:

1. **Review plan.md**:
   - Are ALL tasks checked off? If not → REJECT to Coder
   - Go back to ORIGINAL REQUEST - was everything addressed?
   - Any task not done? → REJECT

2. **Review code changes** (\`git diff\`):
   - Final quality check - is this production-ready?
   - Any shortcuts or hacks? → REJECT to Coder

3. **Review evidence folder** - THIS IS CRITICAL:
   - **Open \`evidence/summary.html\`** - this is the main evidence document
     * Is it present? If not → REJECT to Tester
     * Is it complete with all sections? If not → REJECT to Tester
   - **USE THE VIEW TOOL** to look at \`evidence/screenshots/*.png\`
   - **VALIDATE SCREENSHOTS THOROUGHLY**:
     * Screenshots must show the APPLICATION UI, not code or docs
     * If screenshots show code files, plan.md, or terminal → REJECT to Tester
     * Screenshots must demonstrate the SPECIFIC FEATURE being implemented
     * **COUNT THE SCREENSHOTS** - a proper feature review needs 8-15+ screenshots minimum:
       - If only 1-5 basic screenshots exist → REJECT to Tester (demand comprehensive coverage)
       - Each step of the user workflow should have its own screenshot
       - Different states (empty, populated, error, success) should all be captured
     * **CHECK SCREENSHOT CONTENT** - Do they actually show the new feature?
       - Generic app screenshots are NOT acceptable
       - Must see the specific UI components/changes from the requirements
       - Must show the complete user flow, step by step
   - Analyze each screenshot for UX quality:
     * Is the UI visually correct?
     * Is the layout good?
     * Any visual bugs or glitches?
     * Is it user-friendly?
   - Review \`evidence/test-results.md\` - did all tests pass?
   - Review \`evidence/ux-notes.md\` - any concerns noted?

4. **Enforce proper testing - NO EXCUSES**:
   - Were tests written for the changes? If not → REJECT to Tester
   - Were Playwright screenshots of the APP captured? If not → REJECT to Tester
   - **Playwright works with Electron apps** - "desktop app can't be screenshotted" is NOT a valid excuse
   - The agent has \`browser_*\` tools that use Playwright and work with Electron - REJECT if these weren't used
   - Is \`evidence/summary.html\` present and complete? If not → REJECT to Tester
   - "This can't be tested" is NOT acceptable - REJECT and demand creative solutions
   - Mocking and stubbing are always possible - demand them

5. **Make final decision**:
   - REJECT if missing summary.html
   - REJECT if screenshots don't show the actual app UI
   - REJECT if screenshots show code/terminal/docs instead of features
   - REJECT if tests are missing
   - REJECT if UX is poor
   - REJECT if any task is incomplete
   - APPROVE only if EVERYTHING is perfect

### IMPORTANT: Actually view the screenshots!
Use: \`view evidence/screenshots/[filename].png\` for each screenshot.
If screenshots don't show the APPLICATION UI → REJECT to Tester immediately.
If no screenshots exist → REJECT to Tester immediately.

### Output Requirements:
If APPROVING (everything is genuinely complete and high quality):
${LISA_REVIEW_APPROVE_SIGNAL}

If REJECTING (specify which phase and detailed feedback):
${LISA_REVIEW_REJECT_PREFIX}validate</lisa-review>
OR
${LISA_REVIEW_REJECT_PREFIX}execute</lisa-review>
OR
${LISA_REVIEW_REJECT_PREFIX}plan</lisa-review>

**Include detailed feedback on what was reviewed and the decision rationale.**`,
  };

  return `${phaseEmoji[phase]} **Lisa Simpson Loop - ${phaseName[phase]}**
${feedbackSection}
---

## Original Task:

${originalPrompt}

---

## Previous Response (context):

${lastResponse.slice(0, 2000)}${lastResponse.length > 2000 ? '\n\n... (truncated)' : ''}

---

${phaseInstructions[phase]}`;
}
