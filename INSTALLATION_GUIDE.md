# OmniNudge Installation Guide for Mac

This guide will help you install and run OmniNudge on your Mac computer, even if you have no software engineering experience. Just follow the steps in order, and copy/paste the commands into your Terminal application.

## What You'll Need

- A Mac computer running macOS
- An internet connection
- About 30-45 minutes

## What You DON'T Need

Good news! You do NOT need:
- **Reddit API credentials** - OmniNudge uses Reddit's public API to browse content. No API keys required!
- **Redis** - The app works fine without Redis. Redis is only used for optional caching to improve performance.

## Table of Contents

1. [Install Prerequisites](#step-1-install-prerequisites)
2. [Install and Setup PostgreSQL Database](#step-2-install-and-setup-postgresql-database)
3. [Install Go Programming Language](#step-3-install-go-programming-language)
4. [Install Node.js and npm](#step-4-install-nodejs-and-npm)
5. [Download OmniNudge](#step-5-download-omninudge)
6. [Set Up the Database](#step-6-set-up-the-database)
7. [Start the Backend Server](#step-7-start-the-backend-server)
8. [Start the Frontend Application](#step-8-start-the-frontend-application)
9. [Access OmniNudge](#step-9-access-omninudge)
10. [Stopping the Application](#stopping-the-application)
11. [Troubleshooting](#troubleshooting)

---

## Step 1: Install Prerequisites

### 1.1 Install Homebrew (Package Manager)

Homebrew is a tool that makes it easy to install software on Mac. We'll use it to install everything we need.

**Open Terminal:**
- Press `Cmd + Space` to open Spotlight Search
- Type "Terminal" and press Enter
- A window with a black or white background will open

**Install Homebrew by copying and pasting this command:**

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Press Enter and follow the on-screen instructions. You may need to enter your computer password (the one you use to log in).

**Important:** After installation completes, Homebrew might show you two commands to run (they start with `echo` and `eval`). Copy and paste those commands into Terminal and press Enter.

### 1.2 Install Git

Git is a tool for downloading and managing code. Install it by running:

```bash
brew install git
```

Wait for the installation to complete (this may take a few minutes).

---

## Step 2: Install and Setup PostgreSQL Database

PostgreSQL is a database system that OmniNudge uses to store information.

### 2.1 Install PostgreSQL

```bash
brew install postgresql@16
```

This will take several minutes to download and install.

### 2.2 Start PostgreSQL

After installation, start the PostgreSQL service:

```bash
brew services start postgresql@16
```

You should see a message saying "Successfully started postgresql@16".

### 2.3 Add PostgreSQL to Your PATH

This makes PostgreSQL commands available in Terminal:

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 2.4 Verify PostgreSQL is Running

Check that PostgreSQL is working:

```bash
psql --version
```

You should see something like `psql (PostgreSQL) 16.x`.

---

## Step 3: Install Go Programming Language

Go is the programming language used for the OmniNudge backend server.

### 3.1 Install Go

```bash
brew install go
```

### 3.2 Verify Go Installation

```bash
go version
```

You should see something like `go version go1.21.x darwin/arm64`.

---

## Step 4: Install Node.js and npm

Node.js and npm are needed for the OmniNudge frontend (the user interface).

### 4.1 Install Node.js

```bash
brew install node
```

### 4.2 Verify Installation

```bash
node --version
npm --version
```

You should see version numbers for both commands.

---

## Step 5: Download OmniNudge

Now we'll download the OmniNudge code from GitHub.

### 5.1 Choose a Location

Decide where you want to store OmniNudge on your computer. A good place is your Documents folder. Navigate there:

```bash
cd ~/Documents
```

### 5.2 Clone the Repository

Download the OmniNudge code:

```bash
git clone https://github.com/FallicoFunctions/OmniNudge.git
```

This will download all the code into a folder called "OmniNudge". It may take a minute or two.

### 5.3 Navigate into the Project

```bash
cd OmniNudge
```

**Note:** The folder name is case-sensitive, so make sure to use capital "O" and capital "N".

---

## Step 6: Set Up the Database

Now we'll create the databases that OmniNudge needs.

### 6.1 Create Your PostgreSQL User

First, let's create a database user for OmniNudge. You can choose any username and password you like:

```bash
createuser -s -P omninudge_user
```

When prompted:
- Enter a password (you'll need to type it twice)
- Remember this password - you'll need it later

**Tip:** Choose a simple password for local development like `password123`. This is only on your computer, so it doesn't need to be super secure.

### 6.2 Create the Development Database

```bash
createdb -O omninudge_user omninudge_dev
```

### 6.3 Create the Test Database

```bash
createdb -O omninudge_user omninudge_test
```

### 6.4 Verify Databases Were Created

```bash
psql -U omninudge_user -d omninudge_dev -c "SELECT version();"
```

You'll be prompted for your password. If successful, you'll see PostgreSQL version information.

---

## Step 7: Start the Backend Server

The backend server handles all the data and logic for OmniNudge.

### 7.1 Navigate to the Backend Directory

```bash
cd ~/Documents/OmniNudge/backend
```

### 7.2 Set Up Environment Variables

We need to tell the backend how to connect to your database. Create a file to store your database credentials:

```bash
cat > .env << 'EOF'
DB_USER=omninudge_user
DB_PASSWORD=password123
DB_NAME=omninudge_dev
DB_HOST=localhost
DB_PORT=5432
DB_SSLMODE=disable
JWT_SECRET=your-local-dev-secret-key
SERVER_PORT=8080
SERVER_HOST=localhost
EOF
```

**Important:** Replace `password123` with the password you chose in Step 6.1.

### 7.3 Load Environment Variables

```bash
export $(cat .env | xargs)
```

### 7.4 Install Go Dependencies

```bash
go mod download
```

This downloads all the code libraries the backend needs.

### 7.5 Start the Backend Server

```bash
go run ./cmd/server/
```

You should see messages like:
```
Starting OmniNudge server...
Connected to PostgreSQL database: omninudge_dev
Running database migrations...
Migrations complete
Server listening on http://localhost:8080
```

**Keep this Terminal window open!** The server needs to keep running. Open a new Terminal window for the next steps (Cmd+T for a new tab).

---

## Step 8: Start the Frontend Application

The frontend is the user interface you'll interact with in your web browser.

### 8.1 Open a New Terminal Window/Tab

Press `Cmd+T` to open a new tab in Terminal, or open a completely new Terminal window.

### 8.2 Navigate to the Frontend Directory

```bash
cd ~/Documents/OmniNudge/frontend
```

### 8.3 Install Frontend Dependencies

```bash
npm install
```

This will take several minutes as it downloads all necessary packages. You'll see lots of text scroll by - this is normal!

### 8.4 Set Up Frontend Environment

```bash
cp .env.example .env.development
```

This creates a configuration file that tells the frontend where to find the backend server.

### 8.5 Start the Frontend Development Server

```bash
npm run dev
```

You should see something like:
```
  VITE ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Keep this Terminal window open too!** Both the backend and frontend need to run simultaneously.

---

## Step 9: Access OmniNudge

### 9.1 Open Your Web Browser

1. Open your favorite web browser (Safari, Chrome, Firefox, etc.)
2. Go to: **http://localhost:5173**

You should see the OmniNudge application!

### 9.2 Create Your Account

1. Click "Sign Up" or "Register"
2. Choose a username and password
3. Optionally add an email address
4. Start using OmniNudge!

### 9.3 What You Can Do

Once logged in, you can:
- **Browse Reddit content** - No Reddit API keys needed! The app uses Reddit's public API
- **Create posts and comments** - Share your thoughts in OmniNudge hubs
- **Send encrypted messages** - Chat securely with other users
- **Upload and share media** - Images, videos, and GIFs
- **Customize your theme** - Make OmniNudge look the way you want

---

## Stopping the Application

When you're done using OmniNudge:

### Stop the Servers

1. Go to the Terminal window running the frontend (the one that says "VITE ready")
2. Press `Ctrl+C` to stop it

3. Go to the Terminal window running the backend (the one that says "Server listening")
4. Press `Ctrl+C` to stop it

### Stop PostgreSQL (Optional)

If you want to completely stop the database:

```bash
brew services stop postgresql@16
```

To start it again later:

```bash
brew services start postgresql@16
```

---

## Troubleshooting

### Problem: "command not found" errors

**Solution:** Make sure you completed all installation steps. Try closing and reopening Terminal, then trying again.

### Problem: PostgreSQL commands not found (Intel Mac)

**Solution:** If you have an Intel Mac instead of Apple Silicon (M1/M2/M3), the PostgreSQL path is different. Use this command instead:

```bash
echo 'export PATH="/usr/local/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Problem: "port already in use" error

**Solution:** Another program is using port 8080 or 5173. You can either:
1. Find and stop the other program
2. Or change the port in the `.env` file (backend) or by setting `PORT=3000` before running `npm run dev` (frontend)

### Problem: Cannot connect to database

**Solution:**
1. Make sure PostgreSQL is running: `brew services list`
2. Check your database credentials in the `.env` file
3. Try recreating the database:
   ```bash
   dropdb omninudge_dev
   createdb -O omninudge_user omninudge_dev
   ```

### Problem: "Password authentication failed"

**Solution:**
1. Make sure the password in your `.env` file matches what you set when creating the user
2. Try resetting the user password:
   ```bash
   psql postgres -c "ALTER USER omninudge_user WITH PASSWORD 'password123';"
   ```

### Problem: Backend starts but shows migration errors

**Solution:** The database migrations will run automatically when you start the backend. If you see errors, try:
1. Stop the backend server (Ctrl+C)
2. Delete and recreate the database:
   ```bash
   dropdb omninudge_dev
   createdb -O omninudge_user omninudge_dev
   ```
3. Start the backend again

### Problem: Frontend shows "Cannot connect to server"

**Solution:**
1. Make sure the backend is running in another Terminal window
2. Check that the backend is running on `http://localhost:8080`
3. Verify the `.env.development` file in the frontend folder has:
   ```
   VITE_API_URL=http://localhost:8080/api/v1
   VITE_WS_URL=ws://localhost:8080/ws
   ```

### Problem: npm install fails

**Solution:**
1. Make sure you have a stable internet connection
2. Try clearing the npm cache:
   ```bash
   npm cache clean --force
   npm install
   ```

---

## Starting OmniNudge Again Later

Once everything is installed, starting OmniNudge is much simpler:

### Option 1: Using Environment File

**Terminal 1 - Backend:**
```bash
cd ~/Documents/OmniNudge/backend
export $(cat .env | xargs)
go run ./cmd/server/
```

**Terminal 2 - Frontend:**
```bash
cd ~/Documents/OmniNudge/frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

### Option 2: Quick Start Script

You can create a simple script to start everything. Create a file called `start.sh`:

```bash
cd ~/Documents/OmniNudge
cat > start.sh << 'EOF'
#!/bin/bash

# Start PostgreSQL if not running
brew services start postgresql@16

# Start backend in background
cd backend
export $(cat .env | xargs)
go run ./cmd/server/ &
BACKEND_PID=$!

# Start frontend in background
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo "OmniNudge is starting..."
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Open http://localhost:5173 in your browser"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
EOF

chmod +x start.sh
```

Then you can start everything with:

```bash
cd ~/Documents/OmniNudge
./start.sh
```

---

## Next Steps

Now that OmniNudge is running:

1. Create an account
2. Browse Reddit content
3. Create posts and comments
4. Try the encrypted messaging features
5. Upload and share media
6. Customize your theme

For more information about features, see the main [README.md](README.md) file.

---

## Getting Help

If you run into issues not covered here:

1. Check the [main README](README.md) for technical documentation
2. Check the `/docs` folder for detailed documentation
3. Make sure all services (PostgreSQL, backend, frontend) are running
4. Try stopping everything and starting fresh

**Remember:** Both the backend and frontend need to be running at the same time for OmniNudge to work!
