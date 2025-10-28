# CI/CD Workflows for Education Platform

This document provides example CI/CD workflow configurations for automating the build, test, and deployment process of the VS Code Education Platform.

## Table of Contents

1. [GitHub Actions Workflows](#github-actions-workflows)
2. [GitLab CI Configuration](#gitlab-ci-configuration)
3. [CircleCI Configuration](#circleci-configuration)
4. [Azure Pipelines](#azure-pipelines)
5. [Build Scripts](#build-scripts)
6. [Deploy Scripts](#deploy-scripts)

## GitHub Actions Workflows

### Complete Deployment Pipeline

Create `.github/workflows/deploy-edu.yml`:

```yaml
name: Build and Deploy Education Platform

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  workflow_dispatch:

env:
  NODE_VERSION: '20'
  CACHE_VERSION: v1

jobs:
  lint:
    name: Lint and Type Check
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ESLint
        run: npm run eslint
      
      - name: Run Stylelint
        run: npm run stylelint
      
      - name: Type check
        run: npm run compile-check-ts-native

  test:
    name: Run Tests
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: ['20']
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test-node
      
      - name: Run browser tests
        run: npm run test-browser
        if: runner.os == 'Linux'
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: runner.os == 'Linux'
        with:
          files: ./coverage/coverage-final.json
          flags: unittests
          name: codecov-${{ matrix.os }}

  build-edu:
    name: Build Education Platform
    needs: [lint, test]
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build education platform
        run: npm run build-edu
        env:
          NODE_ENV: production
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: edu-platform-build
          path: dist/edu-platform/
          retention-days: 30

  deploy-staging:
    name: Deploy to Staging
    needs: build-edu
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.your-edu-platform.com
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Download build artifacts
        uses: actions/download-artifact@v3
        with:
          name: edu-platform-build
          path: dist/edu-platform/
      
      - name: Deploy to Firebase Hosting (Staging)
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_STAGING }}'
          channelId: staging
          projectId: ${{ secrets.FIREBASE_PROJECT_ID_STAGING }}
      
      - name: Run smoke tests
        run: |
          npm ci
          npm run smoketest-staging
        env:
          TEST_URL: https://staging.your-edu-platform.com

  deploy-production:
    name: Deploy to Production
    needs: build-edu
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://your-edu-platform.com
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Download build artifacts
        uses: actions/download-artifact@v3
        with:
          name: edu-platform-build
          path: dist/edu-platform/
      
      - name: Deploy to Firebase Hosting (Production)
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_PROD }}'
          channelId: live
          projectId: ${{ secrets.FIREBASE_PROJECT_ID_PROD }}
      
      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v${{ github.run_number }}
          release_name: Release v${{ github.run_number }}
          draft: false
          prerelease: false
      
      - name: Notify deployment
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Production deployment completed successfully!'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
        if: always()

  deploy-compiler-api:
    name: Deploy Compiler API
    needs: [lint, test]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1
      
      - name: Deploy to Cloud Run
        run: |
          cd compiler-api
          gcloud run deploy compiler-api \
            --source . \
            --platform managed \
            --region us-central1 \
            --allow-unauthenticated \
            --set-env-vars "API_KEY=${{ secrets.COMPILER_API_KEY }}" \
            --max-instances 10 \
            --memory 2Gi \
            --timeout 30
```

### Preview Deployment Workflow

Create `.github/workflows/preview-deploy.yml`:

```yaml
name: Deploy Preview

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  deploy-preview:
    name: Deploy PR Preview
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build-edu
        env:
          NODE_ENV: production
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
      
      - name: Deploy to Firebase Preview Channel
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          projectId: ${{ secrets.FIREBASE_PROJECT_ID }}
          expires: 7d
        id: preview_deploy
      
      - name: Comment PR
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `🚀 Preview deployed!\n\n**Preview URL:** ${{ steps.preview_deploy.outputs.details_url }}\n\nExpires in 7 days.`
            })
```

## GitLab CI Configuration

Create `.gitlab-ci.yml`:

```yaml
stages:
  - lint
  - test
  - build
  - deploy

variables:
  NODE_VERSION: "20"
  npm_config_cache: "$CI_PROJECT_DIR/.npm"

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - .npm/
    - node_modules/

before_script:
  - node --version
  - npm --version

lint:
  stage: lint
  image: node:${NODE_VERSION}
  script:
    - npm ci
    - npm run eslint
    - npm run stylelint
    - npm run compile-check-ts-native
  only:
    - merge_requests
    - main
    - develop

test:unit:
  stage: test
  image: node:${NODE_VERSION}
  script:
    - npm ci
    - npm run test-node
  coverage: '/Lines\s*:\s*(\d+\.\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
  only:
    - merge_requests
    - main
    - develop

test:browser:
  stage: test
  image: mcr.microsoft.com/playwright:v1.40.0-focal
  script:
    - npm ci
    - npm run test-browser
  only:
    - merge_requests
    - main
    - develop

build:edu:
  stage: build
  image: node:${NODE_VERSION}
  script:
    - npm ci
    - npm run build-edu
  artifacts:
    paths:
      - dist/edu-platform/
    expire_in: 1 week
  only:
    - main
    - develop

deploy:staging:
  stage: deploy
  image: node:${NODE_VERSION}
  dependencies:
    - build:edu
  script:
    - npm install -g firebase-tools
    - firebase deploy --only hosting --project staging --token "$FIREBASE_TOKEN"
  environment:
    name: staging
    url: https://staging.your-edu-platform.com
  only:
    - develop

deploy:production:
  stage: deploy
  image: node:${NODE_VERSION}
  dependencies:
    - build:edu
  script:
    - npm install -g firebase-tools
    - firebase deploy --only hosting --project production --token "$FIREBASE_TOKEN"
  environment:
    name: production
    url: https://your-edu-platform.com
  when: manual
  only:
    - main
```

## CircleCI Configuration

Create `.circleci/config.yml`:

```yaml
version: 2.1

orbs:
  node: circleci/node@5.1.0
  gcp-cli: circleci/gcp-cli@3.1.0

executors:
  node-executor:
    docker:
      - image: cimg/node:20.9
    working_directory: ~/project

jobs:
  install-dependencies:
    executor: node-executor
    steps:
      - checkout
      - restore_cache:
          keys:
            - v1-dependencies-{{ checksum "package-lock.json" }}
            - v1-dependencies-
      - run:
          name: Install dependencies
          command: npm ci
      - save_cache:
          paths:
            - node_modules
          key: v1-dependencies-{{ checksum "package-lock.json" }}
      - persist_to_workspace:
          root: .
          paths:
            - node_modules

  lint:
    executor: node-executor
    steps:
      - checkout
      - attach_workspace:
          at: .
      - run:
          name: Run linters
          command: |
            npm run eslint
            npm run stylelint
      - run:
          name: Type check
          command: npm run compile-check-ts-native

  test:
    executor: node-executor
    steps:
      - checkout
      - attach_workspace:
          at: .
      - run:
          name: Run tests
          command: npm run test-node
      - run:
          name: Run browser tests
          command: npm run test-browser
      - store_test_results:
          path: test-results
      - store_artifacts:
          path: coverage

  build-edu:
    executor: node-executor
    steps:
      - checkout
      - attach_workspace:
          at: .
      - run:
          name: Build education platform
          command: npm run build-edu
          environment:
            NODE_ENV: production
      - persist_to_workspace:
          root: .
          paths:
            - dist/edu-platform

  deploy-staging:
    executor: node-executor
    steps:
      - checkout
      - attach_workspace:
          at: .
      - run:
          name: Install Firebase CLI
          command: npm install -g firebase-tools
      - run:
          name: Deploy to staging
          command: firebase deploy --only hosting --project staging --token "$FIREBASE_TOKEN"

  deploy-production:
    executor: node-executor
    steps:
      - checkout
      - attach_workspace:
          at: .
      - run:
          name: Install Firebase CLI
          command: npm install -g firebase-tools
      - run:
          name: Deploy to production
          command: firebase deploy --only hosting --project production --token "$FIREBASE_TOKEN"

workflows:
  version: 2
  build-test-deploy:
    jobs:
      - install-dependencies
      - lint:
          requires:
            - install-dependencies
      - test:
          requires:
            - install-dependencies
      - build-edu:
          requires:
            - lint
            - test
      - deploy-staging:
          requires:
            - build-edu
          filters:
            branches:
              only: develop
      - hold-production:
          type: approval
          requires:
            - build-edu
          filters:
            branches:
              only: main
      - deploy-production:
          requires:
            - hold-production
          filters:
            branches:
              only: main
```

## Azure Pipelines

Create `azure-pipelines.yml`:

```yaml
trigger:
  branches:
    include:
      - main
      - develop

pool:
  vmImage: 'ubuntu-latest'

variables:
  nodeVersion: '20.x'
  npmCache: $(Pipeline.Workspace)/.npm

stages:
  - stage: Build
    displayName: 'Build and Test'
    jobs:
      - job: Lint
        displayName: 'Lint Code'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: $(nodeVersion)
            displayName: 'Install Node.js'
          
          - task: Cache@2
            inputs:
              key: 'npm | "$(Agent.OS)" | package-lock.json'
              path: $(npmCache)
            displayName: Cache npm
          
          - script: |
              npm ci --cache $(npmCache)
            displayName: 'Install dependencies'
          
          - script: |
              npm run eslint
              npm run stylelint
              npm run compile-check-ts-native
            displayName: 'Run linters and type check'

      - job: Test
        displayName: 'Run Tests'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: $(nodeVersion)
            displayName: 'Install Node.js'
          
          - script: npm ci
            displayName: 'Install dependencies'
          
          - script: npm run test-node
            displayName: 'Run unit tests'
          
          - script: npm run test-browser
            displayName: 'Run browser tests'
          
          - task: PublishTestResults@2
            inputs:
              testResultsFormat: 'JUnit'
              testResultsFiles: '**/test-results.xml'
            condition: succeededOrFailed()
          
          - task: PublishCodeCoverageResults@1
            inputs:
              codeCoverageTool: 'Cobertura'
              summaryFileLocation: '$(System.DefaultWorkingDirectory)/coverage/cobertura-coverage.xml'

      - job: BuildEdu
        displayName: 'Build Education Platform'
        dependsOn:
          - Lint
          - Test
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: $(nodeVersion)
            displayName: 'Install Node.js'
          
          - script: npm ci
            displayName: 'Install dependencies'
          
          - script: npm run build-edu
            displayName: 'Build education platform'
            env:
              NODE_ENV: production
              VITE_FIREBASE_API_KEY: $(VITE_FIREBASE_API_KEY)
              VITE_FIREBASE_AUTH_DOMAIN: $(VITE_FIREBASE_AUTH_DOMAIN)
              VITE_FIREBASE_PROJECT_ID: $(VITE_FIREBASE_PROJECT_ID)
          
          - task: PublishBuildArtifacts@1
            inputs:
              PathtoPublish: 'dist/edu-platform'
              ArtifactName: 'edu-platform-build'
            displayName: 'Publish build artifacts'

  - stage: DeployStaging
    displayName: 'Deploy to Staging'
    dependsOn: Build
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/develop'))
    jobs:
      - deployment: DeployStaging
        displayName: 'Deploy to Firebase Staging'
        environment: 'staging'
        strategy:
          runOnce:
            deploy:
              steps:
                - download: current
                  artifact: edu-platform-build
                
                - task: NodeTool@0
                  inputs:
                    versionSpec: $(nodeVersion)
                
                - script: |
                    npm install -g firebase-tools
                    firebase deploy --only hosting --project staging --token $(FIREBASE_TOKEN)
                  displayName: 'Deploy to Firebase'

  - stage: DeployProduction
    displayName: 'Deploy to Production'
    dependsOn: Build
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: DeployProduction
        displayName: 'Deploy to Firebase Production'
        environment: 'production'
        strategy:
          runOnce:
            deploy:
              steps:
                - download: current
                  artifact: edu-platform-build
                
                - task: NodeTool@0
                  inputs:
                    versionSpec: $(nodeVersion)
                
                - script: |
                    npm install -g firebase-tools
                    firebase deploy --only hosting --project production --token $(FIREBASE_TOKEN)
                  displayName: 'Deploy to Firebase'
```

## Build Scripts

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "build-edu": "npm run clean && npm run compile && npm run build-edu-react && npm run build-edu-extensions",
    "build-edu-react": "webpack --config build/edu/webpack.config.js --mode production",
    "build-edu-extensions": "gulp compile-extensions --filter edu-*",
    "watch-edu": "npm-run-all -p watch-edu-core watch-edu-react",
    "watch-edu-core": "gulp watch-client watch-extensions",
    "watch-edu-react": "webpack --config build/edu/webpack.config.js --mode development --watch",
    "deploy-edu": "node scripts/deploy-edu.js",
    "deploy-edu-staging": "node scripts/deploy-edu.js --env staging",
    "deploy-edu-production": "node scripts/deploy-edu.js --env production",
    "clean": "rimraf out dist",
    "smoketest-staging": "BASE_URL=https://staging.your-edu-platform.com npm run smoketest",
    "version-bump": "node scripts/version-bump.js"
  }
}
```

## Deploy Scripts

Create `scripts/deploy-edu.js`:

```javascript
#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const envFlag = args.find(arg => arg.startsWith('--env='));
const environment = envFlag ? envFlag.split('=')[1] : 'production';

console.log(`🚀 Deploying Education Platform to ${environment}...`);

function exec(command, options = {}) {
  console.log(`Running: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    process.exit(1);
  }
}

function checkEnvironment() {
  console.log('🔍 Checking environment...');
  
  const requiredVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  console.log('✅ Environment check passed');
}

function build() {
  console.log('🔨 Building application...');
  exec('npm run build-edu');
  console.log('✅ Build complete');
}

function deployToFirebase() {
  console.log(`📦 Deploying to Firebase (${environment})...`);
  
  const projectId = environment === 'production' 
    ? process.env.FIREBASE_PROJECT_ID_PROD 
    : process.env.FIREBASE_PROJECT_ID_STAGING;
  
  exec(`firebase deploy --only hosting --project ${projectId}`);
  console.log('✅ Deployment complete');
}

function deployCompilerApi() {
  console.log('🔧 Deploying Compiler API...');
  
  const region = 'us-central1';
  const serviceName = `compiler-api-${environment}`;
  
  exec(`gcloud run deploy ${serviceName} \
    --source ./compiler-api \
    --platform managed \
    --region ${region} \
    --allow-unauthenticated`, { cwd: process.cwd() });
  
  console.log('✅ Compiler API deployed');
}

function updateVersionFile() {
  const version = {
    version: require('../package.json').version,
    buildTime: new Date().toISOString(),
    environment,
    commit: execSync('git rev-parse HEAD').toString().trim()
  };
  
  const versionPath = path.join(__dirname, '../dist/edu-platform/version.json');
  fs.writeFileSync(versionPath, JSON.stringify(version, null, 2));
  
  console.log(`✅ Version file updated: ${version.version}`);
}

function main() {
  try {
    checkEnvironment();
    build();
    updateVersionFile();
    deployToFirebase();
    
    if (args.includes('--with-api')) {
      deployCompilerApi();
    }
    
    console.log('🎉 Deployment completed successfully!');
    console.log(`🌐 URL: https://${environment}.your-edu-platform.com`);
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

main();
```

Make the script executable:

```bash
chmod +x scripts/deploy-edu.js
```

Create `scripts/version-bump.js`:

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '../package.json');
const pkg = require(packagePath);

const [, , type = 'patch'] = process.argv;

const [major, minor, patch] = pkg.version.split('.').map(Number);

let newVersion;
switch (type) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

pkg.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`✅ Version bumped: ${pkg.version} → ${newVersion}`);
console.log(`Run: git add package.json && git commit -m "chore: bump version to ${newVersion}"`);
```

## Usage Examples

### Manual Deployment

```bash
# Build and deploy to staging
npm run deploy-edu-staging

# Build and deploy to production
npm run deploy-edu-production

# Deploy with compiler API
npm run deploy-edu -- --env=production --with-api

# Bump version before release
npm run version-bump minor
git add package.json
git commit -m "chore: bump version to 1.1.0"
git tag v1.1.0
git push && git push --tags
```

### Automated Deployment

Push to the appropriate branch to trigger deployment:

```bash
# Deploy to staging
git checkout develop
git push origin develop

# Deploy to production
git checkout main
git merge develop
git push origin main
```

## Secrets Configuration

### GitHub Actions Secrets

Add these secrets in GitHub repository settings:

- `FIREBASE_SERVICE_ACCOUNT_STAGING` - Firebase service account JSON (staging)
- `FIREBASE_SERVICE_ACCOUNT_PROD` - Firebase service account JSON (production)
- `FIREBASE_PROJECT_ID_STAGING` - Firebase project ID (staging)
- `FIREBASE_PROJECT_ID_PROD` - Firebase project ID (production)
- `VITE_FIREBASE_API_KEY` - Firebase API key
- `VITE_FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID
- `VITE_FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `VITE_FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging sender ID
- `VITE_FIREBASE_APP_ID` - Firebase app ID
- `COMPILER_API_KEY` - Compiler API authentication key
- `GCP_SA_KEY` - Google Cloud service account key (JSON)
- `SLACK_WEBHOOK` - Slack webhook URL for notifications (optional)

### GitLab CI Variables

Add these variables in GitLab project settings (Settings → CI/CD → Variables):

Same as GitHub Actions secrets above, plus:
- `FIREBASE_TOKEN` - Firebase CI token (run `firebase login:ci`)

## Monitoring Deployments

### Status Checks

Add deployment status checks to your CI:

```yaml
- name: Health check
  run: |
    sleep 30  # Wait for deployment to stabilize
    response=$(curl -s -o /dev/null -w "%{http_code}" https://your-edu-platform.com/health)
    if [ $response -ne 200 ]; then
      echo "Health check failed with status $response"
      exit 1
    fi
    echo "Health check passed"
```

### Rollback Strategy

If deployment fails:

```bash
# Firebase Hosting has automatic rollback
firebase hosting:rollback

# Or deploy specific version
firebase deploy --only hosting --version <previous-version>

# For Cloud Run
gcloud run services update-traffic compiler-api \
  --to-revisions=<previous-revision>=100
```

## Best Practices

1. **Use separate Firebase projects for staging and production**
2. **Run smoke tests after deployment**
3. **Implement gradual rollout for production**
4. **Keep deployment logs for auditing**
5. **Use deployment gates for production**
6. **Monitor error rates after deployment**
7. **Document rollback procedures**
8. **Test preview deployments on PRs**

## Next Steps

- Set up automated performance testing
- Configure error tracking (Sentry)
- Implement feature flags for gradual rollouts
- Set up deployment notifications
- Configure automatic rollbacks on errors
