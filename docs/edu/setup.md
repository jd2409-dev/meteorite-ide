# Education Platform Setup and Deployment Guide

This guide provides step-by-step instructions for setting up and deploying the VS Code Education Platform from a fresh environment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Firebase Configuration](#firebase-configuration)
4. [Universal Compiler API Setup](#universal-compiler-api-setup)
5. [AI Provider Configuration](#ai-provider-configuration)
6. [Local Development](#local-development)
7. [Production Build](#production-build)
8. [Deployment](#deployment)
9. [Post-Deployment Configuration](#post-deployment-configuration)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Operating System**: Linux, macOS, or Windows with WSL2
- **Node.js**: Version 20.x or higher
- **npm**: Version 10.x or higher
- **Git**: Latest stable version
- **Docker**: Version 24.x or higher (for compiler API)
- **Memory**: Minimum 8GB RAM (16GB recommended)
- **Disk Space**: Minimum 10GB free

### Required Accounts

1. **Firebase Account**: Google account with Firebase access
2. **AI Provider**: Account with OpenAI or Anthropic
3. **Hosting Platform**: Account on Firebase Hosting, Vercel, or Netlify
4. **GitHub** (optional): For CI/CD integration

### Development Tools

```bash
# Install Node.js (using nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Verify installations
node --version  # Should be v20.x.x
npm --version   # Should be 10.x.x
docker --version # Should be 24.x.x or higher

# Install global dependencies
npm install -g firebase-tools
npm install -g vercel  # If using Vercel
```

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/microsoft/vscode.git vscode-edu
cd vscode-edu
git checkout docs-edu-deployment-plan  # Or your feature branch
```

### 2. Install Dependencies

```bash
# Install project dependencies
npm install

# This may take 10-15 minutes on first run
# The postinstall script will download Electron and other native dependencies
```

### 3. Environment Variables

Create a `.env` file in the root directory:

```bash
# .env
NODE_ENV=development

# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Firebase Admin SDK (Server-side)
FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=your_service_account@your_project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Universal Compiler API
COMPILER_API_URL=http://localhost:3000/api/v1
COMPILER_API_KEY=your_compiler_api_key

# AI Provider Configuration
# Option 1: OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_MAX_TOKENS=4000

# Option 2: Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-sonnet-20240229
ANTHROPIC_MAX_TOKENS=4000

# Select which AI provider to use
AI_PROVIDER=openai  # or 'anthropic'

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Session Configuration
SESSION_SECRET=your_random_session_secret_change_in_production
SESSION_DURATION=86400000  # 24 hours

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

### 4. Create Environment-Specific Configs

For production, create `.env.production`:

```bash
# .env.production
NODE_ENV=production

# Use production Firebase project
VITE_FIREBASE_API_KEY=your_production_firebase_api_key
# ... other production values

# Production Compiler API
COMPILER_API_URL=https://compiler-api.yourdomain.com/api/v1
```

## Firebase Configuration

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name (e.g., "vscode-edu")
4. Enable Google Analytics (optional)
5. Click "Create project"

### 2. Enable Authentication

1. In Firebase Console, navigate to **Authentication**
2. Click "Get started"
3. Enable sign-in methods:
   - **Email/Password**: Enable
   - **Google**: Enable and configure OAuth consent screen
4. Under **Settings** → **Authorized domains**, add your domains:
   - `localhost` (for development)
   - `your-app.web.app` (Firebase hosting)
   - `yourdomain.com` (custom domain)

### 3. Create Firestore Database

1. Navigate to **Firestore Database**
2. Click "Create database"
3. Select **Start in production mode** (we'll add rules next)
4. Choose a location (select closest to your users)
5. Click "Enable"

### 4. Configure Firestore Security Rules

In the Firebase Console, go to **Firestore Database** → **Rules** and paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    function isInstructor() {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'instructor';
    }
    
    // User profiles
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isOwner(userId);
      
      // User progress
      match /progress/{progressId} {
        allow read: if isOwner(userId) || isInstructor();
        allow write: if isOwner(userId);
      }
    }
    
    // Notebooks
    match /notebooks/{notebookId} {
      allow read: if isAuthenticated() && (
        resource.data.visibility == 'public' ||
        request.auth.uid == resource.data.author ||
        request.auth.uid in resource.data.collaborators
      );
      allow create: if isAuthenticated();
      allow update, delete: if isOwner(resource.data.author);
      
      // Notebook cells
      match /cells/{cellId} {
        allow read: if isAuthenticated();
        allow write: if isOwner(get(/databases/$(database)/documents/notebooks/$(notebookId)).data.author);
      }
    }
    
    // Assignments
    match /assignments/{assignmentId} {
      allow read: if isAuthenticated();
      allow create: if isInstructor();
      allow update, delete: if isInstructor() && 
                                isOwner(resource.data.instructor);
      
      // Submissions
      match /submissions/{submissionId} {
        allow read: if isAuthenticated() && (
          isInstructor() ||
          isOwner(resource.data.studentId)
        );
        allow create, update: if isAuthenticated() && 
                                  isOwner(resource.data.studentId);
      }
    }
    
    // Execution logs
    match /executions/{executionId} {
      allow read: if isOwner(resource.data.userId);
      allow create: if isAuthenticated();
      allow update, delete: if false;  // Immutable
    }
  }
}
```

Click **Publish** to save the rules.

### 5. Create Firestore Indexes

Create these composite indexes for optimal query performance:

1. Go to **Firestore Database** → **Indexes**
2. Create the following indexes:

**notebooks collection**:
- Collection ID: `notebooks`
- Fields: `author` (Ascending), `createdAt` (Descending)
- Query scope: Collection

**assignments collection**:
- Collection ID: `assignments`
- Fields: `instructor` (Ascending), `dueDate` (Ascending)
- Query scope: Collection

**executions collection**:
- Collection ID: `executions`
- Fields: `userId` (Ascending), `timestamp` (Descending)
- Query scope: Collection

### 6. Get Firebase Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll to "Your apps" section
3. Click the web icon (`</>`) to add a web app
4. Register app with name "VS Code Education Platform"
5. Copy the configuration object and update your `.env` file

### 7. Generate Service Account Key

For server-side Firebase Admin SDK:

1. Go to **Project Settings** → **Service Accounts**
2. Click **Generate new private key**
3. Save the JSON file securely
4. Extract values for `.env`:
   ```bash
   FIREBASE_ADMIN_PROJECT_ID=<project_id from JSON>
   FIREBASE_ADMIN_CLIENT_EMAIL=<client_email from JSON>
   FIREBASE_ADMIN_PRIVATE_KEY=<private_key from JSON>
   ```

**Security Note**: Never commit the service account JSON or private key to version control!

## Universal Compiler API Setup

The Universal Compiler API provides sandboxed code execution for student code.

### Option 1: Deploy Your Own Instance

#### Requirements
- Docker and Docker Compose
- 2GB RAM minimum per container
- Linux host (for optimal Docker performance)

#### Setup Steps

1. **Create API Directory Structure**:

```bash
mkdir -p compiler-api
cd compiler-api
```

2. **Create `docker-compose.yml`**:

```yaml
version: '3.8'

services:
  compiler-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - API_KEY=${COMPILER_API_KEY}
      - MAX_EXECUTION_TIME=10000
      - MAX_MEMORY_MB=512
      - RATE_LIMIT_PER_MINUTE=10
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
    
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

3. **Create `Dockerfile`**:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

4. **Create `package.json`**:

```json
{
  "name": "universal-compiler-api",
  "version": "1.0.0",
  "main": "server.js",
  "dependencies": {
    "express": "^4.18.2",
    "dockerode": "^4.0.2",
    "redis": "^4.6.7",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.8.0",
    "dotenv": "^16.3.1"
  }
}
```

5. **Deploy**:

```bash
# Generate API key
export COMPILER_API_KEY=$(openssl rand -hex 32)
echo "COMPILER_API_KEY=$COMPILER_API_KEY" >> .env

# Build and start
docker-compose up -d

# Verify running
docker-compose ps
curl http://localhost:3000/api/v1/health
```

### Option 2: Use Free-Tier Services

#### JDoodle API (Free Tier: 200 requests/day)

```bash
# Sign up at https://www.jdoodle.com/compiler-api
# Add to .env:
COMPILER_API_URL=https://api.jdoodle.com/v1
JDOODLE_CLIENT_ID=your_client_id
JDOODLE_CLIENT_SECRET=your_client_secret
```

#### Piston API (Open Source, Self-Hosted or Public)

```bash
# Use public instance (rate limited):
COMPILER_API_URL=https://emkc.org/api/v2/piston

# Or deploy your own:
git clone https://github.com/engineer-man/piston.git
cd piston
docker-compose up -d
COMPILER_API_URL=http://localhost:2000/api/v2/piston
```

### Security Configuration

Add rate limiting middleware in your API gateway:

```typescript
// src/edu/api/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

export const compilerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window per user
  keyGenerator: (req) => req.user.uid,
  message: 'Too many code execution requests, please try again later.'
});
```

## AI Provider Configuration

### Option 1: OpenAI (Recommended)

1. **Create Account**: Go to [OpenAI Platform](https://platform.openai.com/)
2. **Get API Key**: Navigate to API Keys section and create a new key
3. **Set Usage Limits**: Go to Settings → Billing → Usage limits to set monthly cap
4. **Configure in `.env`**:
   ```bash
   OPENAI_API_KEY=sk-proj-...
   OPENAI_MODEL=gpt-4-turbo-preview
   OPENAI_MAX_TOKENS=4000
   AI_PROVIDER=openai
   ```

**Free Tier**: $5 free credit for new accounts

**Pricing** (as of 2024):
- GPT-3.5-turbo: $0.0015 per 1K tokens (input), $0.002 per 1K tokens (output)
- GPT-4-turbo: $0.01 per 1K tokens (input), $0.03 per 1K tokens (output)

**Recommendation**: Start with GPT-3.5-turbo for cost-effectiveness, upgrade to GPT-4 for complex explanations.

### Option 2: Anthropic Claude

1. **Create Account**: Go to [Anthropic Console](https://console.anthropic.com/)
2. **Get API Key**: Create a new API key
3. **Configure in `.env`**:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-3-sonnet-20240229
   ANTHROPIC_MAX_TOKENS=4000
   AI_PROVIDER=anthropic
   ```

**Free Tier**: $5 free credit for new accounts

**Pricing**:
- Claude 3 Haiku: $0.25 per MTok (input), $1.25 per MTok (output)
- Claude 3 Sonnet: $3 per MTok (input), $15 per MTok (output)

### Cost Management

Add usage tracking and caching:

```typescript
// src/edu/ai/costManager.ts
export class AICostManager {
  private monthlyBudget = 100; // $100 per month
  
  async checkBudget(userId: string): Promise<boolean> {
    const usage = await this.getMonthlyUsage(userId);
    return usage < this.monthlyBudget;
  }
  
  async trackUsage(userId: string, tokens: number, cost: number) {
    await firestore.collection('ai_usage').add({
      userId,
      tokens,
      cost,
      timestamp: new Date()
    });
  }
}
```

Implement response caching:

```typescript
// Cache common queries
const cacheKey = `ai:${hashQuery(prompt)}`;
const cached = await redis.get(cacheKey);
if (cached) return cached;

const response = await openai.chat.completions.create({...});
await redis.setex(cacheKey, 3600, response); // Cache for 1 hour
```

## Local Development

### 1. Build the Project

```bash
# Full build (first time)
npm run build-edu

# This will:
# - Compile TypeScript code
# - Build React shell
# - Compile education extensions
# - Bundle assets
```

### 2. Start Development Server

```bash
# Start all watchers
npm run watch-edu

# In another terminal, start the application
./scripts/code.sh  # Linux/macOS
.\scripts\code.bat  # Windows
```

### 3. Verify Setup

The application should start with:
- VS Code window opens
- Login screen appears (Firebase Auth)
- No console errors

Test key features:
1. **Authentication**: Sign in with email/password
2. **Notebook Creation**: Create a new notebook
3. **Code Execution**: Run a simple Python script
4. **AI Sidebar**: Ask for code explanation

### Development Workflow

```bash
# Terminal 1: Watch core code
npm run watch-edu-core

# Terminal 2: Watch React shell
npm run watch-edu-react

# Terminal 3: Run application
./scripts/code.sh --verbose --log trace
```

## Production Build

### 1. Optimize Build

```bash
# Set production environment
export NODE_ENV=production

# Build with optimizations
npm run build-edu

# This creates optimized bundles in dist/edu-platform/
```

### 2. Build Configuration

Edit `build/edu/webpack.config.js` for production optimizations:

```javascript
module.exports = {
  mode: 'production',
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10
        }
      }
    }
  },
  performance: {
    maxAssetSize: 512000,
    maxEntrypointSize: 512000
  }
};
```

### 3. Verify Build

```bash
# Check build output
ls -lh dist/edu-platform/

# Run production build locally
npm run serve-production

# Run smoke tests
npm run smoketest
```

## Deployment

### Option 1: Firebase Hosting (Recommended for Web App)

**Advantages**: Free tier, automatic SSL, CDN, simple deployment

#### Setup

1. **Initialize Firebase**:

```bash
firebase login
firebase init hosting

# Select your project
# Set public directory: dist/edu-platform/web
# Configure as single-page app: Yes
# Set up automatic builds: No (we'll use GitHub Actions)
```

2. **Configure `firebase.json`**:

```json
{
  "hosting": {
    "public": "dist/edu-platform/web",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        "source": "**/*.@(jpg|jpeg|gif|png|svg|webp)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=2592000"
          }
        ]
      }
    ]
  }
}
```

3. **Deploy**:

```bash
# Build first
npm run build-edu

# Deploy to Firebase
firebase deploy --only hosting

# Your app is now live at: https://your-project.web.app
```

#### Custom Domain

1. Go to Firebase Console → Hosting
2. Click "Add custom domain"
3. Follow DNS configuration steps
4. Wait for SSL certificate provisioning (can take up to 24 hours)

### Option 2: Vercel

**Advantages**: Edge network, automatic previews, GitHub integration

#### Setup

1. **Install Vercel CLI**:

```bash
npm i -g vercel
vercel login
```

2. **Create `vercel.json`**:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist/edu-platform/web"
      }
    }
  ],
  "routes": [
    {
      "src": "/static/(.*)",
      "headers": {
        "cache-control": "public, max-age=31536000, immutable"
      },
      "dest": "/static/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

3. **Deploy**:

```bash
vercel --prod
```

### Option 3: Netlify

**Advantages**: Free tier, drag-and-drop, form handling

#### Setup

1. **Create `netlify.toml`**:

```toml
[build]
  command = "npm run build-edu"
  publish = "dist/edu-platform/web"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/static/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

2. **Deploy via CLI**:

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

Or deploy via Netlify website (drag & drop `dist/edu-platform/web` folder).

### Deploy Compiler API

#### Google Cloud Run (Free Tier: 2M requests/month)

```bash
# Install gcloud CLI
# https://cloud.google.com/sdk/docs/install

# Login and set project
gcloud auth login
gcloud config set project your-project-id

# Deploy
cd compiler-api
gcloud run deploy compiler-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "API_KEY=$COMPILER_API_KEY"

# Get URL
gcloud run services describe compiler-api --format='value(status.url)'

# Update .env with deployed URL
```

## Post-Deployment Configuration

### 1. Environment Variables on Hosting Platform

**Firebase Hosting**: Use Firebase Functions for environment variables
**Vercel**: Add in Project Settings → Environment Variables
**Netlify**: Add in Site Settings → Build & Deploy → Environment

### 2. Configure CORS

Add allowed origins to your API:

```typescript
// Compiler API
const cors = require('cors');
app.use(cors({
  origin: [
    'https://your-project.web.app',
    'https://yourdomain.com',
    'http://localhost:8080' // Development
  ]
}));
```

### 3. Setup Monitoring

**Firebase Analytics**:
```typescript
import { getAnalytics } from 'firebase/analytics';
const analytics = getAnalytics(app);
```

**Sentry** (Error Tracking):
```bash
npm install @sentry/react @sentry/tracing

# Add to .env
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

### 4. Configure Backup

**Firestore Backup**:
```bash
# Schedule daily backups
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d
```

### 5. Setup Alerts

Create alerts for:
- High error rate
- Low authentication success rate
- Compiler API failures
- High cost usage

## CI/CD Setup

See [docs/edu/ci-workflows.md](./ci-workflows.md) for complete examples.

### Quick Start with GitHub Actions

Create `.github/workflows/deploy-edu.yml`:

```yaml
name: Deploy Education Platform

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build-edu
        env:
          NODE_ENV: production
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
      
      - name: Run tests
        run: npm test
      
      - name: Deploy to Firebase
        if: github.ref == 'refs/heads/main'
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: ${{ secrets.FIREBASE_PROJECT_ID }}
```

## Troubleshooting

### Build Failures

**Error**: `Cannot find module 'typescript'`
```bash
# Solution: Rebuild node_modules
rm -rf node_modules package-lock.json
npm install
```

**Error**: `Electron download failed`
```bash
# Solution: Use proxy or different mirror
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install
```

### Firebase Issues

**Error**: `Permission denied` on Firestore operations
```bash
# Solution: Check Firestore security rules
firebase firestore:rules:get
# Verify your rules allow the operation
```

**Error**: `Firebase app not initialized`
```bash
# Solution: Verify .env file has all Firebase variables
# Check that VITE_ prefix is used for client-side variables
```

### Compiler API Issues

**Error**: `Connection refused to compiler API`
```bash
# Solution: Verify API is running
docker-compose ps
curl http://localhost:3000/api/v1/health

# Check firewall rules
sudo ufw status
```

**Error**: `Code execution timeout`
```bash
# Solution: Increase timeout in docker-compose.yml
MAX_EXECUTION_TIME=30000  # Increase to 30 seconds
docker-compose restart
```

### Deployment Issues

**Error**: `Firebase deploy fails with auth error`
```bash
# Solution: Re-authenticate
firebase logout
firebase login
firebase deploy
```

**Error**: `Vercel build fails`
```bash
# Solution: Check build command and output directory
# Verify vercel.json matches actual build output
vercel logs
```

## Validation Checklist

After setup, verify:

- [ ] Application loads without errors
- [ ] User can register and login
- [ ] Firestore rules prevent unauthorized access
- [ ] Code execution works for all supported languages
- [ ] AI sidebar responds to queries
- [ ] Notebooks save and load correctly
- [ ] Real-time collaboration works
- [ ] HTTPS is enforced
- [ ] Error tracking is working (check Sentry)
- [ ] Analytics is recording events
- [ ] All environment variables are set correctly
- [ ] Monitoring alerts are configured

## Next Steps

1. Review [Architecture Documentation](./architecture.md)
2. Set up [CI/CD Workflows](./ci-workflows.md)
3. Configure [Performance Monitoring](./performance.md)
4. Review [Security Best Practices](./security.md)

## Support

For issues or questions:
- Check [Troubleshooting](#troubleshooting) section above
- Review existing GitHub issues
- Create a new issue with detailed error logs
- Contact platform administrators

## Tested Environments

This setup guide has been validated in:
- Ubuntu 22.04 LTS
- macOS 13 (Ventura)
- Windows 11 with WSL2 (Ubuntu 22.04)

Last validated: [Current Date]
Validator: [Your Name/Team]
