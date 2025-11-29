# Month 0: Learning Go

**Duration:** 4 weeks (2 hours/day = 56 hours total)
**Goal:** Gain sufficient Go knowledge to start building the project confidently
**Prerequisite:** Setup completed (`01-setup-and-tools.md`)

---

## Learning Philosophy

You're coming from Java, which gives you a huge advantage:
- You understand statically typed languages
- You know OOP concepts (though Go is different)
- You understand compilation
- You know basic programming constructs

**Go vs Java:**
- Simpler: No classes, no inheritance, no generics (until recently)
- Faster compilation: Seconds vs minutes
- Better concurrency: Goroutines vs threads
- Less verbose: No getters/setters everywhere
- Different style: Composition over inheritance

**Your Goal:**
Not to become a Go expert, but to be comfortable enough to:
- Read Go code and understand it
- Write basic Go programs
- Use packages and libraries
- Debug errors
- Google effectively when stuck

---

## Week 1: Go Fundamentals

### Day 1: Tour of Go (2 hours)

**Resource:** https://go.dev/tour/

**Topics to Complete:**
1. Basics (Packages, imports, exported names)
2. Functions
3. Variables
4. Basic types
5. Type conversions
6. Constants

**Hands-On Exercise:**

Create `hello.go`:
```go
package main

import "fmt"

func main() {
    name := "OmniNudge Developer"
    fmt.Printf("Hello, %s!\n", name)
    fmt.Println("Learning Go to build something awesome!")
}
```

Run it:
```bash
go run hello.go
```

**What You Learned:**
- `package main` - entry point
- `import` - bringing in packages
- `:=` - short variable declaration
- `fmt.Printf` - formatted printing

### Day 2: Control Flow (2 hours)

**Tour of Go:** Continue through Flow Control section

**Topics:**
- For loops (only loop in Go!)
- If statements
- Switch statements
- Defer statements

**Hands-On Exercise:**

Create `control-flow.go`:
```go
package main

import "fmt"

func main() {
    // For loop
    for i := 0; i < 5; i++ {
        fmt.Println("Count:", i)
    }

    // While-style for loop
    x := 0
    for x < 3 {
        fmt.Println("X:", x)
        x++
    }

    // If statement
    if x > 2 {
        fmt.Println("X is greater than 2")
    }

    // Switch
    switch x {
    case 1:
        fmt.Println("One")
    case 3:
        fmt.Println("Three")
    default:
        fmt.Println("Other")
    }
}
```

### Day 3: Data Structures (2 hours)

**Tour of Go:** More types section

**Topics:**
- Pointers (similar to Java references)
- Structs (like Java classes but no methods yet)
- Arrays
- Slices (dynamic arrays, use these mostly)
- Maps (like Java HashMap)

**Hands-On Exercise:**

Create `data-structures.go`:
```go
package main

import "fmt"

// Struct definition (like a Java class without methods)
type User struct {
    ID       int
    Username string
    Karma    int
}

func main() {
    // Create struct
    user := User{
        ID:       1,
        Username: "yorkielover42",
        Karma:    150,
    }
    fmt.Printf("User: %+v\n", user)

    // Slices (dynamic arrays)
    numbers := []int{1, 2, 3, 4, 5}
    numbers = append(numbers, 6)
    fmt.Println("Numbers:", numbers)

    // Maps
    karma := make(map[string]int)
    karma["alice"] = 100
    karma["bob"] = 200
    fmt.Println("Karma:", karma)
}
```

### Day 4: Functions & Methods (2 hours)

**Topics:**
- Multiple return values (huge in Go)
- Named return values
- Methods on structs
- Pointer receivers vs value receivers

**Hands-On Exercise:**

Create `functions.go`:
```go
package main

import (
    "errors"
    "fmt"
)

type User struct {
    Username string
    Karma    int
}

// Method on User (like Java instance method)
func (u *User) AddKarma(points int) {
    u.Karma += points
}

// Method with return value
func (u User) GetDisplayName() string {
    return fmt.Sprintf("%s (%d karma)", u.Username, u.Karma)
}

// Function with multiple returns (very common in Go)
func validateUsername(username string) (bool, error) {
    if len(username) < 3 {
        return false, errors.New("username too short")
    }
    return true, nil
}

func main() {
    user := &User{Username: "alice", Karma: 10}

    user.AddKarma(5)
    fmt.Println(user.GetDisplayName())

    valid, err := validateUsername("ab")
    if err != nil {
        fmt.Println("Error:", err)
    } else {
        fmt.Println("Valid:", valid)
    }
}
```

**Key Concept: Error Handling**

Go doesn't have exceptions. Instead:
```go
result, err := someFunction()
if err != nil {
    // handle error
    return err
}
// use result
```

You'll see this pattern EVERYWHERE in Go.

### Day 5: Interfaces (2 hours)

**Topics:**
- Interfaces (different from Java!)
- Implicit implementation (no "implements" keyword)
- Empty interface `interface{}`
- Type assertions

**Hands-On Exercise:**

Create `interfaces.go`:
```go
package main

import "fmt"

// Interface definition
type Speaker interface {
    Speak() string
}

// Different types implementing Speaker
type Dog struct {
    Name string
}

func (d Dog) Speak() string {
    return "Woof! I'm " + d.Name
}

type Cat struct {
    Name string
}

func (c Cat) Speak() string {
    return "Meow! I'm " + c.Name
}

// Function that accepts interface
func makeSound(s Speaker) {
    fmt.Println(s.Speak())
}

func main() {
    dog := Dog{Name: "Buddy"}
    cat := Cat{Name: "Whiskers"}

    // Both work because they implement Speaker
    makeSound(dog)
    makeSound(cat)
}
```

**Key Difference from Java:**
- No explicit `implements` keyword
- If a type has the methods, it implements the interface automatically
- Much more flexible!

### Day 6-7: Practice Project (4 hours)

**Build a Simple CLI TODO App:**

Create `todo/main.go`:
```go
package main

import (
    "bufio"
    "fmt"
    "os"
    "strings"
)

type Todo struct {
    ID   int
    Task string
    Done bool
}

type TodoList struct {
    todos []Todo
    nextID int
}

func (tl *TodoList) Add(task string) {
    todo := Todo{
        ID:   tl.nextID,
        Task: task,
        Done: false,
    }
    tl.todos = append(tl.todos, todo)
    tl.nextID++
    fmt.Printf("Added: %s (ID: %d)\n", task, todo.ID)
}

func (tl *TodoList) List() {
    if len(tl.todos) == 0 {
        fmt.Println("No todos yet!")
        return
    }

    for _, todo := range tl.todos {
        status := " "
        if todo.Done {
            status = "✓"
        }
        fmt.Printf("[%s] %d. %s\n", status, todo.ID, todo.Task)
    }
}

func (tl *TodoList) Complete(id int) {
    for i := range tl.todos {
        if tl.todos[i].ID == id {
            tl.todos[i].Done = true
            fmt.Printf("Completed: %s\n", tl.todos[i].Task)
            return
        }
    }
    fmt.Println("Todo not found")
}

func main() {
    list := &TodoList{nextID: 1}
    scanner := bufio.NewScanner(os.Stdin)

    fmt.Println("=== Simple Todo App ===")
    fmt.Println("Commands: add <task>, list, done <id>, quit")

    for {
        fmt.Print("> ")
        scanner.Scan()
        input := scanner.Text()

        parts := strings.Split(input, " ")
        command := parts[0]

        switch command {
        case "add":
            if len(parts) < 2 {
                fmt.Println("Usage: add <task>")
                continue
            }
            task := strings.Join(parts[1:], " ")
            list.Add(task)

        case "list":
            list.List()

        case "done":
            if len(parts) < 2 {
                fmt.Println("Usage: done <id>")
                continue
            }
            var id int
            fmt.Sscanf(parts[1], "%d", &id)
            list.Complete(id)

        case "quit":
            fmt.Println("Goodbye!")
            return

        default:
            fmt.Println("Unknown command")
        }
    }
}
```

Run it:
```bash
go run todo/main.go
```

Test commands:
```
> add Learn Go
> add Build project
> list
> done 1
> list
> quit
```

**What You Practiced:**
- Structs
- Methods
- Slices
- String manipulation
- User input
- Control flow

---

## Week 2: Go for Web Development

### Day 8: HTTP Server Basics (2 hours)

**Topics:**
- net/http package
- Creating routes
- Handling requests
- Sending responses

**Exercise:**

Create `http-server/main.go`:
```go
package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
)

type User struct {
    ID       int    `json:"id"`
    Username string `json:"username"`
}

func main() {
    // Route handlers
    http.HandleFunc("/", homeHandler)
    http.HandleFunc("/api/user", userHandler)
    http.HandleFunc("/api/hello", helloHandler)

    fmt.Println("Server starting on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}

func homeHandler(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Welcome to Go HTTP Server!")
}

func helloHandler(w http.ResponseWriter, r *http.Request) {
    name := r.URL.Query().Get("name")
    if name == "" {
        name = "World"
    }
    fmt.Fprintf(w, "Hello, %s!", name)
}

func userHandler(w http.ResponseWriter, r *http.Request) {
    user := User{
        ID:       1,
        Username: "gopher",
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}
```

Test it:
```bash
go run http-server/main.go

# In another terminal:
curl http://localhost:8080/
curl http://localhost:8080/api/hello?name=OmniNudge
curl http://localhost:8080/api/user
```

### Day 9: JSON Handling (2 hours)

**Topics:**
- Encoding JSON (Marshal)
- Decoding JSON (Unmarshal)
- Struct tags
- Working with API responses

**Exercise:**

Create `json-practice/main.go`:
```go
package main

import (
    "encoding/json"
    "fmt"
    "log"
)

type Message struct {
    ID        int    `json:"id"`
    Text      string `json:"text"`
    Sender    string `json:"sender"`
    Encrypted bool   `json:"encrypted"`
}

func main() {
    // Encoding (Go struct -> JSON string)
    msg := Message{
        ID:        1,
        Text:      "Hello OmniNudge!",
        Sender:    "alice",
        Encrypted: true,
    }

    jsonData, err := json.Marshal(msg)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("JSON:", string(jsonData))

    // Decoding (JSON string -> Go struct)
    jsonStr := `{"id":2,"text":"Reply from Bob","sender":"bob","encrypted":true}`

    var newMsg Message
    err = json.Unmarshal([]byte(jsonStr), &newMsg)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Decoded: %+v\n", newMsg)

    // Pretty print
    prettyJSON, _ := json.MarshalIndent(msg, "", "  ")
    fmt.Println("Pretty JSON:\n", string(prettyJSON))
}
```

### Day 10: Using the Gin Framework (2 hours)

**Why Gin:**
- Most popular Go web framework
- Fast and simple
- Great documentation
- Similar to Express.js (if you know that)

**Install Gin:**
```bash
go get -u github.com/gin-gonic/gin
```

**Exercise:**

Create `gin-server/main.go`:
```go
package main

import (
    "net/http"
    "github.com/gin-gonic/gin"
)

type User struct {
    ID       int    `json:"id"`
    Username string `json:"username"`
    Karma    int    `json:"karma"`
}

var users = []User{
    {ID: 1, Username: "alice", Karma: 150},
    {ID: 2, Username: "bob", Karma: 200},
}

func main() {
    router := gin.Default()

    // Routes
    router.GET("/", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{
            "message": "Welcome to OmniNudge API",
        })
    })

    router.GET("/users", getUsers)
    router.GET("/users/:id", getUser)
    router.POST("/users", createUser)

    router.Run(":8080")
}

func getUsers(c *gin.Context) {
    c.JSON(http.StatusOK, users)
}

func getUser(c *gin.Context) {
    id := c.Param("id")

    for _, user := range users {
        if fmt.Sprintf("%d", user.ID) == id {
            c.JSON(http.StatusOK, user)
            return
        }
    }

    c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
}

func createUser(c *gin.Context) {
    var newUser User

    if err := c.BindJSON(&newUser); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    newUser.ID = len(users) + 1
    users = append(users, newUser)

    c.JSON(http.StatusCreated, newUser)
}
```

Test:
```bash
go run gin-server/main.go

# Test endpoints:
curl http://localhost:8080/
curl http://localhost:8080/users
curl http://localhost:8080/users/1
curl -X POST http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"username":"charlie","karma":50}'
```

### Day 11: Database Basics with PostgreSQL (2 hours)

**Install database driver:**
```bash
go get github.com/lib/pq
```

**Exercise:**

Create `db-practice/main.go`:
```go
package main

import (
    "database/sql"
    "fmt"
    "log"

    _ "github.com/lib/pq"
)

type User struct {
    ID       int
    Username string
    Karma    int
}

func main() {
    // Connection string
    connStr := "host=localhost port=5432 user=postgres dbname=omninudge_dev sslmode=disable"

    db, err := sql.Open("postgres", connStr)
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    // Test connection
    err = db.Ping()
    if err != nil {
        log.Fatal("Cannot connect to database:", err)
    }
    fmt.Println("Connected to database!")

    // Create table
    createTable(db)

    // Insert user
    insertUser(db, "alice", 150)
    insertUser(db, "bob", 200)

    // Query users
    users := getUsers(db)
    for _, user := range users {
        fmt.Printf("User: %+v\n", user)
    }
}

func createTable(db *sql.DB) {
    query := `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        karma INTEGER DEFAULT 0
    )
    `
    _, err := db.Exec(query)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("Table created")
}

func insertUser(db *sql.DB, username string, karma int) {
    query := "INSERT INTO users (username, karma) VALUES ($1, $2)"
    _, err := db.Exec(query, username, karma)
    if err != nil {
        log.Println("Insert error:", err)
    } else {
        fmt.Println("Inserted:", username)
    }
}

func getUsers(db *sql.DB) []User {
    query := "SELECT id, username, karma FROM users"
    rows, err := db.Query(query)
    if err != nil {
        log.Fatal(err)
    }
    defer rows.Close()

    var users []User
    for rows.Next() {
        var user User
        err := rows.Scan(&user.ID, &user.Username, &user.Karma)
        if err != nil {
            log.Println("Scan error:", err)
            continue
        }
        users = append(users, user)
    }

    return users
}
```

### Day 12-14: Build a Simple REST API (6 hours)

**Project: User Management API with Database**

This combines everything you've learned. You'll build this in the remaining roadmap documents when you actually start the project. For now, focus on understanding the concepts.

**Day 12:** Set up Gin + PostgreSQL integration
**Day 13:** Create CRUD endpoints (Create, Read, Update, Delete)
**Day 14:** Add error handling and validation

---

## Week 3: Concurrency & Real-Time

### Day 15-16: Goroutines and Channels (4 hours)

**This is Go's superpower!**

**Topics:**
- Goroutines (lightweight threads)
- Channels (communication between goroutines)
- Select statement

**Exercise Day 15:**

Create `concurrency/goroutines.go`:
```go
package main

import (
    "fmt"
    "time"
)

func say(message string) {
    for i := 0; i < 3; i++ {
        fmt.Println(message)
        time.Sleep(100 * time.Millisecond)
    }
}

func main() {
    // Run concurrently with 'go' keyword
    go say("Hello")
    go say("World")

    // Wait for goroutines (better ways exist, but simple for now)
    time.Sleep(1 * time.Second)
}
```

**Exercise Day 16 - Channels:**

Create `concurrency/channels.go`:
```go
package main

import "fmt"

func sum(numbers []int, result chan int) {
    sum := 0
    for _, num := range numbers {
        sum += num
    }
    result <- sum  // Send to channel
}

func main() {
    numbers := []int{1, 2, 3, 4, 5, 6}

    // Create channel
    resultChan := make(chan int)

    // Split work between goroutines
    mid := len(numbers) / 2
    go sum(numbers[:mid], resultChan)
    go sum(numbers[mid:], resultChan)

    // Receive from channel
    sum1 := <-resultChan
    sum2 := <-resultChan

    fmt.Println("Total:", sum1 + sum2)
}
```

### Day 17-18: WebSockets (4 hours)

**Install gorilla/websocket:**
```bash
go get github.com/gorilla/websocket
```

**Exercise:**

Create `websocket-chat/main.go`:
```go
package main

import (
    "fmt"
    "log"
    "net/http"

    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return true  // Allow all origins for development
    },
}

var clients = make(map[*websocket.Conn]bool)
var broadcast = make(chan Message)

type Message struct {
    Username string `json:"username"`
    Message  string `json:"message"`
}

func main() {
    http.HandleFunc("/ws", handleWebSocket)

    // Start broadcasting
    go handleMessages()

    fmt.Println("WebSocket server on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Println(err)
        return
    }
    defer conn.Close()

    clients[conn] = true

    for {
        var msg Message
        err := conn.ReadJSON(&msg)
        if err != nil {
            delete(clients, conn)
            break
        }

        broadcast <- msg
    }
}

func handleMessages() {
    for {
        msg := <-broadcast

        for client := range clients {
            err := client.WriteJSON(msg)
            if err != nil {
                client.Close()
                delete(clients, client)
            }
        }
    }
}
```

**Test with HTML client:**

Create `websocket-chat/client.html`:
```html
<!DOCTYPE html>
<html>
<head>
    <title>WebSocket Chat</title>
</head>
<body>
    <h1>WebSocket Chat</h1>
    <div id="messages"></div>
    <input id="username" placeholder="Username" />
    <input id="message" placeholder="Message" />
    <button onclick="sendMessage()">Send</button>

    <script>
        const ws = new WebSocket('ws://localhost:8080/ws');

        ws.onmessage = function(event) {
            const msg = JSON.parse(event.data);
            const div = document.getElementById('messages');
            div.innerHTML += `<p><b>${msg.username}:</b> ${msg.message}</p>`;
        };

        function sendMessage() {
            const username = document.getElementById('username').value;
            const message = document.getElementById('message').value;

            ws.send(JSON.stringify({username, message}));
            document.getElementById('message').value = '';
        }
    </script>
</body>
</html>
```

Run server and open client.html in browser!

### Day 19-20: Redis Integration (4 hours)

**Install redis client:**
```bash
go get github.com/go-redis/redis/v8
```

**Exercise:**

Create `redis-practice/main.go`:
```go
package main

import (
    "context"
    "fmt"
    "time"

    "github.com/go-redis/redis/v8"
)

var ctx = context.Background()

func main() {
    // Connect to Redis
    rdb := redis.NewClient(&redis.Options{
        Addr: "localhost:6379",
        Password: "",
        DB: 0,
    })

    // Test connection
    pong, err := rdb.Ping(ctx).Result()
    fmt.Println(pong, err)

    // Set value
    err = rdb.Set(ctx, "user:1:online", "true", 5*time.Minute).Err()
    if err != nil {
        panic(err)
    }

    // Get value
    val, err := rdb.Get(ctx, "user:1:online").Result()
    if err != nil {
        panic(err)
    }
    fmt.Println("user:1:online =", val)

    // Set with expiration
    rdb.Set(ctx, "session:abc123", "user_data_here", 1*time.Hour)

    // Hash (like map)
    rdb.HSet(ctx, "user:1", "username", "alice")
    rdb.HSet(ctx, "user:1", "karma", 150)

    username := rdb.HGet(ctx, "user:1", "username").Val()
    fmt.Println("Username:", username)
}
```

### Day 21: Practice Day - Combine Everything (2 hours)

Build a simple API that:
- Uses Gin for HTTP
- Stores data in PostgreSQL
- Caches with Redis
- Has WebSocket endpoint

---

## Week 4: Advanced Topics & Project Prep

### Day 22: Error Handling Best Practices (2 hours)

**Topics:**
- Custom error types
- Wrapping errors
- Error handling patterns

**Exercise:**

Create `errors-practice/main.go`:
```go
package main

import (
    "errors"
    "fmt"
)

// Custom error type
type ValidationError struct {
    Field string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

// Function that returns custom error
func validateUsername(username string) error {
    if len(username) < 3 {
        return &ValidationError{
            Field: "username",
            Message: "must be at least 3 characters",
        }
    }
    return nil
}

// Wrapping errors
func processUser(username string) error {
    err := validateUsername(username)
    if err != nil {
        return fmt.Errorf("process user failed: %w", err)
    }
    return nil
}

func main() {
    err := processUser("ab")
    if err != nil {
        fmt.Println("Error:", err)

        // Check if it's a ValidationError
        var ve *ValidationError
        if errors.As(err, &ve) {
            fmt.Printf("Validation failed for field: %s\n", ve.Field)
        }
    }
}
```

### Day 23: Environment Variables & Configuration (2 hours)

**Install godotenv:**
```bash
go get github.com/joho/godotenv
```

**Exercise:**

Create `.env`:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=omninudge_user
DB_PASSWORD=your_password
DB_NAME=omninudge_dev
```

Create `config/main.go`:
```go
package main

import (
    "fmt"
    "log"
    "os"

    "github.com/joho/godotenv"
)

type Config struct {
    DBHost     string
    DBPort     string
    DBUser     string
    DBPassword string
    DBName     string
}

func loadConfig() *Config {
    err := godotenv.Load()
    if err != nil {
        log.Println("No .env file found")
    }

    return &Config{
        DBHost:     getEnv("DB_HOST", "localhost"),
        DBPort:     getEnv("DB_PORT", "5432"),
        DBUser:     getEnv("DB_USER", "postgres"),
        DBPassword: getEnv("DB_PASSWORD", ""),
        DBName:     getEnv("DB_NAME", "omninudge_dev"),
    }
}

func getEnv(key, defaultVal string) string {
    value := os.Getenv(key)
    if value == "" {
        return defaultVal
    }
    return value
}

func main() {
    config := loadConfig()
    fmt.Printf("Config: %+v\n", config)
}
```

### Day 24-26: File I/O and Testing (6 hours)

**Day 24: File Operations**

Create `fileio/main.go`:
```go
package main

import (
    "bufio"
    "fmt"
    "io"
    "os"
)

func writeFile(filename, content string) error {
    return os.WriteFile(filename, []byte(content), 0644)
}

func readFile(filename string) (string, error) {
    data, err := os.ReadFile(filename)
    if err != nil {
        return "", err
    }
    return string(data), nil
}

func appendToFile(filename, content string) error {
    file, err := os.OpenFile(filename, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
    if err != nil {
        return err
    }
    defer file.Close()

    _, err = file.WriteString(content + "\n")
    return err
}

func main() {
    // Write
    writeFile("test.txt", "Hello from Go!")

    // Read
    content, _ := readFile("test.txt")
    fmt.Println("Content:", content)

    // Append
    appendToFile("test.txt", "Another line")

    content, _ = readFile("test.txt")
    fmt.Println("After append:", content)
}
```

**Day 25-26: Writing Tests**

Create `math/math.go`:
```go
package math

func Add(a, b int) int {
    return a + b
}

func Multiply(a, b int) int {
    return a * b
}
```

Create `math/math_test.go`:
```go
package math

import "testing"

func TestAdd(t *testing.T) {
    result := Add(2, 3)
    if result != 5 {
        t.Errorf("Expected 5, got %d", result)
    }
}

func TestMultiply(t *testing.T) {
    tests := []struct {
        a, b, expected int
    }{
        {2, 3, 6},
        {5, 4, 20},
        {0, 10, 0},
    }

    for _, tt := range tests {
        result := Multiply(tt.a, tt.b)
        if result != tt.expected {
            t.Errorf("Multiply(%d, %d) = %d; want %d",
                tt.a, tt.b, result, tt.expected)
        }
    }
}
```

Run tests:
```bash
go test ./math -v
```

### Day 27-28: Final Project - Build a Mini REST API (4 hours)

**Project Requirements:**
- Gin web framework
- PostgreSQL database
- Redis caching
- CRUD operations for "posts"
- Tests for key functions

This solidifies everything before starting the real project.

---

## Go Resources

### Official Documentation
- Go Tour: https://go.dev/tour/
- Go By Example: https://gobyexample.com/
- Effective Go: https://go.dev/doc/effective_go

### Video Courses (Optional)
- FreeCodeCamp Go Course (YouTube): 7-hour comprehensive course
- Tech With Tim Go Tutorial: Beginner-friendly series

### Books (Optional)
- "The Go Programming Language" by Donovan & Kernighan
- "Learning Go" by Jon Bodner

### When You Get Stuck
- Stack Overflow: Search "golang [your error]"
- r/golang on Reddit
- Go Discord: https://discord.gg/golang
- Official Go Forum: https://forum.golangbridge.org/

---

## Month 0 Checklist

By the end of this month, you should be able to:

- [ ] Write basic Go programs
- [ ] Understand Go syntax and idioms
- [ ] Work with structs and interfaces
- [ ] Handle errors properly
- [ ] Use goroutines and channels
- [ ] Build HTTP servers with Gin
- [ ] Connect to PostgreSQL
- [ ] Work with Redis
- [ ] Encode/decode JSON
- [ ] Write tests
- [ ] Read and understand Go code
- [ ] Debug Go programs
- [ ] Use Go modules and packages

**If you can do most of these, you're ready to start building! 🎉**

---

## Next Steps

You've completed Month 0! You now know enough Go to start building the real project.

**Next:** Proceed to `03-months-1-2-reddit-integration.md` to begin actual development.

**Tips Before Starting:**
- Don't aim for perfection - your code will improve as you build
- Google is your friend - every developer searches constantly
- Read error messages carefully - they usually tell you what's wrong
- Take breaks - 2 hours/day is sustainable
- Have fun! You're building something awesome.

Let's start building OmniNudge! 🚀
