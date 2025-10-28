# VS Code Education Platform Documentation

Welcome to the VS Code Education Platform documentation. This platform extends the open-source VS Code (Code - OSS) with specialized features for teaching and learning programming.

## 📚 Documentation Index

### Getting Started

- **[🚀 Quick Start Guide](../../DEPLOY.md)** - Get up and running in 5 minutes
- **[⚙️ Complete Setup Instructions](./setup.md)** - Detailed environment setup, Firebase configuration, and deployment
- **[📐 Architecture Overview](./architecture.md)** - System design, components, and technical architecture

### Deployment & Operations

- **[🔄 CI/CD Workflows](./ci-workflows.md)** - Automated deployment examples for GitHub Actions, GitLab CI, CircleCI, and Azure Pipelines
- **[🛠️ Build Scripts](./ci-workflows.md#build-scripts)** - Custom build and deployment scripts
- **[☁️ Hosting Options](./setup.md#deployment)** - Firebase Hosting, Vercel, Netlify deployment guides

### Configuration

- **[🔐 Firebase Setup](./setup.md#firebase-configuration)** - Authentication, Firestore, security rules, and indexes
- **[⚡ Compiler API](./setup.md#universal-compiler-api-setup)** - Code execution backend configuration
- **[🤖 AI Provider Setup](./setup.md#ai-provider-configuration)** - OpenAI and Anthropic integration

### Best Practices

- **[🚀 Performance Guidelines](./architecture.md#performance-considerations)** - Lazy loading, optimization strategies
- **[🔒 Security Checklist](./architecture.md#security-considerations)** - Authentication, token handling, sandboxing
- **[♿ Accessibility](./architecture.md#accessibility-features)** - WCAG compliance, ARIA, keyboard navigation

## 🎯 What is the Education Platform?

The VS Code Education Platform is a specialized distribution of VS Code designed for educational environments. It provides:

### Core Features

1. **Interactive Notebook Environment**
   - Execute code in multiple programming languages
   - Real-time output streaming
   - Cell-based editing with markdown support
   - Automatic version history

2. **AI-Powered Learning Assistant**
   - Code explanation and documentation
   - Error diagnosis and fix suggestions
   - Concept explanations with examples
   - Natural language to code translation

3. **Cloud-Based Code Execution**
   - Sandboxed execution environment
   - Multiple language support (Python, JavaScript, Java, C++, etc.)
   - Resource limits and timeout controls
   - Security isolation

4. **Collaborative Features**
   - Real-time notebook sharing
   - Assignment creation and submission
   - Progress tracking and analytics
   - Instructor dashboards

5. **Firebase Integration**
   - User authentication (email/password, Google OAuth)
   - Cloud data persistence with Firestore
   - Real-time synchronization
   - Role-based access control

## 🏗️ Architecture at a Glance

```
┌──────────────────────────────────────────────────┐
│           Frontend (React + Monaco)              │
│  ┌─────────────┐  ┌──────────┐  ┌────────────┐ │
│  │ React Shell │  │AI Sidebar│  │  Notebook  │ │
│  └─────────────┘  └──────────┘  └────────────┘ │
└──────────────────┬───────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
   ┌─────────┐ ┌──────┐ ┌─────────┐
   │Firebase │ │ AI   │ │Compiler │
   │Auth/DB  │ │ API  │ │  API    │
   └─────────┘ └──────┘ └─────────┘
```

See [architecture.md](./architecture.md) for complete diagrams and technical details.

## 🚦 Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- Firebase account
- AI provider account (OpenAI or Anthropic)
- Docker (for Compiler API)

### 5-Minute Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your Firebase and AI provider credentials

# 3. Build
npm run build-edu

# 4. Deploy
firebase deploy --only hosting
```

For detailed instructions, see [setup.md](./setup.md).

## 📦 Build Commands

| Command | Description |
|---------|-------------|
| `npm run build-edu` | Build production bundle |
| `npm run watch-edu` | Development mode with hot reload |
| `npm run deploy-edu` | Build and deploy to production |
| `npm run deploy-edu-staging` | Deploy to staging environment |
| `npm run version-bump [major\|minor\|patch]` | Increment version number |

## 🌐 Deployment Options

### Recommended: Firebase Hosting

**Pros**: Free tier, automatic SSL, global CDN, simple deployment

```bash
firebase login
firebase init hosting
firebase deploy
```

### Alternative: Vercel

**Pros**: Preview deployments, GitHub integration

```bash
vercel --prod
```

### Alternative: Netlify

**Pros**: Drag-and-drop deployment, forms support

```bash
netlify deploy --prod
```

See [setup.md](./setup.md#deployment) for complete deployment guides.

## 🔧 Configuration Files

### Required Files

- **`.env`** - Environment variables (Firebase, AI providers, API keys)
- **`firebase.json`** - Firebase Hosting configuration
- **`.github/workflows/deploy-edu.yml`** - CI/CD automation (optional)

### Example `.env`

```bash
# Firebase
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id

# AI Provider
OPENAI_API_KEY=sk-...
AI_PROVIDER=openai

# Compiler API
COMPILER_API_URL=https://compiler-api.yourdomain.com/api/v1
COMPILER_API_KEY=your_api_key
```

See [setup.md](./setup.md#environment-variables) for complete configuration.

## 🎓 Educational Use Cases

### For Students

- Learn programming with interactive notebooks
- Get instant AI assistance for coding questions
- Execute code safely in the cloud
- Collaborate on projects in real-time
- Track learning progress

### For Instructors

- Create and distribute coding assignments
- Monitor student progress
- Provide real-time feedback
- Grade submissions automatically
- Manage classroom resources

### For Institutions

- Deploy a custom learning environment
- Control user access and permissions
- Host on your own infrastructure
- Customize branding and features
- Integrate with existing LMS

## 📊 Performance & Scalability

### Free Tier Limits

- **Firebase**: 10 GB storage, 360 MB/day transfer, 50K reads/day
- **Vercel**: Unlimited deployments, 100 GB bandwidth
- **OpenAI**: $5 free credit (~33K tokens with GPT-3.5)
- **Google Cloud Run**: 2M requests/month

### Optimization Strategies

- Lazy loading for features
- Code splitting for bundles
- Response caching for AI queries
- Firestore query optimization
- CDN for static assets

See [architecture.md](./architecture.md#performance-considerations) for detailed guidelines.

## 🔐 Security

### Built-in Security Features

- Firebase Authentication with JWT tokens
- Firestore security rules
- Sandboxed code execution
- Rate limiting on APIs
- HTTPS enforcement
- Input sanitization

### Security Checklist

- [ ] Environment variables secured
- [ ] Firebase security rules configured
- [ ] API keys rotated regularly
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] Monitoring and alerts active

See [architecture.md](./architecture.md#security-considerations) for complete security guidelines.

## ♿ Accessibility

The platform follows WCAG 2.1 Level AA standards:

- Keyboard navigation support
- Screen reader compatibility
- High contrast themes
- Focus indicators
- ARIA annotations
- Resizable text

See [architecture.md](./architecture.md#accessibility-features) for accessibility checklist.

## 🐛 Troubleshooting

### Common Issues

**Build fails**: Clear cache and rebuild
```bash
rm -rf node_modules package-lock.json
npm install
npm run build-edu
```

**Firebase deploy fails**: Re-authenticate
```bash
firebase logout
firebase login
firebase deploy
```

**Environment variables not working**: Check `.env` file and restart dev server

See [setup.md](./setup.md#troubleshooting) for complete troubleshooting guide.

## 📖 Additional Resources

### External Documentation

- [VS Code Architecture](https://github.com/microsoft/vscode/wiki/Source-Code-Organization)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/index.html)
- [Firebase Documentation](https://firebase.google.com/docs)
- [React Documentation](https://react.dev/learn)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Community

- [VS Code Repository](https://github.com/microsoft/vscode)
- [VS Code Discussions](https://github.com/microsoft/vscode-discussions)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/vscode)

## 🤝 Contributing

Contributions to the education platform are welcome! Please:

1. Review the architecture documentation
2. Follow the coding style in existing files
3. Add tests for new features
4. Update documentation as needed
5. Submit a pull request

## 📝 License

The VS Code Education Platform is built on Code - OSS, which is licensed under the [MIT License](../../LICENSE.txt).

## 🆘 Support

- **Documentation Issues**: File an issue on GitHub
- **Setup Help**: See [setup.md](./setup.md) troubleshooting section
- **Feature Requests**: Open a GitHub issue with the `edu-platform` label
- **Security Issues**: Report privately to security team

## ✅ Validation Status

This documentation has been validated on:

- **Ubuntu 22.04 LTS** ✅
- **macOS 13 (Ventura)** ✅
- **Windows 11 (WSL2)** ✅

**Last Updated**: January 2024
**Documentation Version**: 1.0.0

---

**Next Steps**:
1. Start with [Quick Start Guide](../../DEPLOY.md)
2. Follow [Complete Setup](./setup.md)
3. Review [Architecture](./architecture.md)
4. Set up [CI/CD](./ci-workflows.md)
