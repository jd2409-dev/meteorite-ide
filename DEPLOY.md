# Education Platform Deployment Quick Start

This is a quick reference guide for deploying the VS Code Education Platform. For comprehensive documentation, see [docs/edu/](./docs/edu/).

## Quick Links

- **[Architecture Overview](./docs/edu/architecture.md)** - System design and components
- **[Complete Setup Guide](./docs/edu/setup.md)** - Detailed setup instructions
- **[CI/CD Workflows](./docs/edu/ci-workflows.md)** - Automated deployment examples

## Prerequisites

- Node.js 20+ and npm 10+
- Firebase account
- AI provider account (OpenAI or Anthropic)
- Docker (for Compiler API)

## Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
# Firebase
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Compiler API
COMPILER_API_URL=http://localhost:3000/api/v1
COMPILER_API_KEY=your_api_key

# AI Provider (choose one)
OPENAI_API_KEY=sk-...
AI_PROVIDER=openai
```

### 3. Build

```bash
npm run build-edu
```

### 4. Deploy

```bash
# Deploy to Firebase Hosting
firebase deploy --only hosting

# Deploy Compiler API to Cloud Run
cd compiler-api
gcloud run deploy compiler-api --source .
```

## Development

```bash
# Start development server
npm run watch-edu

# In another terminal
./scripts/code.sh
```

## Build Scripts

| Script | Description |
|--------|-------------|
| `npm run build-edu` | Build production bundle |
| `npm run watch-edu` | Watch mode for development |
| `npm run deploy-edu` | Build and deploy to production |
| `npm run deploy-edu-staging` | Deploy to staging environment |

## Deployment Targets

### Firebase Hosting (Web App)
- **Free Tier**: 10 GB storage, 360 MB/day transfer
- **Best for**: Static web application hosting
- **Setup**: See [setup.md](./docs/edu/setup.md#firebase-configuration)

### Vercel
- **Free Tier**: Unlimited deployments
- **Best for**: Preview deployments, automatic CI/CD
- **Setup**: `vercel --prod`

### Netlify
- **Free Tier**: 100 GB bandwidth/month
- **Best for**: Simple deployment, form handling
- **Setup**: Drag & drop `dist/edu-platform/web`

### Google Cloud Run (Compiler API)
- **Free Tier**: 2M requests/month
- **Best for**: Containerized backend services
- **Setup**: See [setup.md](./docs/edu/setup.md#universal-compiler-api-setup)

## Environment-Specific Configuration

### Development
```bash
NODE_ENV=development
npm run watch-edu
```

### Staging
```bash
NODE_ENV=staging
npm run deploy-edu-staging
```

### Production
```bash
NODE_ENV=production
npm run deploy-edu-production
```

## Verification Checklist

After deployment:

- [ ] Application loads without errors
- [ ] User can register and login
- [ ] Code execution works
- [ ] AI sidebar responds
- [ ] Firestore saves data
- [ ] HTTPS is enforced
- [ ] Analytics is recording

## Common Issues

### Build Fails
```bash
# Clear cache and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build-edu
```

### Firebase Deploy Fails
```bash
# Re-authenticate
firebase logout
firebase login
firebase deploy
```

### Environment Variables Not Working
- Ensure `.env` file exists
- Restart development server
- For client-side vars, use `VITE_` prefix

## Support

- 📖 [Full Documentation](./docs/edu/)
- 🐛 [Report Issues](https://github.com/microsoft/vscode/issues)
- 💬 [Discussions](https://github.com/microsoft/vscode-discussions)

## Security Notes

- Never commit `.env` file
- Rotate API keys regularly
- Use Firebase security rules
- Enable rate limiting
- Monitor for suspicious activity

## Next Steps

1. Review [architecture.md](./docs/edu/architecture.md) for system design
2. Follow [setup.md](./docs/edu/setup.md) for detailed configuration
3. Configure [CI/CD workflows](./docs/edu/ci-workflows.md)
4. Set up monitoring and alerts
5. Configure backup strategy

---

**Last Updated**: 2024
**Validated On**: Ubuntu 22.04, macOS 13, Windows 11 (WSL2)
