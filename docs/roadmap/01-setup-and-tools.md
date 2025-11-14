# Setup and Tools Installation Guide

**Estimated Time:** 2-4 hours
**Prerequisites:** Computer with internet connection
**Platforms:** Instructions for macOS, Windows, and Linux where applicable

---

## Table of Contents

1. [Development Environment Setup](#development-environment-setup)
2. [Go Installation](#go-installation)
3. [Node.js and npm](#nodejs-and-npm)
4. [PostgreSQL Database](#postgresql-database)
5. [Redis Installation](#redis-installation)
6. [Git and GitHub](#git-and-github)
7. [VS Code Setup](#vs-code-setup)
8. [Essential VS Code Extensions](#essential-vs-code-extensions)
9. [Additional Tools](#additional-tools)
10. [Verification and Testing](#verification-and-testing)
11. [Project Directory Structure](#project-directory-structure)
12. [Environment Variables Setup](#environment-variables-setup)
13. [Troubleshooting](#troubleshooting)

---

## Development Environment Setup

### Overview

You'll need the following tools installed:
- **Go** - Backend language
- **Node.js + npm** - Frontend tooling
- **PostgreSQL** - Database
- **Redis** - Caching and sessions
- **Git** - Version control (already have)
- **VS Code** - Code editor
- **Postman or similar** - API testing

### System Requirements

**Minimum:**
- 8GB RAM
- 20GB free disk space
- Modern OS (macOS 10.15+, Windows 10+, Ubuntu 20.04+)

**Recommended:**
- 16GB RAM
- 50GB free disk space (for databases, media files during dev)
- SSD for faster compilation

---

## Go Installation

### Why Go Version Matters

We'll use **Go 1.21 or later** for best compatibility with libraries.

### macOS Installation

**Option 1: Using Homebrew (Recommended)**

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Go
brew install go

# Verify installation
go version
# Should output: go version go1.21.x darwin/amd64 (or arm64 for M1/M2)
```

**Option 2: Official Installer**

1. Visit https://go.dev/dl/
2. Download macOS installer (.pkg file)
3. Run installer, follow prompts
4. Open new terminal and verify: `go version`

### Windows Installation

**Using Official Installer:**

1. Visit https://go.dev/dl/
2. Download Windows installer (.msi file)
3. Run installer
   - Install to default location: `C:\Program Files\Go`
   - Installer adds Go to PATH automatically
4. Open Command Prompt (search "cmd")
5. Verify: `go version`

**Using Chocolatey (Alternative):**

```powershell
# In PowerShell as Administrator
choco install golang

# Verify
go version
```

### Linux Installation (Ubuntu/Debian)

```bash
# Remove old versions
sudo apt remove golang-go
sudo apt autoremove

# Download and install latest
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# Verify
go version
```

### Configure Go Environment

```bash
# Set GOPATH (where Go packages are installed)
# Add to ~/.bashrc, ~/.zshrc, or ~/.bash_profile

export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin

# Apply changes
source ~/.bashrc  # or source ~/.zshrc
```

### Test Go Installation

```bash
# Create a test program
mkdir -p ~/go-test && cd ~/go-test

# Create main.go
cat > main.go << 'EOF'
package main

import "fmt"

func main() {
    fmt.Println("Go is installed correctly!")
}
EOF

# Run it
go run main.go
# Should output: Go is installed correctly!

# Clean up
cd ~ && rm -rf ~/go-test
```

**If this works, Go is installed correctly! ✅**

---

## Node.js and npm

### Why Node.js?

Even though your backend is Go, you need Node.js for:
- React development (Vite build tool)
- JavaScript package management (npm)
- Frontend tooling

### macOS Installation

**Using Homebrew (Recommended):**

```bash
# Install Node.js (includes npm)
brew install node

# Verify
node --version  # Should be v18.x or v20.x
npm --version   # Should be 9.x or 10.x
```

**Using Official Installer:**

1. Visit https://nodejs.org/
2. Download LTS version (Long Term Support)
3. Run installer
4. Verify in terminal: `node --version && npm --version`

### Windows Installation

**Official Installer:**

1. Visit https://nodejs.org/
2. Download Windows Installer (.msi) - LTS version
3. Run installer
   - Check "Automatically install necessary tools"
   - This installs build tools needed for some npm packages
4. Open Command Prompt
5. Verify: `node --version && npm --version`

### Linux Installation (Ubuntu/Debian)

```bash
# Using NodeSource repository (gets latest versions)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

### Install pnpm or yarn (Optional but Recommended)

**pnpm** is faster than npm and saves disk space.

```bash
# Install pnpm globally
npm install -g pnpm

# Verify
pnpm --version

# Or install yarn
npm install -g yarn
yarn --version
```

**Use pnpm or yarn instead of npm for faster installs.**

---

## PostgreSQL Database

### macOS Installation

**Using Homebrew:**

```bash
# Install PostgreSQL
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15

# Verify it's running
brew services list
# Should show postgresql@15 as "started"

# Access PostgreSQL
psql postgres

# You should see: postgres=#
# Type \q to quit
```

**Using Postgres.app (Alternative):**

1. Visit https://postgresapp.com/
2. Download and install Postgres.app
3. Open app, click "Initialize"
4. PostgreSQL is now running
5. Add to PATH (in ~/.zshrc or ~/.bashrc):
   ```bash
   export PATH=$PATH:/Applications/Postgres.app/Contents/Versions/latest/bin
   ```

### Windows Installation

**Using Official Installer:**

1. Visit https://www.postgresql.org/download/windows/
2. Download installer (version 15.x)
3. Run installer
   - Set password for postgres user (remember this!)
   - Port: 5432 (default)
   - Locale: Default
4. Installation includes pgAdmin (GUI tool)
5. Verify in Command Prompt:
   ```powershell
   psql -U postgres
   # Enter password you set
   ```

### Linux Installation (Ubuntu/Debian)

```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify
sudo systemctl status postgresql

# Access PostgreSQL
sudo -u postgres psql
```

### Create Your Project Database

```bash
# Access PostgreSQL
psql postgres  # macOS/Linux
# or
psql -U postgres  # Windows

# Create database
CREATE DATABASE chatreddit_dev;

# Create user (optional but recommended)
CREATE USER chatreddit_user WITH PASSWORD 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE chatreddit_dev TO chatreddit_user;

# List databases to verify
\l

# Exit
\q
```

### PostgreSQL GUI Tools (Optional)

**pgAdmin** - Web-based interface
- Included with Windows installer
- macOS/Linux: `brew install --cask pgadmin4` or download from https://www.pgadmin.org/

**DBeaver** - Universal database tool
- Download from https://dbeaver.io/
- Free, supports many databases
- User-friendly interface

**TablePlus** - Modern database GUI (macOS/Windows)
- Download from https://tableplus.com/
- Free tier available
- Sleek interface

---

## Redis Installation

### macOS Installation

```bash
# Install Redis
brew install redis

# Start Redis service
brew services start redis

# Verify
redis-cli ping
# Should output: PONG

# Or start manually (doesn't run on boot)
redis-server
# Opens Redis server in terminal (Ctrl+C to stop)
```

### Windows Installation

**Redis doesn't officially support Windows. Options:**

**Option 1: WSL (Windows Subsystem for Linux) - Recommended**

```powershell
# In PowerShell as Administrator
wsl --install

# Restart computer

# In WSL terminal
sudo apt update
sudo apt install redis-server

# Start Redis
sudo service redis-server start

# Verify
redis-cli ping
```

**Option 2: Memurai (Windows port of Redis)**

1. Visit https://www.memurai.com/
2. Download Memurai Developer Edition (free)
3. Install and run
4. Works like Redis, compatible with Redis clients

**Option 3: Docker (if you have Docker)**

```powershell
docker run -d -p 6379:6379 redis:latest
```

### Linux Installation (Ubuntu/Debian)

```bash
# Install Redis
sudo apt update
sudo apt install redis-server

# Start service
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify
redis-cli ping
# Should output: PONG
```

### Test Redis

```bash
# Open Redis CLI
redis-cli

# Set a value
SET test "Hello Redis"

# Get the value
GET test
# Should return: "Hello Redis"

# Exit
exit
```

---

## Git and GitHub

You already have Git set up based on your project context.

### Verify Git Installation

```bash
git --version
# Should output: git version 2.x.x
```

### Configure Git (If Not Done)

```bash
# Set your name
git config --global user.name "Your Name"

# Set your email
git config --global user.email "your.email@example.com"

# Verify
git config --list
```

### GitHub SSH Setup (Recommended)

**Check if you have SSH key:**

```bash
ls -la ~/.ssh
# Look for id_rsa.pub or id_ed25519.pub
```

**Generate new SSH key if needed:**

```bash
# Generate key
ssh-keygen -t ed25519 -C "your.email@example.com"

# Press Enter to accept default location
# Enter passphrase (optional but recommended)

# Start SSH agent
eval "$(ssh-agent -s)"

# Add key to agent
ssh-add ~/.ssh/id_ed25519

# Copy public key to clipboard
# macOS:
pbcopy < ~/.ssh/id_ed25519.pub

# Linux:
cat ~/.ssh/id_ed25519.pub
# Copy the output manually

# Windows (Git Bash):
cat ~/.ssh/id_ed25519.pub | clip
```

**Add to GitHub:**

1. Go to GitHub.com → Settings → SSH and GPG keys
2. Click "New SSH key"
3. Paste your public key
4. Click "Add SSH key"

**Test connection:**

```bash
ssh -T git@github.com
# Should output: Hi [username]! You've successfully authenticated...
```

---

## VS Code Setup

### Installation

**macOS:**
```bash
brew install --cask visual-studio-code

# Or download from https://code.visualstudio.com/
```

**Windows:**
1. Visit https://code.visualstudio.com/
2. Download Windows installer
3. Run installer
   - Check "Add to PATH"
   - Check "Register Code as an editor for supported file types"

**Linux:**
```bash
# Using Snap
sudo snap install --classic code

# Or download .deb from https://code.visualstudio.com/
```

### Verify Installation

```bash
# Should open VS Code
code --version

# Open current directory in VS Code
code .
```

### Initial VS Code Configuration

**Settings to Change:**

1. Open VS Code
2. Press `Cmd+,` (macOS) or `Ctrl+,` (Windows/Linux)
3. Search for these settings and configure:

**Recommended Settings:**

```json
{
  "editor.formatOnSave": true,
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 1000,
  "terminal.integrated.defaultProfile.osx": "zsh",
  "go.formatTool": "gofmt",
  "go.lintTool": "golangci-lint",
  "go.useLanguageServer": true,
  "[go]": {
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports": true
    }
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

To add these:
1. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows)
2. Type "Preferences: Open Settings (JSON)"
3. Paste the settings above

---

## Essential VS Code Extensions

### Go Extension

```bash
# Install from command line
code --install-extension golang.go
```

**Or install from VS Code:**
1. Click Extensions icon (sidebar)
2. Search "Go"
3. Install "Go" by Go Team at Google

**After installing, install Go tools:**
1. Open command palette: `Cmd+Shift+P`
2. Type "Go: Install/Update Tools"
3. Select all tools
4. Click OK

This installs:
- gopls (language server)
- dlv (debugger)
- staticcheck (linter)
- And more...

### JavaScript/React Extensions

**ESLint:**
```bash
code --install-extension dbaeumer.vscode-eslint
```

**Prettier (Code Formatter):**
```bash
code --install-extension esbenp.prettier-vscode
```

**ES7+ React Snippets:**
```bash
code --install-extension dsznajder.es7-react-js-snippets
```

### Database Extensions

**PostgreSQL:**
```bash
code --install-extension ckolkman.vscode-postgres
```

**Redis:**
```bash
code --install-extension humao.rest-client
# For testing Redis commands
```

### Utility Extensions

**GitLens:**
```bash
code --install-extension eamodio.gitlens
```
Shows Git blame, history, and more inline.

**Thunder Client (API Testing):**
```bash
code --install-extension rangav.vscode-thunder-client
```
Like Postman but built into VS Code.

**Markdown Preview:**
```bash
code --install-extension yzhang.markdown-all-in-one
```
Better markdown editing and preview.

**Path Intellisense:**
```bash
code --install-extension christian-kohler.path-intellisense
```
Autocompletes filenames.

**Auto Rename Tag:**
```bash
code --install-extension formulahendry.auto-rename-tag
```
Auto renames paired HTML/JSX tags.

**Bracket Pair Colorizer (Built-in now in VS Code):**
No need to install, enabled by default.

### Install All at Once

```bash
# Copy and paste this into terminal
code --install-extension golang.go && \
code --install-extension dbaeumer.vscode-eslint && \
code --install-extension esbenp.prettier-vscode && \
code --install-extension dsznajder.es7-react-js-snippets && \
code --install-extension ckolkman.vscode-postgres && \
code --install-extension eamodio.gitlens && \
code --install-extension rangav.vscode-thunder-client && \
code --install-extension yzhang.markdown-all-in-one && \
code --install-extension christian-kohler.path-intellisense && \
code --install-extension formulahendry.auto-rename-tag
```

---

## Additional Tools

### Postman (API Testing)

**Alternative to Thunder Client if you prefer standalone app.**

1. Visit https://www.postman.com/downloads/
2. Download for your OS
3. Install and create free account
4. Used for testing API endpoints during development

**Thunder Client (VS Code extension) is simpler for this project.**

### Docker (Optional)

**Why:** Useful for running PostgreSQL/Redis in containers, but not required.

**macOS:**
```bash
brew install --cask docker
```

**Windows/Linux:** Download from https://www.docker.com/products/docker-desktop/

**Not required for this project** - we'll install PostgreSQL and Redis natively.

### Ngrok (For Testing Webhooks Later)

**Exposes localhost to internet (useful for testing Reddit OAuth callback).**

```bash
# macOS
brew install --cask ngrok

# Windows
choco install ngrok

# Or download from https://ngrok.com/
```

**Not needed initially** - we'll use this when deploying and testing OAuth.

---

## Verification and Testing

### Run All Verification Commands

Create a test script to verify everything:

**Create `verify-setup.sh` (macOS/Linux):**

```bash
#!/bin/bash

echo "=== Verifying Development Environment ==="
echo ""

echo "1. Go:"
go version || echo "❌ Go not installed"
echo ""

echo "2. Node.js:"
node --version || echo "❌ Node not installed"
echo ""

echo "3. npm:"
npm --version || echo "❌ npm not installed"
echo ""

echo "4. PostgreSQL:"
psql --version || echo "❌ PostgreSQL not installed"
echo ""

echo "5. Redis:"
redis-cli ping || echo "❌ Redis not running"
echo ""

echo "6. Git:"
git --version || echo "❌ Git not installed"
echo ""

echo "7. VS Code:"
code --version || echo "❌ VS Code not installed"
echo ""

echo "=== All checks complete ==="
```

**Run it:**

```bash
chmod +x verify-setup.sh
./verify-setup.sh
```

**All should show versions except Redis should show "PONG".**

### Create Test Database

```bash
# Access PostgreSQL
psql postgres

# Create test database
CREATE DATABASE test_connection;

# Connect to it
\c test_connection

# Create test table
CREATE TABLE test (id SERIAL PRIMARY KEY, message TEXT);

# Insert data
INSERT INTO test (message) VALUES ('Hello from PostgreSQL!');

# Query
SELECT * FROM test;
# Should show: 1 | Hello from PostgreSQL!

# Drop test database
\c postgres
DROP DATABASE test_connection;

# Exit
\q
```

**If this works, PostgreSQL is set up correctly! ✅**

### Test Redis Connection

```bash
# Start Redis if not running
redis-server &

# Open Redis CLI
redis-cli

# Test commands
SET test_key "Hello Redis"
GET test_key
# Should return: "Hello Redis"

PING
# Should return: PONG

# Exit
exit
```

**If this works, Redis is set up correctly! ✅**

---

## Project Directory Structure

### Create Your Project Structure

```bash
# Navigate to your projects directory
cd ~/projects  # or wherever you want

# Create main project directory
mkdir chatreddit && cd chatreddit

# Create subdirectories
mkdir -p backend frontend docs

# Initialize Git (if not already)
git init

# Create .gitignore
cat > .gitignore << 'EOF'
# Backend (Go)
backend/tmp/
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
vendor/

# Frontend (React)
frontend/node_modules/
frontend/dist/
frontend/build/
.env
.env.local

# IDEs
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log

# Database
*.db
*.sqlite

# Environment variables
.env
.env.local
.env.*.local

# Media uploads (during development)
uploads/
media/

# Temporary files
tmp/
temp/
EOF

# Create README
cat > README.md << 'EOF'
# ChatReddit Platform

A social platform combining Reddit integration with multimedia chat features.

## Project Structure

- `backend/` - Go backend server
- `frontend/` - React frontend application
- `docs/` - Project documentation

## Setup

See `docs/roadmap/01-setup-and-tools.md` for environment setup.

## Development

(Instructions will be added as we build)
EOF

# Initial commit
git add .
git commit -m "Initial project structure"
```

Your directory should now look like:

```
chatreddit/
├── .git/
├── .gitignore
├── README.md
├── docs/
│   ├── phase-lists/
│   ├── roadmap/
│   └── technical/
├── backend/
└── frontend/
```

---

## Environment Variables Setup

### Backend .env File

We'll create this later, but here's the template:

**Create `backend/.env.example`:**

```bash
cd backend

cat > .env.example << 'EOF'
# Server Configuration
PORT=8080
ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=chatreddit_user
DB_PASSWORD=your_secure_password
DB_NAME=chatreddit_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Reddit OAuth
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_REDIRECT_URI=http://localhost:3000/auth/reddit/callback
REDDIT_USER_AGENT=yourplatform:v1.0

# JWT Secret (generate a random string)
JWT_SECRET=your_very_long_random_secret_key_here

# Media Storage
STORAGE_TYPE=local  # or s3, r2
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Encryption
ENCRYPTION_KEY=your_32_byte_encryption_key_here
EOF

# Copy to actual .env (don't commit this)
cp .env.example .env
```

**Never commit `.env` to Git** - it's in `.gitignore`.

### Frontend .env File

**Create `frontend/.env.example`:**

```bash
cd ../frontend

cat > .env.example << 'EOF'
# API Configuration
VITE_API_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080/ws

# Environment
VITE_ENV=development
EOF

# Copy to actual .env
cp .env.example .env
```

---

## Troubleshooting

### Go Issues

**Problem: "go: command not found"**

Solution:
- Verify Go is installed: Download from https://go.dev/
- Check PATH includes Go:
  ```bash
  echo $PATH | grep go
  ```
- Add to PATH if missing:
  ```bash
  export PATH=$PATH:/usr/local/go/bin
  ```

**Problem: "GOPATH not set"**

Solution:
```bash
export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin
```

Add to `~/.bashrc` or `~/.zshrc` to make permanent.

### PostgreSQL Issues

**Problem: "psql: command not found"**

Solution:
- Verify PostgreSQL is installed
- Add to PATH:
  - macOS Homebrew: `export PATH=$PATH:/opt/homebrew/opt/postgresql@15/bin`
  - Postgres.app: `export PATH=$PATH:/Applications/Postgres.app/Contents/Versions/latest/bin`

**Problem: "connection refused"**

Solution:
```bash
# macOS
brew services restart postgresql@15

# Linux
sudo systemctl restart postgresql

# Windows
# Restart PostgreSQL service from Services app
```

**Problem: "role 'username' does not exist"**

Solution:
```bash
# Create the user
createuser -s your_username

# Or in psql:
CREATE USER your_username WITH SUPERUSER;
```

### Redis Issues

**Problem: "redis-cli: command not found"**

Solution:
- Verify Redis is installed: `brew list redis` (macOS)
- Check if service is running: `brew services list`

**Problem: "Could not connect to Redis"**

Solution:
```bash
# Start Redis
brew services start redis  # macOS
sudo systemctl start redis  # Linux

# Or run manually
redis-server
```

### Node.js / npm Issues

**Problem: "npm: command not found"**

Solution:
- Reinstall Node.js from https://nodejs.org/
- Node.js includes npm automatically

**Problem: Permission errors with npm**

Solution:
```bash
# Don't use sudo with npm
# Instead, configure npm to use a different directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Add to ~/.bashrc or ~/.zshrc to make permanent
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
```

### VS Code Issues

**Problem: Extensions not installing**

Solution:
- Check internet connection
- Restart VS Code
- Clear extension cache:
  ```bash
  rm -rf ~/.vscode/extensions
  ```
  Then reinstall extensions.

**Problem: Go tools not installing**

Solution:
```bash
# Manually install Go tools
go install golang.org/x/tools/gopls@latest
go install github.com/go-delve/delve/cmd/dlv@latest
go install honnef.co/go/tools/cmd/staticcheck@latest
```

### General Issues

**Problem: Different versions than documented**

Solution: This is usually fine. As long as:
- Go is 1.20+
- Node.js is 18+
- PostgreSQL is 14+
- Redis is 6+

You should be okay. Adjust as needed.

**Problem: Running out of disk space**

Solution:
- Clean up:
  ```bash
  # Go cache
  go clean -cache -modcache -testcache

  # npm cache
  npm cache clean --force

  # Docker (if using)
  docker system prune -a
  ```

---

## Next Steps

**You've completed setup! ✅**

**Your environment should now have:**
- ✅ Go 1.21+ installed and working
- ✅ Node.js 18+ and npm
- ✅ PostgreSQL database running
- ✅ Redis cache running
- ✅ Git configured
- ✅ VS Code with extensions
- ✅ Project directory structure created

**Next: Start learning Go!**

Proceed to `02-month-0-learning-go.md` to begin your Go learning curriculum.

---

## Quick Reference Commands

```bash
# Check versions
go version
node --version
npm --version
psql --version
redis-cli --version
git --version

# Start services (macOS)
brew services start postgresql@15
brew services start redis

# Start services (Linux)
sudo systemctl start postgresql
sudo systemctl start redis

# Access databases
psql postgres
redis-cli

# Open project in VS Code
cd ~/projects/chatreddit
code .

# Run verification script
./verify-setup.sh
```

Keep this guide handy for reference throughout development!
