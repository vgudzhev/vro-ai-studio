import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

export interface WorkspaceContext {
  os: string;
  javaVersion: string | null;
  mavenVersion: string | null;
  nodeVersion: string | null;
  hasSettingsXml: boolean;
  hasPackagingProfile: boolean;
  hasVroProfile: boolean;
  workspacePomType: string | null;
  vroTypesVersion: string | null;
  activeProfile: string | null;
  healthIssues: string[];
}

function tryExec(cmd: string): string | null {
  try {
    return execSync(cmd, { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function parseJavaVersion(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/version "([^"]+)"/);
  return m ? m[1] : raw.split('\n')[0];
}

function parseMvnVersion(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/Apache Maven ([\d.]+)/);
  return m ? m[1] : null;
}

function parseNodeVersion(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/^v/, '');
}

export async function gatherWorkspaceContext(): Promise<WorkspaceContext> {
  const ctx: WorkspaceContext = {
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    javaVersion: null,
    mavenVersion: null,
    nodeVersion: null,
    hasSettingsXml: false,
    hasPackagingProfile: false,
    hasVroProfile: false,
    workspacePomType: null,
    vroTypesVersion: null,
    activeProfile: null,
    healthIssues: [],
  };

  // ── Runtime versions ────────────────────────────────────────────────────────
  ctx.javaVersion = parseJavaVersion(tryExec('java -version 2>&1'));
  ctx.mavenVersion = parseMvnVersion(tryExec('mvn --version 2>&1'));
  ctx.nodeVersion = parseNodeVersion(tryExec('node --version 2>&1'));

  // ── Health checks ────────────────────────────────────────────────────────────
  if (!ctx.javaVersion) {
    ctx.healthIssues.push('Java not found — install JDK 17, 21, or 24');
  } else {
    const major = parseInt(ctx.javaVersion.split('.')[0]);
    if (![17, 21, 24].includes(major)) {
      ctx.healthIssues.push(`Java ${ctx.javaVersion} detected — VRBT requires JDK 17, 21, or 24`);
    }
  }
  if (!ctx.mavenVersion) {
    ctx.healthIssues.push('Maven not found — install Maven 3.9.x');
  } else {
    const [maj, min] = ctx.mavenVersion.split('.').map(Number);
    if (maj < 3 || (maj === 3 && min < 9)) {
      ctx.healthIssues.push(`Maven ${ctx.mavenVersion} is too old — upgrade to 3.9.x`);
    }
  }
  if (!ctx.nodeVersion) {
    ctx.healthIssues.push('Node.js not found — install Node.js 22.x');
  } else {
    const major = parseInt(ctx.nodeVersion.split('.')[0]);
    if (major < 18) {
      ctx.healthIssues.push(`Node.js ${ctx.nodeVersion} is too old — VRBT needs Node 22.x`);
    }
  }

  // ── ~/.m2/settings.xml ───────────────────────────────────────────────────────
  const settingsPath = path.join(os.homedir(), '.m2', 'settings.xml');
  if (fs.existsSync(settingsPath)) {
    ctx.hasSettingsXml = true;
    const xml = fs.readFileSync(settingsPath, 'utf8');
    ctx.hasPackagingProfile = xml.includes('<id>packaging</id>');
    ctx.hasVroProfile =
      xml.includes('vro.host') || xml.includes('vrang.host') || xml.includes('vro.refresh.token');
    if (!ctx.hasPackagingProfile) {
      ctx.healthIssues.push('~/.m2/settings.xml is missing the <packaging> profile with keystore config');
    }
    if (!ctx.hasVroProfile) {
      ctx.healthIssues.push('~/.m2/settings.xml has no vRO connection profile (vro.host / vro.refresh.token)');
    }
  } else {
    ctx.healthIssues.push('~/.m2/settings.xml not found — Maven configuration is required');
  }

  // ── Workspace pom.xml ────────────────────────────────────────────────────────
  const wsFolders = vscode.workspace.workspaceFolders;
  if (wsFolders && wsFolders.length > 0) {
    const pomPath = path.join(wsFolders[0].uri.fsPath, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      const pom = fs.readFileSync(pomPath, 'utf8');
      if (pom.includes('package-typescript-archetype')) ctx.workspacePomType = 'vRO TypeScript';
      else if (pom.includes('package-vra-ng-archetype')) ctx.workspacePomType = 'vRA + vRO (ng)';
      else if (pom.includes('package-polyglot-archetype')) ctx.workspacePomType = 'Polyglot (ABX)';
      else if (pom.includes('package-xml-archetype')) ctx.workspacePomType = 'vRO XML';
      else if (pom.includes('package-mixed-archetype')) ctx.workspacePomType = 'Mixed (JS + XML)';
      else ctx.workspacePomType = 'Unknown Maven project';
    }

    // ── vro-types version ──────────────────────────────────────────────────────
    const pkgPath = path.join(wsFolders[0].uri.fsPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        ctx.vroTypesVersion =
          pkg.dependencies?.['@vmware-pscoe/vro-types'] ||
          pkg.devDependencies?.['@vmware-pscoe/vro-types'] ||
          pkg.dependencies?.['vro-types'] ||
          pkg.devDependencies?.['vro-types'] ||
          null;
      } catch {}
    }

    // ── Active vRDT Maven profile ──────────────────────────────────────────────
    const vscodeCfg = path.join(wsFolders[0].uri.fsPath, '.vscode', 'settings.json');
    if (fs.existsSync(vscodeCfg)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(vscodeCfg, 'utf8'));
        ctx.activeProfile =
          cfg['vrdev.maven.profile'] || cfg['o11n.maven.profile'] || null;
      } catch {}
    }
  }

  return ctx;
}

export function formatContextForPrompt(ctx: WorkspaceContext): string {
  const lines: string[] = ['DEVELOPER ENVIRONMENT (auto-detected):'];
  lines.push(`OS: ${ctx.os}`);
  lines.push(`Java: ${ctx.javaVersion || 'NOT FOUND'}`);
  lines.push(`Maven: ${ctx.mavenVersion || 'NOT FOUND'}`);
  lines.push(`Node.js: ${ctx.nodeVersion || 'NOT FOUND'}`);
  lines.push(`~/.m2/settings.xml: ${ctx.hasSettingsXml ? 'present' : 'MISSING'}`);
  if (ctx.hasSettingsXml) {
    lines.push(`  packaging profile: ${ctx.hasPackagingProfile ? 'configured' : 'MISSING'}`);
    lines.push(`  vRO connection profile: ${ctx.hasVroProfile ? 'configured' : 'MISSING'}`);
  }
  if (ctx.workspacePomType) lines.push(`Workspace project type: ${ctx.workspacePomType}`);
  if (ctx.vroTypesVersion) lines.push(`vro-types version: ${ctx.vroTypesVersion}`);
  if (ctx.activeProfile) lines.push(`Active Maven profile (vRDT): ${ctx.activeProfile}`);
  if (ctx.healthIssues.length > 0) {
    lines.push('');
    lines.push('DETECTED ISSUES:');
    ctx.healthIssues.forEach((i) => lines.push(`  - ${i}`));
  } else {
    lines.push('Health: all checks passed');
  }
  return lines.join('\n');
}

export const ONBOARDING_SYSTEM = `You are a friendly expert onboarding assistant for Build Tools for VMware Aria (vRBT). Help developers set up their workstation and create their first vRO TypeScript project step by step.

KEY FACTS:
- Required: JDK 17/21/24, Maven 3.9.x, Node.js 22.x, VS Code + vRDT extension
- Health check: curl -o- https://raw.githubusercontent.com/vmware/build-tools-for-vmware-aria/main/health.sh | bash
- Windows health: Set-ExecutionPolicy Bypass -Scope Process -Force; Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/vmware/build-tools-for-vmware-aria/main/health.ps1'))

MAVEN SETTINGS (~/.m2/settings.xml) — required packaging profile:
\`\`\`xml
<profiles><profile><id>packaging</id><properties>
  <keystoreGroupId>com.vmware.pscoe.build</keystoreGroupId>
  <keystoreArtifactId>keystore.example</keystoreArtifactId>
  <keystoreVersion>4.19.0</keystoreVersion>
  <vroPrivateKeyPem>target/\${keystoreArtifactId}-\${keystoreVersion}/private_key.pem</vroPrivateKeyPem>
  <vroCertificatePem>target/\${keystoreArtifactId}-\${keystoreVersion}/cert.pem</vroCertificatePem>
  <vroKeyPass>VMware1!</vroKeyPass>
</properties></profile></profiles>
<activeProfiles><activeProfile>packaging</activeProfile></activeProfiles>
\`\`\`

vRO connection profile (add inside <profiles>):
\`\`\`xml
<profile><id>corp-dev</id><properties>
  <vro.host>YOUR_VRO_HOST</vro.host>
  <vro.port>443</vro.port>
  <vro.auth>vra</vro.auth>
  <vro.refresh.token>YOUR_TOKEN</vro.refresh.token>
  <vrang.host>YOUR_VRA_HOST</vrang.host>
  <vrang.port>443</vrang.port>
  <vrang.refresh.token>YOUR_TOKEN</vrang.refresh.token>
  <vrang.org.name>YOUR_ORG</vrang.org.name>
  <vrang.project.name>YOUR_PROJECT</vrang.project.name>
</properties></profile>
\`\`\`

CREATE FIRST PROJECT (vRO TypeScript):
\`\`\`bash
mvn archetype:generate -DinteractiveMode=false \\
  -DarchetypeGroupId=com.vmware.pscoe.o11n.archetypes \\
  -DarchetypeArtifactId=package-typescript-archetype \\
  -DarchetypeVersion=4.19.0 \\
  -DgroupId=com.yourcompany -DartifactId=my-vro-project
\`\`\`
Other archetypes: package-vra-ng-archetype (vRA+vRO), package-polyglot-archetype (PowerShell), package-xml-archetype, package-mixed-archetype

CONNECT & PUSH:
- Get refresh token: vRA UI → Settings → My Account → API Token → Generate
- Test connection: mvn vro:pull -P corp-dev
- Push: mvn vro:push -P corp-dev
- Full: mvn clean install vro:push -P corp-dev
- SSL issues: add <vrealize.ssl.ignore.certificate>true</vrealize.ssl.ignore.certificate> to profile

COMMON ERRORS:
- "Could not find goal push": archetype version mismatch
- BUILD FAILURE on compile: run mvn install in project root first
- Windows: use Command Prompt NOT PowerShell for mvn archetype:generate
- vRDT not showing: Ctrl+Shift+P → Developer: Reload Window
- Keystore errors: mvn clean install -f common/keystore-example/pom.xml

Keep responses concise. Use code blocks for commands. Reference the detected environment context when relevant. Be encouraging.`;

