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