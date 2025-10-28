# Education Platform Deployment Checklist

Use this checklist to ensure all requirements are met before deploying the VS Code Education Platform to production.

## Pre-Deployment Checklist

### 1. Infrastructure Setup

#### Firebase
- [ ] Firebase project created
- [ ] Firebase Authentication enabled
  - [ ] Email/password authentication configured
  - [ ] Google OAuth provider configured
  - [ ] Authorized domains added (localhost, production domain)
- [ ] Firestore database created
- [ ] Firestore security rules deployed (`firestore.rules`)
- [ ] Firestore indexes created (`firestore.indexes.json`)
- [ ] Firebase Hosting configured
- [ ] Firebase service account created and key downloaded
- [ ] Billing alerts configured (if using paid tier)

#### Universal Compiler API
- [ ] Compiler API deployed (Cloud Run, self-hosted, or third-party)
- [ ] API key generated
- [ ] Rate limiting configured
- [ ] Resource limits set (memory, CPU, timeout)
- [ ] Docker containers secured
- [ ] Network isolation configured
- [ ] Health check endpoint responding
- [ ] Logging configured

#### AI Provider
- [ ] AI provider account created (OpenAI or Anthropic)
- [ ] API key obtained
- [ ] Usage limits configured
- [ ] Billing alerts set
- [ ] Rate limiting implemented
- [ ] Response caching configured
- [ ] Error handling implemented

### 2. Configuration

#### Environment Variables
- [ ] `.env` file created from `.env.example`
- [ ] All required Firebase variables set
  - [ ] `VITE_FIREBASE_API_KEY`
  - [ ] `VITE_FIREBASE_AUTH_DOMAIN`
  - [ ] `VITE_FIREBASE_PROJECT_ID`
  - [ ] `VITE_FIREBASE_STORAGE_BUCKET`
  - [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - [ ] `VITE_FIREBASE_APP_ID`
- [ ] Firebase Admin SDK configured
  - [ ] `FIREBASE_ADMIN_PROJECT_ID`
  - [ ] `FIREBASE_ADMIN_CLIENT_EMAIL`
  - [ ] `FIREBASE_ADMIN_PRIVATE_KEY`
- [ ] Compiler API configured
  - [ ] `COMPILER_API_URL`
  - [ ] `COMPILER_API_KEY`
- [ ] AI provider configured
  - [ ] `AI_PROVIDER` (openai or anthropic)
  - [ ] Provider API key set
  - [ ] Model selection configured
- [ ] Security settings configured
  - [ ] `SESSION_SECRET` (strong random value)
  - [ ] `RATE_LIMIT_*` variables
- [ ] `.env` file added to `.gitignore`
- [ ] `.env` file NOT committed to repository

#### Firebase Configuration Files
- [ ] `firebase.json` created from example
- [ ] `firestore.rules` created from example
- [ ] `firestore.indexes.json` created from example
- [ ] Hosting configuration verified
- [ ] Cache headers configured
- [ ] Security headers configured
- [ ] Rewrites configured for SPA

### 3. Build & Testing

#### Build Process
- [ ] Dependencies installed (`npm install`)
- [ ] Build succeeds (`npm run build-edu`)
- [ ] Build output verified in `dist/edu-platform/`
- [ ] Bundle sizes reasonable (< 1MB for main bundle)
- [ ] Source maps generated (development) or excluded (production)
- [ ] Environment-specific builds tested

#### Code Quality
- [ ] Linting passes (`npm run eslint`)
- [ ] Style linting passes (`npm run stylelint`)
- [ ] Type checking passes (`npm run compile-check-ts-native`)
- [ ] No console.log statements in production code
- [ ] No TODO/FIXME comments blocking deployment

#### Testing
- [ ] Unit tests pass (`npm run test-node`)
- [ ] Browser tests pass (`npm run test-browser`)
- [ ] E2E tests pass (if implemented)
- [ ] Manual testing completed (see [validation.md](./validation.md))
- [ ] Smoke tests defined and passing

### 4. Security

#### Authentication & Authorization
- [ ] Firestore security rules tested
- [ ] API endpoints require authentication
- [ ] Role-based access control implemented
- [ ] Token expiry enforced
- [ ] Password requirements enforced
- [ ] OAuth flow secure (state parameter used)

#### Data Protection
- [ ] HTTPS enforced (no HTTP fallback)
- [ ] No sensitive data in logs
- [ ] No credentials in client-side code
- [ ] No hardcoded secrets
- [ ] API keys in environment variables only
- [ ] CORS properly configured

#### Code Execution Security
- [ ] Code execution sandboxed
- [ ] Resource limits enforced
- [ ] Timeout configured
- [ ] Network access restricted
- [ ] File system access restricted

#### Dependencies
- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] Dependencies up to date
- [ ] Security patches applied

### 5. Performance

#### Optimization
- [ ] Code splitting implemented
- [ ] Lazy loading for features
- [ ] Static assets minified
- [ ] Images optimized
- [ ] CDN configured for assets
- [ ] Caching headers set correctly
- [ ] Service worker configured (optional)

#### Performance Metrics
- [ ] Lighthouse score > 90 (Performance)
- [ ] First Contentful Paint < 2.5s
- [ ] Largest Contentful Paint < 2.5s
- [ ] Time to Interactive < 3.5s
- [ ] Total Blocking Time < 200ms
- [ ] Cumulative Layout Shift < 0.1

### 6. Accessibility

#### WCAG Compliance
- [ ] All images have alt text
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Form labels present
- [ ] ARIA attributes correct
- [ ] Screen reader tested
- [ ] No keyboard traps

#### Automated Testing
- [ ] axe-core accessibility tests pass
- [ ] No critical accessibility issues

### 7. Monitoring & Logging

#### Error Tracking
- [ ] Error tracking service configured (Sentry, etc.)
- [ ] Error reporting tested
- [ ] Source maps uploaded (for production debugging)
- [ ] Alert thresholds configured

#### Analytics
- [ ] Firebase Analytics configured
- [ ] Google Analytics configured (optional)
- [ ] Custom events tracked
- [ ] User properties configured
- [ ] Privacy policy updated

#### Application Monitoring
- [ ] Performance monitoring enabled
- [ ] Custom metrics tracked
- [ ] Health check endpoint created
- [ ] Uptime monitoring configured

#### Logging
- [ ] Structured logging implemented
- [ ] Log levels configured correctly
- [ ] No sensitive data in logs
- [ ] Log retention policy set

### 8. Documentation

#### Required Documentation
- [ ] Architecture documentation complete
- [ ] Setup instructions validated
- [ ] Deployment guide accurate
- [ ] CI/CD workflows documented
- [ ] API documentation current
- [ ] Environment variables documented
- [ ] Troubleshooting guide available

#### User Documentation
- [ ] User guide created
- [ ] Video tutorials (optional)
- [ ] FAQ updated
- [ ] Support contact information

### 9. CI/CD

#### Automation
- [ ] CI/CD pipeline configured
- [ ] Automated tests run on PR
- [ ] Automated deployment on merge
- [ ] Staging environment configured
- [ ] Production deployment requires approval

#### GitHub Actions / GitLab CI
- [ ] Workflow file created
- [ ] Secrets configured
- [ ] Environment variables set
- [ ] Deployment tested
- [ ] Rollback procedure documented

### 10. Legal & Compliance

#### Terms & Privacy
- [ ] Terms of Service created
- [ ] Privacy Policy created
- [ ] Cookie Policy (if applicable)
- [ ] GDPR compliance (if EU users)
- [ ] COPPA compliance (if under 13 users)

#### Licensing
- [ ] Open source licenses acknowledged
- [ ] Third-party attributions included
- [ ] License file present

### 11. Backup & Recovery

#### Data Backup
- [ ] Firestore backup configured
- [ ] Backup schedule set (daily recommended)
- [ ] Backup retention policy defined
- [ ] Restore procedure tested

#### Disaster Recovery
- [ ] Recovery Time Objective (RTO) defined
- [ ] Recovery Point Objective (RPO) defined
- [ ] Disaster recovery plan documented
- [ ] Recovery procedure tested

### 12. Domain & DNS

#### Domain Configuration
- [ ] Domain purchased/available
- [ ] SSL certificate obtained (automatic with Firebase/Vercel)
- [ ] DNS records configured
- [ ] Custom domain added to Firebase Hosting
- [ ] DNS propagation verified
- [ ] WWW redirect configured

#### Email
- [ ] Email service configured (for auth emails)
- [ ] Email templates customized
- [ ] SPF/DKIM records configured
- [ ] Test email sent successfully

## Deployment Steps

### Staging Deployment
1. [ ] Deploy to staging environment
2. [ ] Run smoke tests
3. [ ] Perform manual testing
4. [ ] Verify all features working
5. [ ] Check error rates in monitoring
6. [ ] Get stakeholder approval

### Production Deployment
1. [ ] Merge to main branch
2. [ ] CI/CD pipeline deploys automatically
3. [ ] Monitor deployment progress
4. [ ] Verify health check endpoint
5. [ ] Run smoke tests
6. [ ] Check error rates
7. [ ] Monitor for 1-2 hours
8. [ ] Announce deployment

## Post-Deployment

### Immediate (0-2 hours)
- [ ] Health check passing
- [ ] Error rate normal (< 1%)
- [ ] Performance metrics within targets
- [ ] User login working
- [ ] Code execution working
- [ ] AI sidebar responding
- [ ] Real-time sync functioning

### Short-term (2-24 hours)
- [ ] Monitor error tracking dashboard
- [ ] Review application logs
- [ ] Check performance metrics
- [ ] Monitor resource usage
- [ ] Verify backup completed
- [ ] Review user feedback

### Medium-term (1-7 days)
- [ ] Analyze usage patterns
- [ ] Review cost metrics
- [ ] Check for performance degradation
- [ ] Gather user feedback
- [ ] Plan optimizations
- [ ] Schedule retrospective

## Rollback Procedure

If issues are detected:

1. [ ] Identify issue severity
2. [ ] Decide: fix forward or rollback
3. [ ] If rollback:
   ```bash
   # Firebase Hosting
   firebase hosting:rollback
   
   # Or deploy previous version
   git checkout <previous-commit>
   npm run deploy-edu-production
   ```
4. [ ] Notify users of rollback
5. [ ] Investigate issue
6. [ ] Prepare fix
7. [ ] Test fix in staging
8. [ ] Re-deploy to production

## Sign-off

### Technical Review
- [ ] Technical lead approval
- [ ] Security review completed
- [ ] Performance benchmarks met
- [ ] Code review completed

### Business Review
- [ ] Product owner approval
- [ ] Legal approval
- [ ] Privacy review completed
- [ ] Budget approval

### Final Approval
- [ ] **Deployment approved by**: ____________________
- [ ] **Date**: ____________________
- [ ] **Signature**: ____________________

---

## Useful Commands

```bash
# Build
npm run build-edu

# Deploy to staging
npm run deploy-edu-staging

# Deploy to production
npm run deploy-edu-production

# Run tests
npm test

# Check security
npm audit

# View logs
firebase functions:log  # Firebase Functions
gcloud logs read  # Cloud Run

# Rollback
firebase hosting:rollback
```

## Support Contacts

- **Technical Lead**: [Name] <email>
- **DevOps**: [Name] <email>
- **Security**: [Name] <email>
- **On-call**: [Phone/Pager]

## Additional Resources

- [Architecture Documentation](./architecture.md)
- [Setup Guide](./setup.md)
- [CI/CD Workflows](./ci-workflows.md)
- [Validation Guide](./validation.md)
- [Quick Start](../../DEPLOY.md)

---

**Last Updated**: [Date]
**Checklist Version**: 1.0.0
