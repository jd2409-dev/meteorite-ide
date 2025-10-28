# Education Platform Architecture

## Overview

The VS Code Education Platform extends the core Code - OSS repository with specialized features for educational environments, including interactive notebook execution, AI-powered assistance, and cloud-based code compilation. This document outlines the architecture, key components, and integration points.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Education Platform                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  React Shell   │  │ AI Sidebar   │  │ Notebook Editor  │   │
│  │   (Frontend)   │  │  Component   │  │   (Monaco +)     │   │
│  └────────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│           │                  │                    │              │
│           └──────────────────┴────────────────────┘              │
│                              │                                   │
│                    ┌─────────▼──────────┐                       │
│                    │  Core VSCode OSS   │                       │
│                    │   Workbench API    │                       │
│                    └─────────┬──────────┘                       │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               │ REST/WebSocket APIs
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌─────────────────┐    ┌────────────────┐
│   Firebase    │    │ Universal       │    │  AI Provider   │
│  (Auth +      │    │  Compiler API   │    │  (OpenAI /     │
│   Firestore)  │    │  (Multi-lang)   │    │   Anthropic)   │
└───────────────┘    └─────────────────┘    └────────────────┘
```

## Core Components

### 1. React Shell

The React shell provides a modern, responsive UI layer that wraps the VS Code workbench with additional educational features.

**Location**: `src/edu/react-shell/`

**Key Features**:
- Custom navigation and layout management
- Student/instructor role-based views
- Assignment management interface
- Progress tracking dashboard
- Integration with Firebase authentication state

**Technology Stack**:
- React 18+ with hooks
- TypeScript for type safety
- VS Code Webview API for embedding Monaco editor
- Context API for state management

**Build Output**:
- `out/edu/react-shell/bundle.js` - Main React bundle
- `out/edu/react-shell/styles.css` - Compiled styles
- Lazy-loaded chunks for different views

### 2. Notebook Execution Pipeline

Builds upon VS Code's native notebook support to provide interactive code execution with educational features.

**Location**: `extensions/edu-notebook/`

**Architecture**:

```
┌────────────────────────────────────────────────────┐
│              Notebook Document                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Cell 1  │  │  Cell 2  │  │  Cell 3  │        │
│  │  (code)  │  │  (md)    │  │  (code)  │        │
│  └────┬─────┘  └──────────┘  └────┬─────┘        │
│       │                             │              │
└───────┼─────────────────────────────┼──────────────┘
        │                             │
        │    ┌────────────────────────┘
        │    │
        ▼    ▼
   ┌────────────────────┐
   │  Kernel Manager    │
   │  - Local Kernels   │
   │  - Remote Kernels  │
   │  - Cloud Execution │
   └─────────┬──────────┘
             │
             ▼
   ┌─────────────────────────┐
   │ Universal Compiler API  │
   │ - Language Detection    │
   │ - Sandboxed Execution   │
   │ - Resource Limits       │
   │ - Output Streaming      │
   └─────────────────────────┘
```

**Key Features**:
- Support for multiple languages (Python, JavaScript, Java, C++)
- Real-time execution with streaming output
- Code cell execution history and versioning
- Integration with AI sidebar for code explanation
- Automatic save to Firestore
- Collaborative editing via Firestore real-time sync

**Execution Flow**:
1. User triggers cell execution
2. Code is validated and sent to Universal Compiler API
3. API returns execution results (stdout, stderr, return value)
4. Results are rendered in output cell
5. Execution metadata saved to Firestore

### 3. AI Sidebar

Provides context-aware AI assistance for learning and code development.

**Location**: `src/edu/ai-sidebar/`

**Features**:
- Code explanation and documentation generation
- Error diagnosis and fix suggestions
- Concept explanation with examples
- Step-by-step debugging assistance
- Natural language to code translation
- Assignment feedback and grading assistance (instructor mode)

**Integration Points**:
```typescript
interface AISidebarService {
  // Get AI explanation for selected code
  explainCode(code: string, language: string): Promise<string>;
  
  // Get suggestions for fixing errors
  suggestFix(error: string, code: string): Promise<FixSuggestion[]>;
  
  // Convert natural language to code
  generateCode(prompt: string, language: string): Promise<string>;
  
  // Provide contextual help
  getContextualHelp(context: EditorContext): Promise<HelpContent>;
}
```

**Architecture**:
- Frontend: React component in sidebar container
- Backend: AI provider abstraction layer
- Supported providers: OpenAI GPT-4, Anthropic Claude
- Token usage tracking and rate limiting
- Caching layer for common queries

### 4. Firebase Integration

Firebase provides authentication, real-time data sync, and cloud storage.

**Services Used**:

#### Firebase Authentication
- Email/password authentication
- Google OAuth integration
- Role-based access control (student, instructor, admin)
- JWT token management

#### Firestore Database
```
collections/
├── users/
│   ├── {userId}/
│   │   ├── profile: { name, email, role, createdAt }
│   │   ├── settings: { theme, preferences }
│   │   └── progress: { completedAssignments[], scores{} }
│   │
├── notebooks/
│   ├── {notebookId}/
│   │   ├── metadata: { title, author, createdAt, visibility }
│   │   ├── cells: [{ type, content, output, metadata }]
│   │   └── collaborators: { userId: permission }
│   │
├── assignments/
│   ├── {assignmentId}/
│   │   ├── details: { title, description, dueDate }
│   │   ├── starterCode: { language, files[] }
│   │   └── submissions: {userId: submissionData}
│   │
└── executions/
    ├── {executionId}/
        ├── code: string
        ├── language: string
        ├── output: { stdout, stderr, returnValue }
        └── timestamp: Date
```

**Security Rules**:
```javascript
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own profile
    match /users/{userId} {
      allow read: if request.auth.uid == userId;
      allow write: if request.auth.uid == userId;
    }
    
    // Notebooks access based on visibility and collaboration
    match /notebooks/{notebookId} {
      allow read: if resource.data.visibility == 'public' 
                  || request.auth.uid == resource.data.author
                  || request.auth.uid in resource.data.collaborators;
      allow write: if request.auth.uid == resource.data.author;
    }
    
    // Only instructors can create assignments
    match /assignments/{assignmentId} {
      allow read: if request.auth != null;
      allow create: if request.auth.token.role == 'instructor';
      allow update, delete: if request.auth.uid == resource.data.instructor;
    }
  }
}
```

### 5. Universal Compiler API

A backend service that provides sandboxed code execution for multiple programming languages.

**Endpoints**:
```
POST /api/v1/execute
  Body: {
    language: string,
    code: string,
    stdin?: string,
    timeout?: number,
    memory_limit?: number
  }
  Response: {
    stdout: string,
    stderr: string,
    exit_code: number,
    execution_time: number,
    memory_used: number
  }

GET /api/v1/languages
  Response: {
    languages: [
      { name: "python", version: "3.11", available: true },
      { name: "javascript", version: "Node 20", available: true },
      ...
    ]
  }

POST /api/v1/stream-execute
  (WebSocket endpoint for streaming execution output)
```

**Security Features**:
- Sandboxed execution using Docker containers
- Resource limits (CPU, memory, time)
- Network isolation
- File system restrictions
- API key authentication
- Rate limiting per user/IP

**Supported Languages**:
- Python 3.11+
- JavaScript (Node.js 20+)
- Java 17+
- C++ (GCC 12+)
- C (GCC 12+)
- Go 1.21+
- Rust 1.70+

## Build System

### Build Scripts

The education platform extends the standard VS Code build process with custom targets:

```json
{
  "scripts": {
    "build-edu": "gulp compile && gulp compile-edu-extensions && npm run build-edu-react",
    "build-edu-react": "webpack --config build/edu/webpack.config.js",
    "compile-edu-extensions": "gulp compile-extensions --filter edu-*",
    "watch-edu": "npm-run-all -p watch-edu-core watch-edu-react",
    "watch-edu-core": "gulp watch-edu",
    "watch-edu-react": "webpack --watch --config build/edu/webpack.config.js",
    "deploy-edu": "node scripts/deploy-edu.js"
  }
}
```

### Build Outputs

**Development Build**:
- `out/edu/` - Compiled TypeScript education extensions
- `out/edu/react-shell/` - React application bundle
- `out/vs/` - Core VS Code components (shared)

**Production Build**:
- `dist/edu-platform/` - Complete deployable application
  - `app/` - Electron application (for desktop)
  - `web/` - Web application bundle
  - `server/` - Remote server components
  - `extensions/` - Bundled education extensions
  - `assets/` - Static resources (images, fonts)

**Bundle Optimization**:
- Code splitting for lazy loading of features
- Tree shaking to remove unused code
- Minification and compression
- Source maps (development only)

## Client-Service Interactions

### Authentication Flow

```
Client                  Firebase Auth              Backend API
  │                          │                          │
  │  1. Login Request        │                          │
  ├─────────────────────────>│                          │
  │                          │                          │
  │  2. ID Token             │                          │
  │<─────────────────────────┤                          │
  │                          │                          │
  │  3. API Request + Token  │                          │
  ├─────────────────────────────────────────────────────>│
  │                          │                          │
  │                          │  4. Verify Token         │
  │                          │<─────────────────────────┤
  │                          │                          │
  │                          │  5. Token Valid          │
  │                          │─────────────────────────>│
  │                          │                          │
  │  6. API Response         │                          │
  │<─────────────────────────────────────────────────────┤
  │                          │                          │
```

### Code Execution Flow

```
Monaco Editor       React Shell       Compiler API      Firestore
      │                 │                  │                │
      │ Execute Cell    │                  │                │
      ├────────────────>│                  │                │
      │                 │                  │                │
      │                 │  POST /execute   │                │
      │                 ├─────────────────>│                │
      │                 │                  │                │
      │                 │  Stream Output   │                │
      │                 │<─────────────────┤                │
      │                 │                  │                │
      │ Display Output  │                  │                │
      │<────────────────┤                  │                │
      │                 │                  │                │
      │                 │  Save Execution  │                │
      │                 ├────────────────────────────────────>│
      │                 │                  │                │
      │                 │  Confirm Save    │                │
      │                 │<────────────────────────────────────┤
      │                 │                  │                │
```

### Real-time Collaboration

```
User A              Firestore           User B
  │                     │                 │
  │ Edit Cell           │                 │
  ├────────────────────>│                 │
  │                     │                 │
  │                     │ onSnapshot      │
  │                     ├────────────────>│
  │                     │                 │
  │                     │ Update Editor   │
  │                     │                 │
```

## Performance Considerations

### Lazy Loading Strategy

1. **Initial Load**: Load minimal shell + authentication
2. **On Login**: Load user preferences + recent notebooks
3. **On Feature Use**: 
   - AI Sidebar: Load when first opened
   - Advanced editor features: Load on first use
   - Language-specific features: Load per language

### Optimization Checklist

- [ ] React components use `React.memo()` for expensive renders
- [ ] Code editor uses virtualization for large files
- [ ] Notebook cells render incrementally (viewport-based)
- [ ] Monaco editor loads language modes on demand
- [ ] Static assets served via CDN with caching headers
- [ ] API responses cached with appropriate TTL
- [ ] Firestore queries use indexes and limits
- [ ] WebSocket connections pooled and reused
- [ ] Service worker caches core application files

## Security Considerations

### Authentication Token Handling

```typescript
// Token refresh pattern
class AuthService {
  private tokenRefreshInterval: NodeJS.Timeout;
  
  async initialize() {
    // Refresh token before expiry
    this.tokenRefreshInterval = setInterval(() => {
      this.refreshIdToken();
    }, 50 * 60 * 1000); // 50 minutes (tokens expire at 60)
  }
  
  async refreshIdToken() {
    const user = auth.currentUser;
    if (user) {
      await user.getIdToken(true); // Force refresh
    }
  }
  
  async getAuthHeader() {
    const token = await auth.currentUser?.getIdToken();
    return `Bearer ${token}`;
  }
}
```

### Security Checklist

- [ ] All API requests include authentication token
- [ ] Tokens stored in memory, never localStorage
- [ ] HTTPS enforced for all connections
- [ ] Content Security Policy headers configured
- [ ] XSS protection via input sanitization
- [ ] CSRF tokens for state-changing operations
- [ ] Rate limiting on API endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] Code execution sandboxing with resource limits
- [ ] User data encrypted at rest (Firestore)
- [ ] Sensitive environment variables never committed
- [ ] Regular dependency vulnerability scans

## Accessibility Features

### ARIA Coverage

The education platform follows WCAG 2.1 Level AA standards:

**Keyboard Navigation**:
- All interactive elements accessible via keyboard
- Focus indicators visible on all focusable elements
- Logical tab order throughout the application
- Escape key closes modals and dialogs

**Screen Reader Support**:
```typescript
// Example ARIA annotations
<button
  aria-label="Execute code cell"
  aria-pressed={isRunning}
  aria-describedby="execution-status"
>
  <PlayIcon aria-hidden="true" />
</button>

<div
  id="execution-status"
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {executionStatus}
</div>
```

**Visual Accessibility**:
- High contrast theme support
- Minimum 4.5:1 contrast ratio for text
- Resizable text up to 200% without layout breaks
- No information conveyed by color alone
- Reduced motion preferences respected

### Accessibility Checklist

- [ ] All images have alt text
- [ ] Form inputs have associated labels
- [ ] Error messages clearly associated with inputs
- [ ] Dynamic content changes announced to screen readers
- [ ] Skip links for main content navigation
- [ ] Landmark regions defined (header, nav, main, footer)
- [ ] Heading hierarchy is logical (h1 -> h2 -> h3)
- [ ] Focus trap in modals
- [ ] Color contrast meets WCAG AA standards
- [ ] Keyboard shortcuts don't conflict with screen readers

## Monitoring and Observability

### Key Metrics

1. **Performance**:
   - Time to Interactive (TTI)
   - First Contentful Paint (FCP)
   - Largest Contentful Paint (LCP)
   - API response times
   - Code execution times

2. **Usage**:
   - Active users (DAU/MAU)
   - Notebook executions per day
   - AI sidebar queries per user
   - Assignment submissions
   - Collaboration sessions

3. **Errors**:
   - Client-side error rate
   - API error rate (4xx, 5xx)
   - Code execution failures
   - Authentication failures

### Logging Strategy

```typescript
interface LogEvent {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  metadata?: Record<string, any>;
  userId?: string;
}

// Client-side logging
logger.info('notebook_executed', {
  notebookId: notebook.id,
  language: 'python',
  executionTime: 1234,
  success: true
});

// Server-side structured logging
logger.error('compiler_api_error', {
  endpoint: '/api/v1/execute',
  statusCode: 500,
  error: err.message,
  userId: req.user.id
});
```

## Technology Stack Summary

| Component | Technologies |
|-----------|-------------|
| Frontend Shell | React 18, TypeScript, Webpack |
| Editor | Monaco Editor (VS Code core) |
| Authentication | Firebase Auth |
| Database | Firestore |
| Backend API | Node.js, Express, TypeScript |
| Code Execution | Docker, Language-specific runtimes |
| AI Integration | OpenAI API, Anthropic API |
| Build System | Gulp, Webpack, TypeScript compiler |
| Testing | Mocha, Playwright, Jest (React) |
| Deployment | Firebase Hosting, Cloud Run (API) |
| CI/CD | GitHub Actions |

## Migration from Stock Code OSS

### Key Differences

1. **Additional UI Layer**: React shell wraps the standard workbench
2. **Cloud Integration**: Firebase replaces local storage for persistence
3. **Remote Execution**: Code runs on cloud infrastructure vs. local Node.js
4. **AI Features**: Built-in AI assistance not present in stock VS Code
5. **Role-Based Access**: Educational roles and permissions system
6. **Assignment System**: Custom workflow for educational assignments

### Compatibility

- Standard VS Code extensions still work
- Can import/export to standard VS Code format
- Monaco editor maintains full API compatibility
- Keyboard shortcuts and themes compatible

## Future Enhancements

1. **Live Classroom Mode**: Real-time instructor screen sharing
2. **Automated Grading**: AI-powered assignment evaluation
3. **Progress Analytics**: Detailed student progress dashboards
4. **Peer Review System**: Student code review workflows
5. **Offline Mode**: Service worker-based offline support
6. **Mobile Support**: Responsive design for tablets and phones
7. **Video Integration**: Embedded instructional videos
8. **Gamification**: Badges and achievements for learning milestones

## References

- [VS Code Architecture](https://github.com/microsoft/vscode/wiki/Source-Code-Organization)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/index.html)
- [Firebase Documentation](https://firebase.google.com/docs)
- [React Best Practices](https://react.dev/learn)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
