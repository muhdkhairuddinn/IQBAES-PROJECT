# IQBAES System - Complete Dependencies List

## System Prerequisites
- **Node.js**: >= 18.0.0 (LTS recommended)
- **MongoDB**: >= 6.0.0
- **npm**: >= 9.0.0 or **yarn**: >= 1.22.0

---

## Frontend Dependencies (Root package.json)

### Production Dependencies
```json
{
  "@google/genai": "^1.11.0",
  "@react-native-async-storage/async-storage": "^2.2.0",
  "@vitejs/plugin-react": "^4.7.0",
  "axios": "^1.11.0",
  "bcryptjs": "^3.0.2",
  "cors": "^2.8.5",
  "dotenv": "^17.2.1",
  "expo": "^53.0.20",
  "express": "^5.1.0",
  "jsonwebtoken": "^9.0.2",
  "lucide-react": "^0.541.0",
  "mongoose": "^8.16.5",
  "react": "^19.1.1",
  "react-dom": "^19.1.1",
  "socket.io-client": "^4.8.1",
  "uuid": "^11.1.0",
  "vite": "^7.0.6"
}
```

### Development Dependencies
```json
{
  "@types/node": "^22.14.0",
  "typescript": "~5.8.2",
  "vite": "^6.2.0"
}
```

---

## Backend Dependencies (iqbaes-server/package.json)

### Production Dependencies
```json
{
  "@google/genai": "^0.6.0",
  "bcryptjs": "^2.4.3",
  "cookie-parser": "^1.4.7",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "express": "^4.18.2",
  "express-rate-limit": "^8.0.1",
  "express-validator": "^7.2.1",
  "helmet": "^8.1.0",
  "jsonwebtoken": "^9.0.2",
  "mongoose": "^8.0.3",
  "nodemailer": "^7.0.5",
  "socket.io": "^4.8.1",
  "uuid": "^9.0.1"
}
```

### Development Dependencies
```json
{
  "nodemon": "^3.0.2"
}
```

---

## Quick Installation Commands

### Option 1: Install Everything at Once
```bash
# Frontend
npm install

# Backend
cd iqbaes-server && npm install && cd ..
```

### Option 2: Manual Installation

**Frontend:**
```bash
npm install @google/genai@^1.11.0 @react-native-async-storage/async-storage@^2.2.0 @vitejs/plugin-react@^4.7.0 axios@^1.11.0 bcryptjs@^3.0.2 cors@^2.8.5 dotenv@^17.2.1 expo@^53.0.20 express@^5.1.0 jsonwebtoken@^9.0.2 lucide-react@^0.541.0 mongoose@^8.16.5 react@^19.1.1 react-dom@^19.1.1 socket.io-client@^4.8.1 uuid@^11.1.0 vite@^7.0.6
```

**Backend:**
```bash
cd iqbaes-server
npm install @google/genai@^0.6.0 bcryptjs@^2.4.3 cookie-parser@^1.4.7 cors@^2.8.5 dotenv@^16.3.1 express@^4.18.2 express-rate-limit@^8.0.1 express-validator@^7.2.1 helmet@^8.1.0 jsonwebtoken@^9.0.2 mongoose@^8.0.3 nodemailer@^7.0.5 socket.io@^4.8.1 uuid@^9.0.1
npm install --save-dev nodemon@^3.0.2
```

---

## Dependency Purposes

### Core Framework
- **express**: Web server framework
- **react**: UI library
- **mongoose**: MongoDB object modeling
- **socket.io**: Real-time bidirectional communication

### Authentication & Security
- **jsonwebtoken**: JWT token generation/verification
- **bcryptjs**: Password hashing
- **helmet**: Security headers
- **express-rate-limit**: Brute force protection
- **cors**: Cross-origin resource sharing

### AI Integration
- **@google/genai**: Google Gemini AI API client

### Utilities
- **dotenv**: Environment variable management
- **axios**: HTTP client
- **uuid**: Unique ID generation
- **cookie-parser**: Cookie parsing
- **express-validator**: Request validation

### Build & Development
- **vite**: Fast build tool and dev server
- **typescript**: Type-safe JavaScript
- **nodemon**: Auto-restart server on changes

### Communication
- **socket.io-client**: Frontend WebSocket client
- **nodemailer**: Email sending

---

## Environment Variables Required

Create `iqbaes-server/.env`:
```
MONGO_URI=mongodb://localhost:27017/iqbaes
JWT_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-key-here
PORT=5000
NODE_ENV=development
GEMINI_API_KEY=your-gemini-api-key
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

---

## Installation Verification

After installation, verify:
```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Check MongoDB
mongod --version  # Should be >= 6.0.0

# Verify installations
cd iqbaes-server && npm list --depth=0
cd .. && npm list --depth=0
```

