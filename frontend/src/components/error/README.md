# Error State Design System

## Error Severity Levels

1. **Info** - Informational messages (not errors)
2. **Warning** - Potential issues, user should be aware
3. **Error** - Recoverable errors, user action may fix
4. **Critical** - Fatal errors, requires intervention

### Severity to Pattern Mapping

- **Info** → Toast
- **Warning** → Inline
- **Error** → Toast (or modal when explicit acknowledgement is required)
- **Critical** → Modal (or full-page for fatal route-level failures)

## When to Use Each Pattern

### 1. Toast (Info, Warning, Error, Success)
**Use when:**
- Non-blocking notification
- Temporary message (3-5 seconds)
- Success confirmation
- Minor errors that don't require immediate action

**Don't use when:**
- Error prevents user from continuing
- User must acknowledge the error
- Multiple errors at once

```tsx
import { useToast } from '@/hooks/useToast';

function MyComponent() {
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      await saveData();
      toast.success('Saved successfully!');
    } catch (error) {
      toast.error('Failed to save', 'Please try again');
    }
  };
}
```

### 2. Inline Error (Form Validation)
**Use when:**
- Form field validation errors
- Input-specific errors
- Real-time validation feedback

```tsx
import { FormField, InlineError } from '@/components/error';

<FormField
  label="Email"
  error={errors.email}
  required
>
  <input type="email" {...register('email')} />
</FormField>

// Or standalone
{error && <InlineError message="Email is required" />}
```

### 3. Error Box (Multiple Errors)
**Use when:**
- Multiple related errors
- Form submission failed with multiple issues
- Detailed error information needed

```tsx
import { ErrorBox } from '@/components/error';

<ErrorBox
  title="Form validation failed"
  errors={[
    'Email is required',
    'Password must be at least 8 characters',
    'Terms must be accepted'
  ]}
/>
```

### 4. Error Modal (Recoverable Errors)
**Use when:**
- Error requires user acknowledgment
- Provides retry option
- Blocks current workflow but recoverable
- Network errors, API failures

```tsx
import { ErrorModal } from '@/components/error';

<ErrorModal
  isOpen={showError}
  title="Failed to load data"
  message="We couldn't fetch your messages."
  details="Error: Network timeout"
  onClose={() => setShowError(false)}
  onRetry={() => refetch()}
/>
```

### 5. Confirm Dialog (User Confirmation)
**Use when:**
- Destructive action (delete, remove)
- Important decision
- Irreversible action

```tsx
import { ConfirmDialog } from '@/components/error';

<ConfirmDialog
  isOpen={showConfirm}
  title="Delete account?"
  message="This action cannot be undone. All your data will be permanently deleted."
  variant="danger"
  confirmLabel="Delete"
  onConfirm={handleDelete}
  onCancel={() => setShowConfirm(false)}
/>
```

### 6. Error Page (Fatal Errors)
**Use when:**
- Entire page failed to load
- 404, 500, network errors
- App crashes
- Maintenance mode

```tsx
import { ErrorPage, NotFoundPage, ServerErrorPage } from '@/components/error';

// 404
<NotFoundPage />

// 500
<ServerErrorPage onRetry={() => window.location.reload()} />

// Custom
<ErrorPage
  title="Oops!"
  message="Something unexpected happened"
  statusCode={503}
/>
```

## Error Message Guidelines

### ✅ Good Error Messages

- **Clear**: Explain what went wrong
- **Actionable**: Tell user what to do next
- **Human**: No jargon or error codes (show in details)
- **Specific**: Avoid generic "Error occurred"

**Examples:**
- "Email is required" ✅
- "Failed to send message. Check your connection." ✅
- "Username already taken. Try a different one." ✅

### ❌ Bad Error Messages

- "Error 500" ❌ (not helpful)
- "Invalid input" ❌ (what's invalid?)
- "Something went wrong" ❌ (too vague)
- "ERROR_USER_NOT_FOUND" ❌ (jargon)

## Error Tracking Integration

All boundary-level and global errors are tracked through `errorTrackingService` with context:
- severity (`info`, `warning`, `error`, `critical`)
- UI pattern (`toast`, `inline`, `modal`, `page`)
- area (feature/component scope)
- runtime context (component stack, request metadata, etc.)

Axios/API failures are also tracked centrally in the API interceptor so HTTP/network failures are captured even when React boundaries are not involved.

When Sentry is available on `window.Sentry`, errors are sent there with tags and extra context.  
All tracked errors are also shipped through frontend log aggregation for fallback visibility.

## Decision Tree

```
Is it fatal (can't continue)?
├─ Yes → ErrorPage (full page)
└─ No
   ├─ Needs acknowledgment?
   │  ├─ Yes → ErrorModal
   │  └─ No → Toast
   │
   ├─ Form validation?
   │  ├─ Single field → InlineError
   │  └─ Multiple fields → ErrorBox
   │
   ├─ Destructive action?
   │  └─ Yes → ConfirmDialog
   │
   └─ Info/success?
      └─ Toast
```

## Examples by Scenario

### Form Validation
```tsx
<form onSubmit={handleSubmit}>
  <FormField
    label="Email"
    error={errors.email}
    required
  >
    <input type="email" />
  </FormField>

  {errors.form && (
    <ErrorBox
      title="Please fix the following:"
      errors={Object.values(errors)}
    />
  )}
</form>
```

### API Error
```tsx
const handleSubmit = async () => {
  try {
    await api.post('/data');
    toast.success('Data saved!');
  } catch (error) {
    setErrorModal({
      isOpen: true,
      title: 'Failed to save',
      message: error.message,
    });
  }
};
```

### Delete Confirmation
```tsx
const handleDelete = () => {
  setConfirmDialog({
    isOpen: true,
    title: 'Delete post?',
    message: 'This cannot be undone.',
    variant: 'danger',
    onConfirm: async () => {
      try {
        await deletePost();
        toast.success('Post deleted');
      } catch (error) {
        toast.error('Failed to delete');
      }
    },
  });
};
```

### Page Error
```tsx
function PostPage() {
  if (error) {
    return <ServerErrorPage onRetry={refetch} />;
  }

  if (!post) {
    return <NotFoundPage />;
  }

  return <PostContent post={post} />;
}
```

## Toast Container Setup

Add to your root layout/App:

```tsx
import { ToastContainer } from '@/components/error';
import { useToasts } from '@/hooks/useToast';

function App() {
  const toasts = useToasts();

  return (
    <>
      <YourApp />
      <ToastContainer toasts={toasts} />
    </>
  );
}
```

## Accessibility

All error components include:
- `role="alert"` for screen readers
- `aria-live` regions (assertive for errors, polite for info)
- Keyboard navigation (Escape to close modals)
- Focus management (trap focus in modals)
- Color contrast compliance (WCAG AA)

## Testing Errors

1. **Network errors**: Throttle/offline mode
2. **Validation**: Submit empty forms
3. **Permissions**: Test unauthorized access
4. **Screen readers**: Verify announcements
5. **Keyboard**: Navigate without mouse
