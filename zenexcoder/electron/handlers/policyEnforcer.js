const SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
  /password\s*[:=]\s*['"][^'"]+['"]/i,
  /secret\s*[:=]\s*['"][^'"]+['"]/i,
  /\beval\s*\(/i,
  /new\s+Function\s*\(/i,
  /https?:\/\/\d{1,3}(?:\.\d{1,3}){3}/i
];

const SYSTEM_DESTRUCTION_PATTERNS = [
  /(?:del|rmdir|rm|erase)\s+(?:[\/\\][a-z0-9_-]+\s+)*[a-z]:\\windows(?:\\system32)?/i,
  /c:\\windows\\system32/i,
  /rm\s+-(?:rf|fr|r)\s+[\/\\](?:etc|usr|bin|boot|var|root|sys|windows)?(?:\s|$)/i,
  /format\s+[c-z]:/i,
  /del\s+\/[fsq]+\s+[c-z]:\\/i,
  /drop\s+database\s+[a-z0-9_]+/i,
  /dd\s+if=\/dev\/(?:zero|urandom)\s+of=\/dev\/(?:sd[a-z]|nvme)/i,
  /shutdown\s+[\/-][srf]/i
];

const COMMAND_INJECTION_PATTERNS = [
  /Invoke-WebRequest.*-Uri.*(?:\.exe|\.bat|\.vbs|\.ps1|malware)/i,
  /curl.*(?:-o|-O).*(?:\.exe|\.bat|\.vbs|\.ps1)/i,
  /wget.*-O.*(?:\.exe|\.bat|\.vbs|\.ps1)/i,
  /certutil.*-urlcache/i,
  /bitsadmin.*\/transfer/i,
  /powershell.*DownloadFile/i,
  /powershell.*DownloadString/i,
  /Start-Process.*(?:\.exe|\.bat|\.vbs|temp)/i
];

const SSRF_METADATA_PATTERNS = [
  /169\.254\.169\.254/i,
  /metadata\.google\.internal/i,
  /100\.100\.100\.200/i,
  /fd00:ec2::254/i
];

export function enforcePolicies(text = '') {
  const content = String(text || '');
  
  // Check for System-Level Destruction & Jailbreak Attacks
  for (const pattern of SYSTEM_DESTRUCTION_PATTERNS) {
    if (pattern.test(content)) {
      return {
        ok: false,
        rule: 'system_destruction_blocked',
        message: 'Security Policy Violation: Malicious or destructive OS command detected. Actions targeting System directories (System32, Root, Format) are strictly blocked.'
      };
    }
  }

  // Check for SSRF & Cloud Metadata Exploits
  for (const pattern of SSRF_METADATA_PATTERNS) {
    if (pattern.test(content)) {
      return {
        ok: false,
        rule: 'ssrf_metadata_blocked',
        message: 'Security Policy Violation: SSRF / Cloud Metadata Exfiltration blocked. Access to internal instance metadata endpoints (169.254.169.254) is strictly prohibited.'
      };
    }
  }

  // Check for Malicious Binary Downloads & Command Injections
  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return {
        ok: false,
        rule: 'command_injection_blocked',
        message: 'Security Policy Violation: Unauthorized binary download/execution or chained shell injection detected. Action strictly blocked.'
      };
    }
  }

  // Check for Secret / Raw Key Leaks and Dangerous Eval
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      const source = pattern.source;
      const rule = source.includes('eval') || source.includes('Function') ? 'no_eval' : source.includes('https') ? 'no_external_ip' : 'no_secrets';
      return {
        ok: false,
        rule,
        message: 'Policy Violation: Unsafe content or hardcoded credentials detected. Fix this code before approval.'
      };
    }
  }
  return { ok: true };
}

export function extractNpmPackages(command = '') {
  const match = String(command || '').match(/(?:npm\s+(?:i|install)|pnpm\s+(?:add|install)|yarn\s+add)\s+([^&|;]+)/i);
  if (!match || !match[1]) return [];
  return match[1]
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('-') && !s.startsWith('.'));
}

export async function verifyNpmPackage(packageName = '') {
  if (!packageName || typeof packageName !== 'string') return { valid: true };
  const cleanName = packageName.trim().replace(/^@?[^a-z0-9_.-]/i, '');
  if (!cleanName || cleanName.startsWith('-')) return { valid: true };

  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(cleanName)}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3500)
    });
    if (res.status === 404) {
      return {
        valid: false,
        packageName: cleanName,
        reason: 'hallucinated_package',
        message: `Supply Chain Risk: Package "${cleanName}" does not exist on the NPM registry (404 Not Found). This is likely an AI hallucination or squatted package.`
      };
    }
    return { valid: true, packageName: cleanName };
  } catch (err) {
    return { valid: true, packageName: cleanName, warning: 'registry_timeout' };
  }
}