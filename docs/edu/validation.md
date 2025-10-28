# Education Platform Validation & Testing

This document provides validation steps, testing procedures, and quality assurance checklists for the VS Code Education Platform.

## Table of Contents

1. [Pre-Deployment Validation](#pre-deployment-validation)
2. [Manual Testing Checklist](#manual-testing-checklist)
3. [Automated Testing](#automated-testing)
4. [Performance Benchmarks](#performance-benchmarks)
5. [Security Audit](#security-audit)
6. [Accessibility Testing](#accessibility-testing)
7. [Post-Deployment Validation](#post-deployment-validation)

## Pre-Deployment Validation

### Environment Verification

Run these checks before deploying to any environment:

```bash
# 1. Verify Node.js version
node --version
# Expected: v20.x.x or higher

# 2. Verify npm version
npm --version
# Expected: 10.x.x or higher

# 3. Check all required environment variables
node scripts/check-env.js

# 4. Verify Firebase authentication
firebase login
firebase projects:list

# 5. Verify Google Cloud authentication (for Compiler API)
gcloud auth list
gcloud config get-value project
```

### Build Verification

```bash
# 1. Clean build
npm run clean-edu
npm run build-edu

# 2. Verify build outputs exist
ls -lh dist/edu-platform/web/
ls -lh dist/edu-platform/web/index.html
ls -lh dist/edu-platform/web/assets/

# 3. Check bundle sizes
du -sh dist/edu-platform/web/assets/*.js
# Main bundle should be < 1MB
# Vendor bundles should use code splitting

# 4. Verify source maps (development only)
ls -lh dist/edu-platform/web/**/*.map
```

## Manual Testing Checklist

### Authentication Flow

- [ ] **User Registration**
  - [ ] Email/password registration works
  - [ ] Email verification is sent
  - [ ] Validation errors display correctly
  - [ ] Password requirements enforced

- [ ] **User Login**
  - [ ] Email/password login works
  - [ ] Google OAuth login works
  - [ ] "Remember me" functionality works
  - [ ] Password reset email is sent
  - [ ] Reset password flow works

- [ ] **Session Management**
  - [ ] User stays logged in after refresh
  - [ ] Token refreshes before expiry
  - [ ] Logout clears session
  - [ ] Session expires after timeout

### Notebook Features

- [ ] **Notebook Creation**
  - [ ] Create new notebook
  - [ ] Set notebook title
  - [ ] Set visibility (public/private)
  - [ ] Add collaborators

- [ ] **Cell Operations**
  - [ ] Add code cell
  - [ ] Add markdown cell
  - [ ] Edit cell content
  - [ ] Delete cell
  - [ ] Reorder cells (drag & drop)
  - [ ] Cell formatting toolbar works

- [ ] **Code Execution**
  - [ ] Execute Python code
  - [ ] Execute JavaScript code
  - [ ] Execute Java code
  - [ ] Execute C++ code
  - [ ] See real-time output
  - [ ] See error messages
  - [ ] Execution timeout handled
  - [ ] Cancel execution works

- [ ] **Notebook Persistence**
  - [ ] Auto-save works
  - [ ] Manual save works
  - [ ] Load existing notebook
  - [ ] Version history accessible
  - [ ] Changes sync in real-time

### AI Sidebar

- [ ] **Code Explanation**
  - [ ] Select code and request explanation
  - [ ] Explanation is relevant and accurate
  - [ ] Supports multiple languages
  - [ ] Markdown rendering works

- [ ] **Error Assistance**
  - [ ] Detects runtime errors
  - [ ] Provides fix suggestions
  - [ ] Can apply suggested fixes
  - [ ] Links to documentation

- [ ] **Code Generation**
  - [ ] Natural language to code works
  - [ ] Generated code is valid
  - [ ] Can insert code at cursor
  - [ ] Supports multiple languages

- [ ] **Rate Limiting**
  - [ ] Shows remaining quota
  - [ ] Handles quota exceeded gracefully
  - [ ] Caches common queries

### Assignment System (Instructor)

- [ ] **Create Assignment**
  - [ ] Set title and description
  - [ ] Set due date
  - [ ] Upload starter code
  - [ ] Define test cases
  - [ ] Publish to students

- [ ] **Grade Submissions**
  - [ ] View all submissions
  - [ ] Run code automatically
  - [ ] Provide feedback
  - [ ] Export grades

### Assignment System (Student)

- [ ] **View Assignments**
  - [ ] See all assigned work
  - [ ] Filter by status (pending, submitted, graded)
  - [ ] Sort by due date
  - [ ] See assignment details

- [ ] **Submit Assignment**
  - [ ] Open starter code
  - [ ] Edit and test code
  - [ ] Submit before deadline
  - [ ] View submission status
  - [ ] Resubmit if allowed

### Collaboration

- [ ] **Real-time Editing**
  - [ ] Multiple users can edit simultaneously
  - [ ] See other users' cursors
  - [ ] Changes sync without conflicts
  - [ ] Presence indicators work

- [ ] **Permissions**
  - [ ] Owner has full control
  - [ ] Collaborators can edit
  - [ ] Viewers can only read
  - [ ] Permissions can be changed

### UI/UX

- [ ] **Responsive Design**
  - [ ] Works on desktop (1920x1080)
  - [ ] Works on laptop (1366x768)
  - [ ] Works on tablet (768x1024)
  - [ ] Mobile view is functional

- [ ] **Theme Support**
  - [ ] Light theme works
  - [ ] Dark theme works
  - [ ] High contrast theme works
  - [ ] Theme persists across sessions

- [ ] **Keyboard Navigation**
  - [ ] All features accessible via keyboard
  - [ ] Tab order is logical
  - [ ] Keyboard shortcuts work
  - [ ] Focus indicators visible

### Error Handling

- [ ] **Network Errors**
  - [ ] Offline mode notification
  - [ ] Retry logic works
  - [ ] Queues actions for when online
  - [ ] Graceful degradation

- [ ] **API Errors**
  - [ ] Compiler API errors handled
  - [ ] Firebase errors handled
  - [ ] AI API errors handled
  - [ ] Rate limit errors shown clearly

- [ ] **User Errors**
  - [ ] Form validation messages
  - [ ] Invalid code syntax warnings
  - [ ] File size limit warnings
  - [ ] Permission denied messages

## Automated Testing

### Unit Tests

```bash
# Run all unit tests
npm run test-node

# Run with coverage
npm run test-node -- --coverage

# Expected coverage:
# Lines: > 80%
# Functions: > 75%
# Branches: > 70%
```

### Browser Tests

```bash
# Install Playwright browsers
npm run playwright-install

# Run browser tests
npm run test-browser

# Run in headed mode (for debugging)
npm run test-browser -- --headed
```

### E2E Tests

Create `test/e2e/edu-platform.test.js`:

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Education Platform E2E', () => {
  test('user can register, login, and create notebook', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:8080');
    
    // Register
    await page.click('text=Sign Up');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'Test123456!');
    await page.click('button[type="submit"]');
    
    // Wait for redirect
    await page.waitForURL('**/dashboard');
    
    // Create notebook
    await page.click('text=New Notebook');
    await page.fill('input[name="title"]', 'My Test Notebook');
    await page.click('button:has-text("Create")');
    
    // Verify notebook opened
    await expect(page.locator('h1')).toContainText('My Test Notebook');
    
    // Add code cell
    await page.click('button:has-text("+ Code")');
    await page.fill('.monaco-editor textarea', 'print("Hello, World!")');
    
    // Execute
    await page.click('button[title="Run cell"]');
    
    // Verify output
    await expect(page.locator('.cell-output')).toContainText('Hello, World!');
  });
  
  test('AI sidebar provides code explanation', async ({ page }) => {
    // Assume logged in
    await page.goto('http://localhost:8080/notebook/test-id');
    
    // Select code
    await page.click('.monaco-editor');
    await page.keyboard.type('def factorial(n):');
    await page.keyboard.press('Enter');
    await page.keyboard.type('    return 1 if n <= 1 else n * factorial(n-1)');
    
    // Select all
    await page.keyboard.press('Control+A');
    
    // Open AI sidebar
    await page.click('button[title="AI Assistant"]');
    await page.click('text=Explain Code');
    
    // Wait for response
    await page.waitForSelector('.ai-response', { timeout: 10000 });
    
    // Verify explanation contains key terms
    const explanation = await page.locator('.ai-response').textContent();
    expect(explanation.toLowerCase()).toContain('recursive');
    expect(explanation.toLowerCase()).toContain('factorial');
  });
});
```

Run E2E tests:

```bash
npx playwright test test/e2e/edu-platform.test.js
```

## Performance Benchmarks

### Load Time Metrics

Target metrics for production:

| Metric | Target | Max Acceptable |
|--------|--------|----------------|
| First Contentful Paint (FCP) | < 1.5s | < 2.5s |
| Largest Contentful Paint (LCP) | < 2.5s | < 4.0s |
| Time to Interactive (TTI) | < 3.5s | < 5.0s |
| Total Blocking Time (TBT) | < 200ms | < 600ms |
| Cumulative Layout Shift (CLS) | < 0.1 | < 0.25 |

### Measure Performance

```bash
# Using Lighthouse
npm install -g lighthouse

# Run Lighthouse audit
lighthouse http://localhost:8080 \
  --output html \
  --output-path ./lighthouse-report.html \
  --chrome-flags="--headless"

# View report
open lighthouse-report.html
```

### Performance Test Script

```javascript
// test/performance/benchmark.js
const { chromium } = require('playwright');

async function measurePerformance(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Collect performance metrics
  await page.goto(url);
  
  const metrics = await page.evaluate(() => {
    const perf = performance.getEntriesByType('navigation')[0];
    return {
      dns: perf.domainLookupEnd - perf.domainLookupStart,
      tcp: perf.connectEnd - perf.connectStart,
      ttfb: perf.responseStart - perf.requestStart,
      download: perf.responseEnd - perf.responseStart,
      domInteractive: perf.domInteractive - perf.fetchStart,
      domComplete: perf.domComplete - perf.fetchStart,
      loadComplete: perf.loadEventEnd - perf.fetchStart,
    };
  });
  
  console.log('Performance Metrics:');
  console.log(`DNS Lookup: ${metrics.dns.toFixed(2)}ms`);
  console.log(`TCP Connection: ${metrics.tcp.toFixed(2)}ms`);
  console.log(`Time to First Byte: ${metrics.ttfb.toFixed(2)}ms`);
  console.log(`Download Time: ${metrics.download.toFixed(2)}ms`);
  console.log(`DOM Interactive: ${metrics.domInteractive.toFixed(2)}ms`);
  console.log(`DOM Complete: ${metrics.domComplete.toFixed(2)}ms`);
  console.log(`Load Complete: ${metrics.loadComplete.toFixed(2)}ms`);
  
  await browser.close();
}

measurePerformance('http://localhost:8080');
```

## Security Audit

### Security Checklist

- [ ] **Authentication**
  - [ ] Passwords hashed (bcrypt/argon2)
  - [ ] JWT tokens use secure secret
  - [ ] Token expiry enforced
  - [ ] Session invalidation works
  - [ ] OAuth flow uses state parameter

- [ ] **Authorization**
  - [ ] Firestore rules tested
  - [ ] API endpoints check permissions
  - [ ] No privilege escalation possible
  - [ ] Owner-only operations protected

- [ ] **Data Protection**
  - [ ] Sensitive data encrypted at rest
  - [ ] TLS/HTTPS enforced
  - [ ] No sensitive data in logs
  - [ ] No credentials in client-side code
  - [ ] CORS properly configured

- [ ] **Input Validation**
  - [ ] All inputs sanitized
  - [ ] SQL injection prevention
  - [ ] XSS prevention
  - [ ] CSRF tokens used
  - [ ] File upload validation

- [ ] **Code Execution**
  - [ ] Sandboxed environment
  - [ ] Resource limits enforced
  - [ ] Network access restricted
  - [ ] File system isolated
  - [ ] Timeout enforced

- [ ] **API Security**
  - [ ] Rate limiting active
  - [ ] API keys rotated
  - [ ] No exposed secrets
  - [ ] Error messages don't leak info
  - [ ] Security headers set

### Security Testing Tools

```bash
# 1. Dependency vulnerabilities
npm audit
npm audit fix

# 2. OWASP ZAP scan (requires ZAP installed)
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t http://localhost:8080

# 3. Check for exposed secrets
npm install -g trufflehog
trufflehog filesystem . --json

# 4. Security headers check
curl -I https://your-edu-platform.com | grep -E "X-|Content-Security-Policy"
```

## Accessibility Testing

### WCAG 2.1 Level AA Checklist

- [ ] **Perceivable**
  - [ ] All images have alt text
  - [ ] Text has 4.5:1 contrast ratio
  - [ ] Color not sole info indicator
  - [ ] Video has captions
  - [ ] Audio has transcripts

- [ ] **Operable**
  - [ ] Keyboard accessible
  - [ ] No keyboard traps
  - [ ] Sufficient time for actions
  - [ ] Seizure-safe (no flashing)
  - [ ] Skip navigation links

- [ ] **Understandable**
  - [ ] Language declared
  - [ ] Predictable navigation
  - [ ] Error messages clear
  - [ ] Labels for inputs
  - [ ] Consistent UI

- [ ] **Robust**
  - [ ] Valid HTML
  - [ ] ARIA roles correct
  - [ ] Compatible with assistive tech
  - [ ] Graceful degradation

### Automated Accessibility Testing

```bash
# Install axe-core
npm install -D @axe-core/playwright

# Run accessibility tests
npx playwright test test/a11y/accessibility.test.js
```

Example test:

```javascript
// test/a11y/accessibility.test.js
const { test, expect } = require('@playwright/test');
const { injectAxe, checkA11y } = require('axe-playwright');

test('homepage is accessible', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await injectAxe(page);
  await checkA11y(page, null, {
    detailedReport: true,
    detailedReportOptions: {
      html: true
    }
  });
});
```

### Manual Accessibility Testing

1. **Screen Reader Test**
   - macOS: VoiceOver (Cmd+F5)
   - Windows: NVDA (free) or JAWS
   - Navigate entire app with screen reader
   - Verify all content announced correctly

2. **Keyboard Navigation Test**
   - Disconnect mouse
   - Navigate using Tab, Shift+Tab, Enter, Space, Arrows
   - Verify all interactive elements reachable
   - Check focus indicators visible

3. **Zoom Test**
   - Zoom to 200% (Cmd/Ctrl + +)
   - Verify no content cut off
   - Check layout still usable

## Post-Deployment Validation

### Smoke Tests

Run immediately after deployment:

```bash
# 1. Health check
curl https://your-edu-platform.com/health
# Expected: 200 OK

# 2. Static assets loading
curl -I https://your-edu-platform.com/assets/index.js
# Expected: 200 OK, Cache-Control header present

# 3. Authentication endpoint
curl https://your-edu-platform.com/api/auth/status
# Expected: Valid JSON response

# 4. Compiler API
curl -X POST https://compiler-api.yourdomain.com/api/v1/execute \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(1+1)"}'
# Expected: {"stdout":"2\n",...}
```

### Monitoring Setup Verification

- [ ] Error tracking (Sentry) receiving events
- [ ] Analytics (Firebase/Google) recording page views
- [ ] Performance monitoring showing metrics
- [ ] Logging capturing errors
- [ ] Alerts configured and tested

### User Acceptance Testing

Create test accounts with different roles:

1. **Student Account**
   - Complete a full assignment workflow
   - Collaborate on a notebook
   - Use AI assistant

2. **Instructor Account**
   - Create and publish assignment
   - View submissions
   - Provide feedback

3. **Admin Account**
   - Manage users
   - View usage statistics
   - Configure system settings

### Production Validation Checklist

- [ ] Application loads without errors
- [ ] User can register and login
- [ ] HTTPS enforced (no mixed content)
- [ ] All API endpoints responding
- [ ] Database operations working
- [ ] Real-time sync functioning
- [ ] Email notifications sending
- [ ] Error tracking operational
- [ ] Analytics recording
- [ ] Backup strategy active
- [ ] Monitoring alerts configured
- [ ] Documentation updated with prod URLs

## Continuous Monitoring

Set up ongoing validation:

```yaml
# .github/workflows/smoke-test.yml
name: Hourly Smoke Test

on:
  schedule:
    - cron: '0 * * * *'  # Every hour

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run smoke tests
        run: |
          curl -f https://your-edu-platform.com/health || exit 1
          curl -f https://your-edu-platform.com/ || exit 1
      - name: Notify on failure
        if: failure()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Production smoke test failed!'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## Validation Report Template

After completing validation, document results:

```markdown
# Validation Report - [Date]

## Environment
- **Platform**: Production
- **Version**: v1.2.3
- **Validator**: [Name]
- **Date**: 2024-01-15

## Results Summary
- ✅ All pre-deployment checks passed
- ✅ Manual testing: 98/100 items passed
- ✅ Automated tests: 245/245 passed
- ✅ Performance: All metrics within targets
- ⚠️  Security: 2 low-severity findings (addressed)
- ✅ Accessibility: WCAG 2.1 AA compliant
- ✅ Post-deployment: All smoke tests passed

## Issues Found
1. AI sidebar scrolling on mobile (Fixed)
2. Cache headers missing on some assets (Fixed)

## Recommendations
- Monitor error rates for 48 hours
- Schedule follow-up review in 1 week
- Consider adding integration tests for collaboration

## Approval
Ready for production use: ✅ YES
```

## Next Steps

After validation:
1. Deploy to production
2. Monitor closely for 24-48 hours
3. Collect user feedback
4. Schedule retrospective
5. Plan next iteration

For ongoing quality assurance, repeat validation:
- Before each production deployment
- Weekly for staging environment
- After major infrastructure changes
- Following security updates
