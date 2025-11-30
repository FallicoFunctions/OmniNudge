# Frontend Setup Guide - OmniNudge Theme System

**Status:** 🎯 Ready to Initialize
**Date:** November 29, 2025
**Backend:** ✅ Complete and Running

---

## Your Current Setup (Confirmed)

Based on your project status:

1. **UI Framework:** None yet - Starting from scratch ✅
2. **State Management:** None yet - Will use TanStack Query (as planned in README) ✅
3. **TypeScript:** Yes - Planned in README ✅
4. **Design Mockups:** None - Will create custom design ✅
5. **Browser Support:** Modern browsers only ✅

**Project Status:**
- Backend: 100% complete (91 tests passing)
- Frontend: Not started yet - **perfect timing to begin!**

---

## Recommended Tech Stack (Aligned with README)

From your `README.md`, you already planned:
- **Framework:** React + TypeScript ✅
- **Build Tool:** Vite ✅
- **State:** TanStack Query ✅
- **Encryption:** Web Crypto API ✅

### Additional Recommendations for Theme System:

**Styling Approach:**
- **Tailwind CSS** - Recommended (plays well with CSS variables)
  - Easy to customize with theme system
  - Utility-first approach
  - Excellent dark mode support
  - Can extend with CSS variables

**Alternative:** CSS Modules or styled-components (if you prefer component-scoped styles)

**Color Picker:**
- `react-colorful` (2KB, lightweight, perfect for theme editor)

**Additional Libraries:**
- `zustand` - For lightweight theme state (optional, can use React Context)
- `clsx` - For conditional className management
- `@tanstack/react-query` - For API caching (already planned)

---

## Step 1: Initialize Frontend Project

### 1.1 Create React + TypeScript + Vite Project

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

# Create frontend with Vite
npm create vite@latest frontend -- --template react-ts

cd frontend
```

### 1.2 Install Core Dependencies

```bash
# Core (already included)
# - react
# - react-dom
# - typescript

# Routing
npm install react-router-dom

# State Management & API
npm install @tanstack/react-query
npm install zustand  # Optional: lightweight global state

# HTTP Client
npm install axios

# Styling
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Forms
npm install react-hook-form zod @hookform/resolvers

# UI Utilities
npm install clsx
npm install react-colorful  # Color picker for theme editor
```

### 1.3 Configure Tailwind CSS

**File:** `frontend/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Will be extended with CSS variables from theme system
        primary: 'var(--color-primary)',
        'primary-dark': 'var(--color-primary-dark)',
        'primary-light': 'var(--color-primary-light)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        border: 'var(--color-border)',
        // ... more as needed
      },
      spacing: {
        // Can extend with theme spacing variables
      },
      borderRadius: {
        // Can extend with theme radius variables
      }
    },
  },
  plugins: [],
  darkMode: 'class', // Enable class-based dark mode
}
```

**File:** `frontend/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Root CSS Variables - Default Theme */
:root {
  /* Primary Colors */
  --color-primary: #3b82f6;
  --color-primary-dark: #2563eb;
  --color-primary-light: #60a5fa;

  /* Background Colors */
  --color-background: #ffffff;
  --color-surface: #f9fafb;
  --color-surface-elevated: #ffffff;

  /* Text Colors */
  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
  --color-text-muted: #9ca3af;

  /* Border Colors */
  --color-border: #e5e7eb;
  --color-border-hover: #d1d5db;

  /* Status Colors */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;

  /* Typography */
  --font-family-base: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 1.875rem;

  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;

  /* Layout */
  --border-radius-sm: 0.25rem;
  --border-radius-md: 0.375rem;
  --border-radius-lg: 0.5rem;
  --border-radius-xl: 0.75rem;
  --border-radius-2xl: 1rem;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms ease;
}

/* Dark theme (can be overridden by user themes) */
:root.dark {
  --color-background: #111827;
  --color-surface: #1f2937;
  --color-surface-elevated: #374151;
  --color-text-primary: #f9fafb;
  --color-text-secondary: #d1d5db;
  --color-text-muted: #9ca3af;
  --color-border: #374151;
  --color-border-hover: #4b5563;
}

/* Base styles */
body {
  font-family: var(--font-family-base);
  color: var(--color-text-primary);
  background-color: var(--color-background);
  transition: background-color var(--transition-base), color var(--transition-base);
}

/* Smooth theme transitions */
* {
  transition-property: background-color, border-color, color;
  transition-duration: var(--transition-base);
  transition-timing-function: ease;
}

/* Disable transitions for elements that shouldn't animate */
button, input, textarea, select {
  transition-property: none;
}
```

---

## Step 2: Project Structure

### 2.1 Create Directory Structure

```bash
cd frontend/src

# Create directories
mkdir -p components/themes
mkdir -p components/ui
mkdir -p services
mkdir -p hooks
mkdir -p types
mkdir -p contexts
mkdir -p utils
mkdir -p pages/themes
mkdir -p styles/themes
```

### 2.2 Directory Layout

```
frontend/src/
├── components/
│   ├── themes/                 # Theme-specific components
│   │   ├── ThemeProvider.tsx   # Theme context provider
│   │   ├── ThemeSelector.tsx   # Theme dropdown selector
│   │   ├── ThemeGallery.tsx    # Gallery of themes
│   │   ├── ThemePreviewCard.tsx # Individual theme card
│   │   ├── ThemeEditor.tsx     # Theme editor modal
│   │   ├── CSSVariableEditor.tsx # CSS var customization
│   │   ├── ColorPicker.tsx     # Color input component
│   │   └── ThemePreview.tsx    # Live preview pane
│   └── ui/                     # Reusable UI components
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Modal.tsx
│       └── ...
├── contexts/
│   └── ThemeContext.tsx        # Theme state management
├── hooks/
│   ├── useTheme.ts             # Theme context hook
│   ├── useThemes.ts            # Fetch themes hook
│   └── useCSSVariables.ts      # CSS variable management
├── services/
│   ├── api.ts                  # Axios instance config
│   └── themeService.ts         # Theme API calls
├── types/
│   ├── theme.ts                # Theme type definitions
│   └── api.ts                  # API response types
├── utils/
│   └── themeUtils.ts           # Helper functions
├── pages/
│   └── themes/
│       ├── ThemesPage.tsx      # Main themes page
│       └── ThemeEditorPage.tsx # Full editor page
├── styles/
│   └── themes/
│       └── predefined/         # Predefined theme CSS
└── App.tsx
```

---

## Step 3: TypeScript Type Definitions

### 3.1 Create Theme Types

**File:** `frontend/src/types/theme.ts`

```typescript
// Matches backend models
export type ThemeType = 'predefined' | 'variable_customization' | 'full_css';
export type ScopeType = 'global' | 'per_page';
export type PageName = 'feed' | 'profile' | 'settings' | 'messages' | 'notifications' | 'search';

export interface UserTheme {
  id: number;
  user_id: number;
  theme_name: string;
  theme_description?: string;
  theme_type: ThemeType;
  scope_type: ScopeType;
  target_page?: PageName;
  css_variables?: Record<string, string>;
  custom_css?: string;
  is_public: boolean;
  install_count: number;
  rating_count: number;
  average_rating: number;
  category?: string;
  tags?: string[];
  thumbnail_url?: string;
  version: string;
  created_at: string;
  updated_at: string;
}

export interface CreateThemeRequest {
  theme_name: string;
  theme_description?: string;
  theme_type: ThemeType;
  scope_type: ScopeType;
  target_page?: PageName;
  css_variables?: Record<string, string>;
  custom_css?: string;
  is_public?: boolean;
  category?: string;
  tags?: string[];
  thumbnail_url?: string;
}

export interface UpdateThemeRequest {
  theme_name?: string;
  theme_description?: string;
  css_variables?: Record<string, string>;
  custom_css?: string;
  is_public?: boolean;
  category?: string;
  tags?: string[];
  thumbnail_url?: string;
}

export interface UserSettings {
  user_id: number;
  active_theme_id?: number;
  advanced_mode_enabled: boolean;
  // ... other settings
}

export interface ThemeOverride {
  id: number;
  user_id: number;
  page_name: PageName;
  theme_id: number;
  created_at: string;
  updated_at: string;
}

// UI-specific types
export interface CSSVariable {
  name: string;
  value: string;
  category: 'color' | 'typography' | 'spacing' | 'layout';
  type: 'color' | 'size' | 'number' | 'string';
  label: string;
  description?: string;
}

export interface ThemeCategory {
  id: string;
  name: string;
  variables: CSSVariable[];
}
```

---

## Step 4: API Service Layer

### 4.1 Axios Configuration

**File:** `frontend/src/services/api.ts`

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 4.2 Theme Service

**File:** `frontend/src/services/themeService.ts`

```typescript
import api from './api';
import type {
  UserTheme,
  CreateThemeRequest,
  UpdateThemeRequest,
  UserSettings,
  ThemeOverride
} from '../types/theme';

export const themeService = {
  // Get predefined themes
  getPredefinedThemes: async (): Promise<UserTheme[]> => {
    const { data } = await api.get('/themes/predefined');
    return data.themes;
  },

  // Get user's custom themes
  getMyThemes: async (limit = 20, offset = 0): Promise<{ themes: UserTheme[]; total: number }> => {
    const { data } = await api.get('/themes/my', { params: { limit, offset } });
    return data;
  },

  // Get single theme by ID
  getTheme: async (id: number): Promise<UserTheme> => {
    const { data } = await api.get(`/themes/${id}`);
    return data;
  },

  // Create new theme
  createTheme: async (theme: CreateThemeRequest): Promise<UserTheme> => {
    const { data } = await api.post('/themes', theme);
    return data;
  },

  // Update existing theme
  updateTheme: async (id: number, updates: UpdateThemeRequest): Promise<UserTheme> => {
    const { data } = await api.put(`/themes/${id}`, updates);
    return data;
  },

  // Delete theme
  deleteTheme: async (id: number): Promise<void> => {
    await api.delete(`/themes/${id}`);
  },

  // Browse public themes
  browseThemes: async (
    limit = 20,
    offset = 0,
    category?: string
  ): Promise<{ themes: UserTheme[]; total: number }> => {
    const { data } = await api.get('/themes/browse', {
      params: { limit, offset, category }
    });
    return data;
  },

  // Install theme
  installTheme: async (themeId: number): Promise<void> => {
    await api.post('/themes/install', { theme_id: themeId });
  },

  // Uninstall theme
  uninstallTheme: async (themeId: number): Promise<void> => {
    await api.delete(`/themes/install/${themeId}`);
  },

  // Set active theme
  setActiveTheme: async (themeId: number): Promise<void> => {
    await api.post('/themes/active', { theme_id: themeId });
  },

  // Get installed themes
  getInstalledThemes: async (): Promise<UserTheme[]> => {
    const { data } = await api.get('/themes/installed');
    return data.themes;
  },

  // Set page override
  setPageOverride: async (pageName: string, themeId: number): Promise<ThemeOverride> => {
    const { data } = await api.post('/themes/overrides', { page_name: pageName, theme_id: themeId });
    return data;
  },

  // Get all page overrides
  getAllOverrides: async (): Promise<ThemeOverride[]> => {
    const { data } = await api.get('/themes/overrides');
    return data.overrides;
  },

  // Get page override
  getPageOverride: async (pageName: string): Promise<ThemeOverride | null> => {
    const { data } = await api.get(`/themes/overrides/${pageName}`);
    return data;
  },

  // Delete page override
  deletePageOverride: async (pageName: string): Promise<void> => {
    await api.delete(`/themes/overrides/${pageName}`);
  },

  // Toggle advanced mode
  setAdvancedMode: async (enabled: boolean): Promise<void> => {
    await api.post('/themes/advanced-mode', { enabled });
  },

  // Rate theme
  rateTheme: async (themeId: number, rating: number, review?: string): Promise<void> => {
    await api.post('/themes/rate', { theme_id: themeId, rating, review });
  },

  // Get user settings
  getUserSettings: async (): Promise<UserSettings> => {
    const { data } = await api.get('/settings');
    return data;
  },
};
```

---

## Step 5: Environment Configuration

### 5.1 Create .env Files

**File:** `frontend/.env.development`

```env
VITE_API_URL=http://localhost:8080/api/v1
VITE_WS_URL=ws://localhost:8080/ws
```

**File:** `frontend/.env.production`

```env
VITE_API_URL=https://api.omninudge.com/api/v1
VITE_WS_URL=wss://api.omninudge.com/ws
```

**File:** `frontend/.env.example`

```env
# API Configuration
VITE_API_URL=http://localhost:8080/api/v1
VITE_WS_URL=ws://localhost:8080/ws
```

---

## Step 6: Development Scripts

### 6.1 Update package.json Scripts

**File:** `frontend/package.json`

Add/update scripts section:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "type-check": "tsc --noEmit"
  }
}
```

---

## Step 7: Git Configuration

### 7.1 Update .gitignore

**File:** `frontend/.gitignore`

```
# Dependencies
node_modules/

# Build output
dist/
dist-ssr/

# Environment variables
.env
.env.local
.env.*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*
```

---

## Step 8: First Run Checklist

```bash
# 1. Initialize frontend project
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge
npm create vite@latest frontend -- --template react-ts
cd frontend

# 2. Install dependencies
npm install react-router-dom @tanstack/react-query zustand axios
npm install react-hook-form zod @hookform/resolvers
npm install clsx react-colorful
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 3. Set up directory structure
mkdir -p src/components/themes src/components/ui
mkdir -p src/services src/hooks src/types
mkdir -p src/contexts src/utils src/pages/themes
mkdir -p src/styles/themes

# 4. Create configuration files
# - Copy tailwind.config.js content above
# - Copy index.css content above
# - Create .env.development with API URL

# 5. Start development server
npm run dev
```

---

## Step 9: Verify Setup

### 9.1 Test API Connection

Create a test component to verify backend connectivity:

**File:** `frontend/src/components/ApiTest.tsx`

```typescript
import { useEffect, useState } from 'react';
import { themeService } from '../services/themeService';

export function ApiTest() {
  const [themes, setThemes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    themeService.getPredefinedThemes()
      .then(setThemes)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">API Connection Test</h2>
      {error && <p className="text-red-500">Error: {error}</p>}
      {themes.length > 0 && (
        <div>
          <p className="text-green-500">✅ Connected to backend!</p>
          <p>Found {themes.length} predefined themes</p>
        </div>
      )}
    </div>
  );
}
```

---

## Step 10: Next Steps After Setup

Once the project is initialized:

1. **Build Theme Context** - Create ThemeProvider and useTheme hook
2. **Build Theme Selector** - Dropdown to select from 8 predefined themes
3. **Implement CSS Variable Application** - Apply theme to DOM
4. **Build Theme Gallery** - Display theme cards
5. **Build Theme Editor** - Create/edit custom themes
6. **Add Color Pickers** - CSS variable customization UI
7. **Build Live Preview** - Real-time theme preview

Follow the detailed checklist in [FRONTEND_PHASE_2A_CHECKLIST.md](FRONTEND_PHASE_2A_CHECKLIST.md)

---

## Quick Reference

### Backend API is Running
```bash
# Backend should be running on:
http://localhost:8080

# Test it:
curl http://localhost:8080/health
```

### Start Frontend Development
```bash
cd frontend
npm run dev
# Opens on http://localhost:5173 (default Vite port)
```

### Test Theme API
```bash
# Get predefined themes (requires auth token)
curl http://localhost:8080/api/v1/themes/predefined \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Troubleshooting

### CORS Issues
If you get CORS errors, ensure backend CORS middleware allows `http://localhost:5173`

### Auth Token Issues
1. Register/login via API to get token
2. Store token in localStorage as `auth_token`
3. API service automatically includes it in requests

### Port Conflicts
- Backend: 8080 (configurable via `SERVER_PORT`)
- Frontend: 5173 (Vite default, configurable in `vite.config.ts`)

---

## Resources

### Documentation
- [FRONTEND_PHASE_2A_CHECKLIST.md](FRONTEND_PHASE_2A_CHECKLIST.md) - Complete implementation checklist
- [THEME_HANDLER_IMPLEMENTATION.md](THEME_HANDLER_IMPLEMENTATION.md) - Backend API reference
- [CSS_VARIABLES.md](CSS_VARIABLES.md) - All available CSS variables
- [BACKEND_API_SUMMARY.md](../BACKEND_API_SUMMARY.md) - Full backend API docs

### Libraries
- [Vite](https://vitejs.dev/) - Build tool
- [React](https://react.dev/) - UI framework
- [TanStack Query](https://tanstack.com/query) - Server state management
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [react-colorful](https://github.com/omgovich/react-colorful) - Color picker

---

**Status:** ✅ Ready to run initialization commands
**Next Step:** Execute Step 8 commands to create the frontend project
**Then:** Start building theme components following Phase 2a checklist

Let's build an amazing theme customization system! 🎨
