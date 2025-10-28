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
    console.error('Please set these variables in your .env file or environment');
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
  
  if (!projectId) {
    console.error(`❌ Firebase project ID not set for ${environment}`);
    console.error(`Please set FIREBASE_PROJECT_ID_${environment.toUpperCase()} environment variable`);
    process.exit(1);
  }
  
  try {
    exec(`firebase deploy --only hosting --project ${projectId}`);
    console.log('✅ Firebase deployment complete');
  } catch (error) {
    console.error('❌ Firebase deployment failed');
    console.error('Make sure you have firebase-tools installed: npm install -g firebase-tools');
    console.error('And authenticated: firebase login');
    throw error;
  }
}

function deployCompilerApi() {
  console.log('🔧 Deploying Compiler API...');
  
  const region = 'us-central1';
  const serviceName = `compiler-api-${environment}`;
  const compilerApiPath = path.join(__dirname, '../compiler-api');
  
  if (!fs.existsSync(compilerApiPath)) {
    console.warn('⚠️  Compiler API directory not found, skipping API deployment');
    return;
  }
  
  try {
    exec(`gcloud run deploy ${serviceName} \
      --source ${compilerApiPath} \
      --platform managed \
      --region ${region} \
      --allow-unauthenticated`, { cwd: process.cwd() });
    console.log('✅ Compiler API deployed');
  } catch (error) {
    console.error('❌ Compiler API deployment failed');
    console.error('Make sure you have gcloud CLI installed and authenticated');
    throw error;
  }
}

function updateVersionFile() {
  console.log('📝 Updating version file...');
  
  const version = {
    version: require('../package.json').version,
    buildTime: new Date().toISOString(),
    environment,
    commit: (() => {
      try {
        return execSync('git rev-parse HEAD').toString().trim();
      } catch (e) {
        return 'unknown';
      }
    })()
  };
  
  const distPath = path.join(__dirname, '../dist/edu-platform');
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
  }
  
  const versionPath = path.join(distPath, 'version.json');
  fs.writeFileSync(versionPath, JSON.stringify(version, null, 2));
  
  console.log(`✅ Version file updated: ${version.version}`);
}

function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   VS Code Education Platform Deployment Script       ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
  
  try {
    checkEnvironment();
    build();
    updateVersionFile();
    deployToFirebase();
    
    if (args.includes('--with-api')) {
      deployCompilerApi();
    }
    
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║   🎉 Deployment completed successfully!              ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🌐 URL: https://${environment}.your-edu-platform.com`);
    console.log('');
  } catch (error) {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║   ❌ Deployment failed                                ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');
    console.error('Error:', error.message);
    console.log('');
    console.log('For help, see: docs/edu/setup.md');
    process.exit(1);
  }
}

main();
