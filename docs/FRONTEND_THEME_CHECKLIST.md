# Frontend Phase 2a: Theme System Implementation Checklist

**Status:** 🎯 Ready to Start
**Timeline:** Months 1-2
**Backend Status:** ✅ 100% Complete and Production-Ready

---

## Prerequisites (Already Complete ✅)

- [x] Backend API (17 endpoints) implemented and tested
- [x] Database schema with 3 theme tables
- [x] 8 predefined themes seeded
- [x] CSS sanitization and validation
- [x] Rate limiting configured
- [x] Complete API documentation

---

## Phase 2a: Basic Theme Customization (Levels 1-2)

### 1. Project Setup & Architecture

#### 1.1 Dependencies & Tools
- [ ] Install required npm packages:
  - [ ] `react-colorful` or `@uiw/react-color` - Color picker components
  - [ ] `styled-components` or CSS-in-JS solution (if not already using)
  - [ ] `react-query` or `swr` - API data fetching and caching
  - [ ] TypeScript types for theme system
- [ ] Set up API client for theme endpoints
- [ ] Configure theme-related environment variables

#### 1.2 Type Definitions
- [ ] Create TypeScript interfaces matching backend models:
  ```typescript
  interface UserTheme {
    id: number;
    user_id: number;
    theme_name: string;
    theme_description?: string;
    theme_type: 'predefined' | 'variable_customization' | 'full_css';
    scope_type: 'global' | 'per_page';
    css_variables?: Record<string, string>;
    custom_css?: string;
    is_public: boolean;
    install_count: number;
    rating_count: number;
    average_rating: number;
    version: string;
    created_at: string;
    updated_at: string;
  }

  interface UserSettings {
    active_theme_id?: number;
    advanced_mode_enabled: boolean;
    // ... other settings
  }
  ```

#### 1.3 API Service Layer
- [ ] Create `themeService.ts` with API methods:
  ```typescript
  // GET /api/v1/themes/predefined
  getPredefinedThemes()

  // POST /api/v1/themes
  createTheme(theme: CreateThemeRequest)

  // GET /api/v1/themes/my
  getMyThemes(limit, offset)

  // PUT /api/v1/themes/:id
  updateTheme(id, updates)

  // POST /api/v1/themes/active
  setActiveTheme(themeId)

  // GET /api/v1/settings
  getUserSettings()
  ```

---

### 2. Theme Context & State Management

#### 2.1 Theme Context Provider
- [ ] Create `ThemeContext.tsx`:
  - [ ] State for active theme
  - [ ] State for CSS variables
  - [ ] State for user's custom themes
  - [ ] Loading and error states
  - [ ] Methods to switch themes
  - [ ] Methods to apply CSS variables to DOM

#### 2.2 CSS Variable Application
- [ ] Create utility function to inject CSS variables:
  ```typescript
  function applyCSSVariables(variables: Record<string, string>) {
    const root = document.documentElement;
    Object.entries(variables).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
  }
  ```
- [ ] Handle theme persistence in localStorage
- [ ] Sync theme with user settings from backend

#### 2.3 Theme Initialization
- [ ] Fetch user's active theme on app load
- [ ] Apply theme CSS variables to `:root`
- [ ] Handle loading state during theme fetch
- [ ] Fallback to default theme if none selected

---

### 3. UI Components - Theme Selector

#### 3.1 Theme Selector Dropdown
- [ ] Create `ThemeSelector.tsx` component:
  - [ ] Dropdown/modal trigger button
  - [ ] List predefined themes (8 themes)
  - [ ] List user's custom themes
  - [ ] Visual preview thumbnails for each theme
  - [ ] Active theme indicator (checkmark/badge)
  - [ ] "Create New Theme" button

#### 3.2 Theme Preview Cards
- [ ] Create `ThemePreviewCard.tsx`:
  - [ ] Theme name and description
  - [ ] Color palette preview (show main colors)
  - [ ] Mini mockup of UI with theme applied
  - [ ] Install count and rating (if public theme)
  - [ ] "Select" button
  - [ ] "Edit" button (for user's themes)

#### 3.3 Theme Gallery View
- [ ] Create `ThemeGallery.tsx`:
  - [ ] Grid layout of theme cards
  - [ ] Filter by: Predefined, My Themes
  - [ ] Search/filter themes by name
  - [ ] Sort by: Name, Date Created, Popularity
  - [ ] Pagination or infinite scroll

---

### 4. UI Components - Theme Customization (Level 2)

#### 4.1 Theme Editor Modal/Page
- [ ] Create `ThemeEditor.tsx`:
  - [ ] Header with theme name input
  - [ ] Theme description textarea
  - [ ] "Based on" selector (choose predefined theme as starting point)
  - [ ] Save/Cancel buttons
  - [ ] "Make Public" toggle (for future marketplace)

#### 4.2 CSS Variable Customization Panel
- [ ] Create `CSSVariableEditor.tsx`:
  - [ ] Organized sections (Colors, Typography, Spacing, etc.)
  - [ ] Color pickers for color variables:
    - [ ] Primary colors (brand, accent)
    - [ ] Background colors (page, card, sidebar)
    - [ ] Text colors (primary, secondary, muted)
    - [ ] Border colors
    - [ ] Status colors (success, warning, error, info)
  - [ ] Number inputs with sliders for:
    - [ ] Font sizes (xs, sm, base, lg, xl, 2xl, 3xl)
    - [ ] Spacing values (xs, sm, md, lg, xl, 2xl)
    - [ ] Border radius values
    - [ ] Shadow intensities
  - [ ] Font family dropdowns (if supporting custom fonts)
  - [ ] "Reset to Default" button per variable
  - [ ] "Reset All" button

#### 4.3 Variable Organization
- [ ] Group variables by category:
  - [ ] **Colors** (30+ variables)
    - Primary palette
    - Background palette
    - Text palette
    - Border palette
    - Status colors
  - [ ] **Typography** (15+ variables)
    - Font families
    - Font sizes
    - Font weights
    - Line heights
  - [ ] **Spacing** (10+ variables)
    - Margins
    - Paddings
    - Gaps
  - [ ] **Layout** (10+ variables)
    - Border radius
    - Box shadows
    - Transitions
    - Z-indexes

#### 4.4 Color Picker Component
- [ ] Implement color picker with:
  - [ ] HEX input field
  - [ ] RGB input fields (optional)
  - [ ] Visual color palette
  - [ ] Opacity slider (for rgba)
  - [ ] Recent colors
  - [ ] "Pick from screen" eyedropper (if browser supports)

---

### 5. Live Preview System

#### 5.1 Preview Component
- [ ] Create `ThemePreview.tsx`:
  - [ ] Live preview pane showing actual UI components
  - [ ] Apply theme changes in real-time
  - [ ] Toggle between different pages (feed, profile, messages)
  - [ ] Mobile/desktop view toggle
  - [ ] Full-screen preview option

#### 5.2 Preview Content
- [ ] Show realistic mockup with:
  - [ ] Header/navigation bar
  - [ ] Sidebar (if applicable)
  - [ ] Content cards/posts
  - [ ] Buttons (primary, secondary, outline)
  - [ ] Form inputs
  - [ ] Typography samples (h1-h6, paragraphs, links)
  - [ ] Icons and badges
  - [ ] Status indicators

#### 5.3 Preview Implementation Options
- [ ] **Option A:** Shadow DOM
  - Isolated CSS scope
  - No conflicts with main app
- [ ] **Option B:** Iframe
  - Complete isolation
  - Renders actual app pages
- [ ] **Option C:** CSS class scoping
  - `.theme-preview` wrapper
  - Scoped CSS variables

---

### 6. Theme Creation Flow

#### 6.1 "Create New Theme" Wizard
- [ ] Step 1: Choose starting point
  - [ ] Select predefined theme as base
  - [ ] Or start from scratch
- [ ] Step 2: Basic info
  - [ ] Theme name (required)
  - [ ] Theme description (optional)
  - [ ] Theme type: `variable_customization`
- [ ] Step 3: Customize variables
  - [ ] Open CSS variable editor
  - [ ] Live preview on the side
- [ ] Step 4: Save
  - [ ] Validate theme name
  - [ ] POST to `/api/v1/themes`
  - [ ] Optionally set as active theme
  - [ ] Show success message

#### 6.2 Validation & Error Handling
- [ ] Client-side validation:
  - [ ] Theme name required, max 100 chars
  - [ ] Max 200 CSS variables
  - [ ] Valid CSS color values
  - [ ] Valid number ranges
- [ ] Handle API errors:
  - [ ] Duplicate theme name
  - [ ] Rate limiting (10/hour)
  - [ ] Network errors
  - [ ] Show user-friendly error messages

---

### 7. Theme Settings Integration

#### 7.1 Settings Page Section
- [ ] Add "Theme Customization" section to settings page:
  - [ ] Current active theme display
  - [ ] Quick theme selector
  - [ ] "Manage Themes" button → opens theme gallery
  - [ ] "Create New Theme" button

#### 7.2 Settings Persistence
- [ ] Save active theme to user settings
- [ ] Sync with backend `/api/v1/settings`
- [ ] Handle settings conflicts (race conditions)

---

### 8. Responsive Design

#### 8.1 Mobile Optimization
- [ ] Theme selector accessible on mobile
- [ ] Theme editor works on tablets
- [ ] Color pickers mobile-friendly
- [ ] Preview responsive layout
- [ ] Touch-friendly controls

#### 8.2 Desktop Optimization
- [ ] Side-by-side editor + preview
- [ ] Keyboard shortcuts:
  - [ ] `Cmd/Ctrl + S` - Save theme
  - [ ] `Escape` - Close editor
  - [ ] `Cmd/Ctrl + Z` - Undo changes

---

### 9. Performance Optimization

#### 9.1 Lazy Loading
- [ ] Lazy load theme editor components
- [ ] Lazy load color picker library
- [ ] Code splitting for theme pages

#### 9.2 Caching
- [ ] Cache predefined themes (rarely change)
- [ ] Cache user's themes list
- [ ] Invalidate cache on theme create/update/delete
- [ ] Use `react-query` or `swr` for automatic caching

#### 9.3 Debouncing
- [ ] Debounce live preview updates (300ms)
- [ ] Debounce CSS variable changes
- [ ] Prevent excessive re-renders

---

### 10. Accessibility (a11y)

#### 10.1 Keyboard Navigation
- [ ] All controls keyboard accessible
- [ ] Focus indicators visible
- [ ] Logical tab order
- [ ] `aria-label` on all buttons

#### 10.2 Screen Readers
- [ ] `aria-live` regions for theme changes
- [ ] Descriptive labels on inputs
- [ ] Color picker accessible alternatives

#### 10.3 Color Contrast
- [ ] Validate theme contrast ratios (WCAG AA)
- [ ] Warn user if text unreadable on background
- [ ] Provide contrast checker tool

---

### 11. Testing

#### 11.1 Unit Tests
- [ ] Test theme context provider
- [ ] Test CSS variable application
- [ ] Test theme validation functions
- [ ] Test API service methods

#### 11.2 Integration Tests
- [ ] Test theme selection flow
- [ ] Test theme creation flow
- [ ] Test theme update flow
- [ ] Test theme activation

#### 11.3 E2E Tests
- [ ] User selects predefined theme
- [ ] User creates custom theme
- [ ] User edits existing theme
- [ ] User switches between themes
- [ ] Theme persists across page reloads

#### 11.4 Visual Regression Tests
- [ ] Snapshot test theme preview
- [ ] Test theme application to components
- [ ] Test all 8 predefined themes

---

### 12. Documentation

#### 12.1 User Documentation
- [ ] "How to customize your theme" guide
- [ ] "Creating your first custom theme" tutorial
- [ ] CSS variable reference for users
- [ ] Video walkthrough (optional)

#### 12.2 Developer Documentation
- [ ] Theme system architecture diagram
- [ ] API integration guide
- [ ] Component documentation (Storybook?)
- [ ] How to add new CSS variables

---

### 13. Polish & UX Enhancements

#### 13.1 Animations
- [ ] Smooth theme transition animation
- [ ] Fade in/out when switching themes
- [ ] Color picker smooth updates
- [ ] Preview panel slide-in animation

#### 13.2 User Feedback
- [ ] Loading spinners during API calls
- [ ] Success toast on theme save
- [ ] Confirmation modal before deleting theme
- [ ] Unsaved changes warning

#### 13.3 Empty States
- [ ] "No custom themes yet" state
- [ ] "Create your first theme" call-to-action
- [ ] Helpful hints and tips

#### 13.4 Onboarding
- [ ] First-time user tutorial
- [ ] Highlight theme selector on first login
- [ ] "Try customizing your theme!" prompt

---

## Implementation Priority Order

### Week 1-2: Foundation
1. Set up dependencies and TypeScript types
2. Create API service layer
3. Build theme context and state management
4. Implement CSS variable application system

### Week 3-4: Basic UI
5. Build theme selector dropdown
6. Create theme preview cards
7. Implement theme switching functionality
8. Test theme persistence

### Week 5-6: Customization
9. Build theme editor modal
10. Implement CSS variable editor
11. Add color pickers for color variables
12. Create live preview component

### Week 7-8: Polish
13. Add theme creation wizard
14. Implement validation and error handling
15. Add animations and transitions
16. Mobile responsive design
17. Accessibility improvements
18. Write tests
19. Documentation

---

## Success Metrics

### Functionality
- [ ] User can select from 8 predefined themes
- [ ] User can create custom theme with CSS variables
- [ ] User can edit existing custom themes
- [ ] Theme persists across sessions
- [ ] Live preview updates in real-time
- [ ] All API endpoints successfully integrated

### Performance
- [ ] Theme switch completes in < 200ms
- [ ] Live preview updates in < 100ms
- [ ] Page load with theme applied < 1s
- [ ] No layout shift when applying theme

### UX
- [ ] < 5 clicks to create basic custom theme
- [ ] Color picker intuitive and easy to use
- [ ] Preview shows realistic representation
- [ ] Error messages clear and actionable

### Accessibility
- [ ] WCAG 2.1 AA compliant
- [ ] Keyboard navigation works 100%
- [ ] Screen reader tested and functional

---

## Files to Create

### Components
```
frontend/src/components/themes/
├── ThemeProvider.tsx          (Context provider)
├── ThemeSelector.tsx          (Dropdown selector)
├── ThemeGallery.tsx           (Theme gallery view)
├── ThemePreviewCard.tsx       (Individual theme card)
├── ThemeEditor.tsx            (Main editor modal)
├── CSSVariableEditor.tsx      (Variable customization)
├── ColorPicker.tsx            (Color input component)
├── ThemePreview.tsx           (Live preview pane)
└── ThemeCreationWizard.tsx    (Step-by-step wizard)
```

### Services
```
frontend/src/services/
├── themeService.ts            (API calls)
└── themeUtils.ts              (Helper functions)
```

### Types
```
frontend/src/types/
└── theme.ts                   (TypeScript interfaces)
```

### Hooks
```
frontend/src/hooks/
├── useTheme.ts                (Theme context hook)
├── useThemes.ts               (Fetch themes hook)
└── useCSSVariables.ts         (CSS variable management)
```

### Styles
```
frontend/src/styles/
├── themes/
│   ├── variables.css          (Default CSS variables)
│   └── predefined/            (Predefined theme overrides)
└── theme-editor.css           (Editor-specific styles)
```

---

## API Endpoints Reference

All endpoints are documented in [THEME_HANDLER_IMPLEMENTATION.md](THEME_HANDLER_IMPLEMENTATION.md)

**Quick Reference:**
- `GET /api/v1/themes/predefined` - Get 8 predefined themes
- `POST /api/v1/themes` - Create custom theme (10/hour limit)
- `GET /api/v1/themes/my` - Get user's custom themes
- `PUT /api/v1/themes/:id` - Update theme (10/hour limit)
- `POST /api/v1/themes/active` - Set active theme (10/hour limit)
- `GET /api/v1/settings` - Get user settings (includes active_theme_id)

---

## Next Phase Preview (Phase 2b - Months 3-4)

After Phase 2a is complete, Phase 2b will add:
- Per-page theme overrides (Level 4)
- Full CSS editor (Level 3) with Monaco/CodeMirror
- Component-specific styling
- Advanced mode toggle

---

## Resources & References

### Backend Documentation
- [BACKEND_PHASE_2_COMPLETE.md](BACKEND_PHASE_2_COMPLETE.md) - Backend status
- [THEME_HANDLER_IMPLEMENTATION.md](THEME_HANDLER_IMPLEMENTATION.md) - API reference
- [CSS_VARIABLES.md](CSS_VARIABLES.md) - 100+ available CSS variables
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) - BEM class reference

### Design Inspiration
- MySpace classic themes (2003-2008 era)
- Tumblr theme customization
- WordPress theme customizer
- DeviantArt themes
- Discord theme system

### Libraries to Consider
- **Color Pickers:**
  - `react-colorful` (lightweight, 2KB)
  - `@uiw/react-color` (feature-rich)
  - `react-color` (popular but heavier)

- **State Management:**
  - `react-query` (recommended for API caching)
  - `swr` (alternative to react-query)
  - `zustand` (if need global theme state)

- **UI Components:**
  - Existing component library in the project
  - Headless UI for modals/dropdowns
  - Radix UI primitives

---

## Questions to Resolve Before Starting

1. **Existing UI Framework:**
   - What component library are you currently using? (Material-UI, Ant Design, custom?)
   - Are you using CSS Modules, styled-components, or vanilla CSS?

2. **State Management:**
   - Current state management solution? (Redux, Context, Zustand?)
   - Preference for API caching? (react-query, swr, or manual?)

3. **TypeScript:**
   - Is the frontend already in TypeScript?
   - If not, should we add TypeScript for theme system?

4. **Design System:**
   - Do you have existing design mockups for theme UI?
   - Should we follow existing UI patterns in the app?

5. **Browser Support:**
   - Target browsers? (Modern evergreen, or IE11 support needed?)
   - CSS Variables support is required (IE11 doesn't support)

---

**Status:** ✅ Ready to begin Phase 2a frontend implementation
**Estimated Timeline:** 6-8 weeks for complete Phase 2a
**Backend Dependency:** ✅ All APIs ready and tested

Let's build an amazing MySpace-style theme customization system! 🎨
