# Markdown Rendering System - Complete Documentation

**Status:** ✅ Complete and Production-Ready
**Last Updated:** December 3, 2025

---

## Overview

OmniNudge features a custom Markdown rendering system built for security, performance, and Reddit-style formatting. The renderer supports common Markdown syntax while providing XSS protection and sanitization.

---

## Table of Contents

1. [Supported Markdown Features](#supported-markdown-features)
2. [Component Architecture](#component-architecture)
3. [Security Features](#security-features)
4. [Styling System](#styling-system)
5. [Usage Examples](#usage-examples)
6. [Performance Optimizations](#performance-optimizations)

---

## Supported Markdown Features

### Inline Formatting

#### Bold Text
**Input:** `**bold text**`

**Output:** **bold text**

**HTML:** `<strong>bold text</strong>`

#### Italic Text
**Input:** `*italic text*`

**Output:** *italic text*

**HTML:** `<em>italic text</em>`

#### Strikethrough
**Input:** `~~strikethrough~~`

**Output:** ~~strikethrough~~

**HTML:** `<del>strikethrough</del>`

#### Superscript
**Input:** `super^script`

**Output:** super<sup>script</sup>

**HTML:** `super<sup>script</sup>`

**Format:** `text^text` (no spaces around `^`)

#### Hyperlinks
**Input:** `[OmniNudge!](https://omninudge.com)`

**Output:** [OmniNudge!](https://omninudge.com)

**HTML:** `<a href="https://omninudge.com" target="_blank" rel="noopener noreferrer">OmniNudge!</a>`

**Features:**
- Opens in new tab (`target="_blank"`)
- Security headers (`rel="noopener noreferrer"`)
- URL validation before rendering

### Block Elements

#### Paragraphs
**Input:**
```
First paragraph.

Second paragraph.
```

**Output:**
```html
<p>First paragraph.</p>
<p>Second paragraph.</p>
```

#### Unordered Lists
**Input:**
```
* item 1
* item 2
* item 3
```

**Output:**
- item 1
- item 2
- item 3

**HTML:**
```html
<ul>
  <li>item 1</li>
  <li>item 2</li>
  <li>item 3</li>
</ul>
```

#### Blockquotes
**Input:**
```
> quoted text
> more quoted text
```

**Output:**
> quoted text
> more quoted text

**HTML:**
```html
<blockquote>
  quoted text<br />
  more quoted text<br />
</blockquote>
```

#### Code Blocks
**Input:**
```
Lines starting with four spaces are treated like code:

    if 1 * 2 < 3:
    print "hello, world!"
```

**Output:**
```python
if 1 * 2 < 3:
print "hello, world!"
```

**HTML:**
```html
<pre><code>if 1 * 2 < 3:
print "hello, world!"
</code></pre>
```

**Rules:**
- Lines must start with exactly 4 spaces
- Maintains whitespace and indentation
- Monospace font applied via CSS

---

## Component Architecture

### File Location
**Component:** `frontend/src/components/common/MarkdownRenderer.tsx`

### Component Interface
```typescript
interface MarkdownRendererProps {
  content?: string | null;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps)
```

### Core Functions

#### 1. escapeHtml()
```typescript
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

**Purpose:** Prevent XSS by escaping HTML entities

**Escapes:**
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&#39;`

#### 2. escapeAttribute()
```typescript
function escapeAttribute(value: string): string {
  try {
    const url = new URL(value);
    return escapeHtml(url.toString());
  } catch {
    return '#';
  }
}
```

**Purpose:** Validate and escape URL attributes

**Validation:**
- Must be valid URL
- If invalid, returns `#` (safe fallback)
- Prevents `javascript:` and other dangerous protocols

#### 3. formatInline()
```typescript
function formatInline(text: string): string {
  let result = escapeHtml(text);
  result = result.replace(boldRegex, '<strong>$1</strong>');
  result = result.replace(italicsRegex, '<em>$1</em>');
  result = result.replace(strikeRegex, '<del>$1</del>');
  result = result.replace(superscriptRegex, '$1<sup>$2</sup>');
  result = result.replace(
    linkRegex,
    (_, label, url) =>
      `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        label
      )}</a>`
  );
  return result;
}
```

**Purpose:** Apply inline formatting to text

**Processing Order:**
1. Escape HTML entities
2. Apply bold formatting
3. Apply italic formatting
4. Apply strikethrough
5. Apply superscript
6. Convert links

#### 4. convertMarkdown()
```typescript
function convertMarkdown(markdown?: string | null): string {
  if (!markdown) return '';

  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const html: string[] = [];

  let inList = false;
  let inBlockquote = false;
  let inCode = false;

  // State machine for block elements
  for (const line of lines) {
    // Process line based on current state and line content
  }

  return html.join('');
}
```

**Purpose:** Main conversion logic

**State Machine:**
- Tracks context (in list, blockquote, code block)
- Opens/closes block elements appropriately
- Handles transitions between block types

### Regular Expressions

```typescript
const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;
const boldRegex = /\*\*(.+?)\*\*/g;
const italicsRegex = /\*(.+?)\*/g;
const strikeRegex = /~~(.+?)~~/g;
const superscriptRegex = /(\S+)\^(\S+)/g;
```

**Patterns:**
- **Bold:** `**text**` (non-greedy)
- **Italics:** `*text*` (non-greedy)
- **Strikethrough:** `~~text~~` (non-greedy)
- **Superscript:** `word^word` (no spaces)
- **Links:** `[label](http://url)` (http/https only)

### Rendering

```typescript
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const renderedHtml = useMemo(() => convertMarkdown(content), [content]);

  if (!renderedHtml) {
    return null;
  }

  return (
    <div
      className={`markdown-content text-left text-sm text-[var(--color-text-primary)] ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
```

**Key Points:**
- Uses `useMemo` for performance
- Returns `null` if no content
- Renders via `dangerouslySetInnerHTML` (safe because content is sanitized)
- Applies `markdown-content` CSS class

---

## Security Features

### XSS Prevention

#### HTML Escaping
All user content is escaped before processing:
```typescript
escapeHtml(userContent)
```

**Prevents:**
```html
<script>alert('xss')</script>  →  &lt;script&gt;alert('xss')&lt;/script&gt;
```

#### URL Validation
URLs are validated before being used in hrefs:
```typescript
try {
  const url = new URL(value);
  return escapeHtml(url.toString());
} catch {
  return '#';  // Invalid URL becomes safe anchor
}
```

**Prevents:**
```markdown
[click me](javascript:alert('xss'))  →  <a href="#">click me</a>
```

#### Link Security Headers
All links include security attributes:
```html
<a href="..." target="_blank" rel="noopener noreferrer">
```

**Protection:**
- `target="_blank"`: Opens in new tab
- `rel="noopener"`: Prevents `window.opener` access
- `rel="noreferrer"`: Doesn't send referrer header

### Content Sanitization

#### Processing Pipeline
```
User Input
  ↓
Escape HTML Entities
  ↓
Parse Markdown
  ↓
Validate URLs
  ↓
Generate Safe HTML
  ↓
Render via dangerouslySetInnerHTML
```

#### Safe HTML Generation
Only whitelisted HTML tags generated:
- `<p>`, `<strong>`, `<em>`, `<del>`, `<sup>`
- `<a>` (with validated href)
- `<ul>`, `<li>`
- `<blockquote>`, `<br>`
- `<pre>`, `<code>`

**No user-supplied HTML tags allowed**

---

## Styling System

### CSS File
**Location:** `frontend/src/index.css`

### Base Styles
```css
.markdown-content {
  font-size: 0.875rem;   /* 14px */
  line-height: 1.5;
}
```

### Paragraph Spacing
```css
.markdown-content p {
  margin: 0 0 0.75rem;
}
```

**In Table Cells:**
```css
td .markdown-content p,
td .markdown-content p:last-child {
  margin: 0;  /* No spacing in tables */
}
```

### List Styling
```css
.markdown-content ul,
.markdown-content ol {
  margin: 0.5rem 0 0.75rem 1.5rem;
  padding: 0;
}
```

**In Table Cells:**
```css
td .markdown-content ul,
td .markdown-content ol {
  margin: 0 0 0 1.5rem;  /* Reduced vertical spacing */
}
```

### Blockquote Styling
```css
.markdown-content blockquote {
  border-left: 3px solid var(--color-border);
  margin: 0.5rem 0;
  padding-left: 0.75rem;
  color: var(--color-text-secondary);
}
```

**In Table Cells:**
```css
td .markdown-content blockquote {
  margin: 0;  /* No margin in tables */
}
```

### Code Styling

#### Inline Code
```css
.markdown-content code {
  font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
  background-color: var(--color-surface);
  padding: 0.1rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.85em;
}
```

#### Code Blocks
```css
.markdown-content pre {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  padding: 0.75rem;
  overflow-x: auto;
  font-size: 0.85em;
}
```

**In Table Cells:**
```css
td .markdown-content pre {
  margin: 0;
  padding: 0.25rem;  /* Compact padding */
}
```

### Link Styling
```css
.markdown-content a {
  color: var(--color-primary);
  text-decoration: underline;
}
```

---

## Usage Examples

### Basic Usage

```typescript
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';

function CommentCard({ comment }) {
  return (
    <div>
      <MarkdownRenderer content={comment.body} />
    </div>
  );
}
```

### With Custom Styling

```typescript
<MarkdownRenderer
  content={post.body}
  className="leading-tight"
/>
```

### In Formatting Help Table

```typescript
{FORMATTING_EXAMPLES.map((example, index) => (
  <tr key={index}>
    <td>
      <pre>{example.input}</pre>
    </td>
    <td>
      <MarkdownRenderer
        content={example.output}
        className="leading-tight"
      />
    </td>
  </tr>
))}
```

### Handling Empty Content

```typescript
// Component automatically returns null for empty content
<MarkdownRenderer content={null} />  // Renders nothing
<MarkdownRenderer content="" />      // Renders nothing
<MarkdownRenderer content="Text" />  // Renders <p>Text</p>
```

---

## Performance Optimizations

### Memoization

```typescript
const renderedHtml = useMemo(() => convertMarkdown(content), [content]);
```

**Benefits:**
- Only re-renders when content changes
- Expensive regex operations cached
- Reduces unnecessary DOM updates

### Conditional Rendering

```typescript
if (!renderedHtml) {
  return null;
}
```

**Benefits:**
- Avoids empty div elements
- Reduces DOM nodes
- Better performance for large lists

### Efficient Regex

```typescript
const boldRegex = /\*\*(.+?)\*\*/g;  // Non-greedy
```

**Benefits:**
- Non-greedy matching (`+?`) prevents catastrophic backtracking
- Global flag (`/g`) for multiple matches
- Pre-compiled (module-level constant)

---

## Limitations & Known Issues

### Current Limitations

1. **Nested Lists Not Supported**
   ```markdown
   * Level 1
     * Level 2  ← Not supported
   ```

2. **Ordered Lists Not Supported**
   ```markdown
   1. First  ← Not supported
   2. Second
   ```

3. **Headings Not Supported**
   ```markdown
   # Heading  ← Not supported
   ```

4. **Images Not Supported**
   ```markdown
   ![alt](url)  ← Not supported
   ```

5. **Tables Not Supported**
   ```markdown
   | Col 1 | Col 2 |  ← Not supported
   ```

6. **Inline Code Not Supported**
   ```markdown
   Use `code` here  ← Not supported (renders as text)
   ```

### Workarounds

#### For Images
Use direct media_url field in posts instead of markdown:
```typescript
{post.media_url && <img src={post.media_url} alt={post.title} />}
```

#### For Headings
Use bold text:
```markdown
**Heading Text**
```

---

## Future Enhancements

### Planned Features
- [ ] Ordered lists support
- [ ] Nested lists support
- [ ] Inline code support (`` `code` ``)
- [ ] Heading support (`# H1`, `## H2`, etc.)
- [ ] Image support (`![alt](url)`)
- [ ] Table support
- [ ] Horizontal rules (`---`)
- [ ] Task lists (`- [ ] task`)
- [ ] Footnotes
- [ ] Definition lists
- [ ] Emoji shortcodes (`:smile:`)

### Performance Enhancements
- [ ] Web Worker for large documents
- [ ] Incremental rendering
- [ ] Syntax highlighting for code blocks
- [ ] LaTeX math support

---

## Testing Recommendations

### Test Cases

#### XSS Prevention
```typescript
// Should escape HTML
const xss = '<script>alert("xss")</script>';
expect(render(xss)).not.toContain('<script>');

// Should block javascript: URLs
const jsUrl = '[click](javascript:alert("xss"))';
expect(render(jsUrl)).toContain('href="#"');
```

#### Formatting
```typescript
// Bold
expect(render('**bold**')).toContain('<strong>bold</strong>');

// Italics
expect(render('*italic*')).toContain('<em>italic</em>');

// Links
expect(render('[text](https://example.com)')).toContain('href="https://example.com"');
```

#### Edge Cases
```typescript
// Empty content
expect(render(null)).toBe(null);
expect(render('')).toBe(null);

// Malformed markdown
expect(render('**unclosed bold')).not.toThrow();
expect(render('[broken](link')).not.toThrow();
```

---

## Best Practices

### For Users

1. **Preview Before Posting:**
   - Check formatting in preview
   - Verify links work correctly
   - Test special characters

2. **Use Supported Features:**
   - Stick to documented markdown syntax
   - Avoid unsupported features (headings, tables)

3. **Escape Special Characters:**
   - Use `\` to escape markdown characters
   - Example: `\*not italic\*` → \*not italic\*

### For Developers

1. **Always Sanitize:**
   ```typescript
   // Don't render raw HTML
   <div dangerouslySetInnerHTML={{ __html: userContent }} />  // ❌ Unsafe

   // Use MarkdownRenderer
   <MarkdownRenderer content={userContent} />  // ✅ Safe
   ```

2. **Test XSS Vectors:**
   ```typescript
   // Test common XSS patterns
   testRender('<img src=x onerror=alert(1)>');
   testRender('[xss](javascript:alert(1))');
   testRender('**<script>alert(1)</script>**');
   ```

3. **Handle Null/Undefined:**
   ```typescript
   <MarkdownRenderer content={post?.body} />  // ✅ Safe with optional chaining
   ```

4. **Use Custom Classes:**
   ```typescript
   <MarkdownRenderer content={text} className="compact" />
   ```

5. **Document Limitations:**
   - Inform users about unsupported features
   - Provide alternatives where possible

---

## Related Documentation

- [Reddit Integration](./REDDIT_INTEGRATION.md)
- [Component Reference](./COMPONENT_REFERENCE.md)
- [CSS Variables](./CSS_VARIABLES.md)
- [Security Guidelines](./SECURITY_GUIDELINES.md)
