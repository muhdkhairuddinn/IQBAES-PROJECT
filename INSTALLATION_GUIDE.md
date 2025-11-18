# IQBAES System Installation Guide

## System Requirements

### Prerequisites
- **Node.js**: Version 18.x or higher
- **MongoDB**: Version 6.0 or higher
- **npm** or **yarn**: Package manager
- **Git**: For cloning the repository (optional)

## Installation Steps

### 1. Install Node.js
Download and install Node.js from [https://nodejs.org/](https://nodejs.org/)
- Recommended: LTS version (18.x or 20.x)
- Verify installation: `node --version`
- Verify npm: `npm --version`

### 2. Install MongoDB
- **Windows**: Download from [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
- **macOS**: `brew install mongodb-community`
- **Linux**: Follow [MongoDB Installation Guide](https://www.mongodb.com/docs/manual/installation/)

Start MongoDB service:
- **Windows**: MongoDB should start as a service automatically
- **macOS/Linux**: `mongod --config /usr/local/etc/mongod.conf` or `sudo systemctl start mongod`

### 3. Clone/Download the Project
```bash
# If using Git
git clone <repository-url>
cd iqbaes-app2

# Or extract downloaded ZIP file
```

### 4. Install Frontend Dependencies
```bash
# Navigate to root directory
cd iqbaes-app2

# Install all frontend dependencies
npm install
```

**Frontend Dependencies:**
```
@google/genai: ^1.11.0          # Google Gemini AI integration
@react-native-async-storage: ^2.2.0  # Async storage for React Native
@vitejs/plugin-react: ^4.7.0     # Vite React plugin
axios: ^1.11.0                   # HTTP client
bcryptjs: ^3.0.2                 # Password hashing
cors: ^2.8.5                     # CORS middleware
dotenv: ^17.2.1                  # Environment variables
expo: ^53.0.20                   # Expo framework
express: ^5.1.0                  # Web framework
jsonwebtoken: ^9.0.2             # JWT tokens
lucide-react: ^0.541.0          # Icon library
mongoose: ^8.16.5                # MongoDB ODM
react: ^19.1.1                   # React library
react-dom: ^19.1.1               # React DOM
socket.io-client: ^4.8.1         # Socket.IO client
uuid: ^11.1.0                    # UUID generator
vite: ^7.0.6                     # Build tool and dev server
```

**Frontend Dev Dependencies:**
```
@types/node: ^22.14.0            # Node.js TypeScript types
typescript: ~5.8.2               # TypeScript compiler
```

### 5. Install Backend Dependencies
```bash
# Navigate to server directory
cd iqbaes-server

# Install all backend dependencies
npm install
```

**Backend Dependencies:**
```
@google/genai: ^0.6.0            # Google Gemini AI
bcryptjs: ^2.4.3                 # Password hashing
cookie-parser: ^1.4.7           # Cookie parsing middleware
cors: ^2.8.5                     # CORS middleware
dotenv: ^16.3.1                  # Environment variables
express: ^4.18.2                 # Web framework
express-rate-limit: ^8.0.1      # Rate limiting middleware
express-validator: ^7.2.1        # Request validation
helmet: ^8.1.0                   # Security headers
jsonwebtoken: ^9.0.2             # JWT tokens
mongoose: ^8.0.3                 # MongoDB ODM
nodemailer: ^7.0.5               # Email service
socket.io: ^4.8.1                # Real-time communication
uuid: ^9.0.1                     # UUID generator
```

**Backend Dev Dependencies:**
```
nodemon: ^3.0.2                  # Auto-restart on file changes
```

### 6. Environment Variables Setup

Create `.env` file in `iqbaes-server/` directory:
```env
# Database
MONGO_URI=mongodb://localhost:27017/iqbaes

# JWT Secrets
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production

# Server Configuration
PORT=5000
NODE_ENV=development

# Google Gemini AI
GEMINI_API_KEY=your-gemini-api-key-here

# Email Configuration (Optional - for password reset)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@iqbaes.com

# CORS (Development)
# For production, update these in server.js
CORS_ORIGIN=http://localhost:5173
```

### 7. Start the Application

**Terminal 1 - Start Backend Server:**
```bash
cd iqbaes-server
npm run dev
# Server will run on http://localhost:5000
```

**Terminal 2 - Start Frontend Dev Server:**
```bash
# From root directory
npm run dev
# Frontend will run on http://localhost:5173
```

### 8. Access the Application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **Network Access**: Use the IP addresses shown in the terminal (e.g., http://192.168.100.23:5173)

## Production Build

### Build Frontend:
```bash
npm run build
# Output will be in dist/ directory
```

### Start Production Server:
```bash
# In iqbaes-server directory
npm start
```

## Quick Install Script

For convenience, you can run these commands in sequence:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd iqbaes-server && npm install && cd ..

# Create .env file (you'll need to fill in the values)
# Copy the .env.example if available, or create new one

# Start development servers (in separate terminals)
# Terminal 1:
cd iqbaes-server && npm run dev

# Terminal 2:
npm run dev
```

## Database Setup

MongoDB will automatically create the database when you first run the application. You can also:

```bash
# Import sample data (if seeder exists)
cd iqbaes-server
npm run data:import

# Check database connection
node check-database.js
```

## Troubleshooting

### Port Already in Use
- Change `PORT` in `.env` file if 5000 is taken
- Change Vite port in `vite.config.ts` if 5173 is taken

### MongoDB Connection Issues
- Ensure MongoDB service is running
- Check `MONGO_URI` in `.env` file
- Verify MongoDB is accessible at specified host/port

### Dependencies Installation Issues
- Clear cache: `npm cache clean --force`
- Delete `node_modules` and `package-lock.json`, then reinstall
- Ensure Node.js version is 18+ or 20+

### Module Not Found Errors
- Run `npm install` in both root and `iqbaes-server/` directories
- Ensure you're in the correct directory when running commands

## Additional Notes

- **Development**: Uses `nodemon` for auto-restart on backend changes
- **Hot Reload**: Vite provides hot module replacement for frontend
- **Network Access**: Vite is configured with `--host` flag to allow network access
- **Security**: Update JWT secrets and email credentials before production use
- **MongoDB**: Ensure MongoDB is running before starting the backend server

