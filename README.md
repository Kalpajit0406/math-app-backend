# Math with SD - Backend API

A Node.js + Express backend for the Math education platform, featuring secure authentication, exam management, and MongoDB integration.

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- Gemini API key (for AI features)

### Installation

1. Clone the repository and navigate to the backend:
```bash
cd math-app-backend
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Edit `.env` with your MongoDB connection details and other secrets:
```env
MONGODB_URI=mongodb://username:password@host1:27017,host2:27017,...
MONGODB_DB_NAME=MathswithSD_DB
JWT_SECRET=your_super_secret_key
GEMINI_API_KEY=your_api_key
```

### MongoDB Connection Setup

The backend supports two MongoDB connection methods:

**Method 1: Direct Replica Set URI (Recommended)**
```
mongodb://username:password@host1:27017,host2:27017,host3:27017/?ssl=true&replicaSet=atlas-2o47ty-shard-0&authSource=admin&appName=Cluster0
```

**Method 2: SRV URI (Fallback)**
```
mongodb+srv://username:password@cluster.mongodb.net/?appName=Cluster0
```

If the primary SRV connection fails (e.g., DNS issues), the system automatically falls back to the direct URI.

### Running the Server

```bash
# Development
npm run start

# The server will:
# - Connect to MongoDB
# - Create performance indexes
# - Listen on PORT (default: 5000)
```

### Database Setup

Optimize and initialize the database:
```bash
npm run optimize:db
```

This will:
- Create performance indexes on Student, Exam, Attempt, etc.
- Normalize missing fields (verified, isRejected, targetClass)
- Audit data integrity

Seed a teacher account for initial admin access:
```bash
npm run seed:teacher
```

## API Architecture

### Authentication Flow (3-tier)

1. **Middleware Layer** (`src/middleware/authMiddleware.js`)
   - Validates Bearer token format
   - Checks JWT expiration
   - Extracts user claims

2. **Role Authorization** (`src/middleware/roleMiddleware.js`)
   - Enforces role-based access (student, teacher, admin)
   - Protects sensitive routes

3. **Service Layer** (`src/services/attemptService.js`, etc.)
   - Ownership validation (students can only see their own attempts)
   - Business logic enforcement (no re-submission after completion)
   - Privilege escalation prevention

### Route Structure

```
GET  /api/v1/student/me                 # Get authenticated user profile
POST /api/v1/student/login              # User login
POST /api/v1/student/signup             # User registration
GET  /api/v1/tests                      # List available exams
POST /api/v1/testResponse/start         # Start an exam attempt
POST /api/v1/testResponse/submit        # Submit exam answers
GET  /api/v1/testResponse/:attemptId    # Get attempt result (own only)
GET  /api/v1/announcements              # Get announcements
POST /api/v1/scan                       # AI scanning (handwritten solutions)
```

## Security Features

### Implemented
- ✅ JWT-based authentication with secure secret management
- ✅ Role-based access control (RBAC) for routes
- ✅ Ownership validation: students can't access others' attempts
- ✅ Re-submission prevention: locked exams after completion
- ✅ Hardcoded credential removal (removed admin backdoor from app)
- ✅ Password hashing with bcrypt

### Best Practices
- Never commit `.env` to version control
- Rotate `JWT_SECRET` periodically in production
- Use HTTPS in production
- Enable MongoDB authentication and encryption
- Monitor failed login attempts

## Database Models

- **Student**: User account with phone, email, password, role (teacher/student)
- **User**: Alternative user collection (optional dual-write)
- **Exam**: Question sets created by teachers
- **Question**: Individual questions with answers
- **Attempt**: Student's exam submission with timestamps, answers, scores
- **Announcement**: Teacher announcements for target classes

## MongoDB Indexes

Key indexes created automatically:
- `Student.studentPhone` (unique)
- `Attempt.userId_examId_createdAt` (for quick lookups)
- `Attempt.userId_examId` with partial filter on active attempts

## Troubleshooting

### MongoDB Connection Error: "bad auth"
- Verify username and password in connection string
- Check that authSource is set to `admin`
- Ensure database user has correct permissions
- Try SRV URI fallback: modify `MONGODB_URI_DIRECT` in `.env`

### MongoDB Connection Error: "querySrv ECONNREFUSED"
- This is a DNS issue in certain networks
- System will automatically try the direct URI
- If needed, skip SRV entirely: comment out `MONGODB_URI` and use only direct URI

### Server won't start
- Check if port 5000 is available: `netstat -ano | findstr :5000` (Windows)
- Verify MongoDB connection string
- Check `.env` file for typos
- Review logs for specific error messages

## Environment Variables Reference

See `.env.example` for all available options:
- `PORT`: Server port (default: 5000)
- `MONGODB_URI`: Primary connection string
- `MONGODB_URI_DIRECT`: Fallback connection string
- `MONGODB_DB_NAME`: Database name
- `JWT_SECRET`: Secret for signing JWTs
- `GEMINI_API_KEY`: Google AI API key
- `MONGODB_MAX_RETRIES`: Connection retry attempts (default: 5)
- `MONGODB_RETRY_DELAY_MS`: Delay between retries (default: 2000ms)

## Development Notes

### Adding New Routes
1. Create controller in `src/controllers/`
2. Create service in `src/services/`
3. Create route file in `src/routes/`
4. Mount route in `src/server.js` at `/api/v1/...`

### Adding New Models
1. Create schema in `src/models/`
2. Add indexes to `optimize_mongodb.js`
3. Run `npm run optimize:db` to create indexes

### Testing Authorization
```bash
# This should fail with 403 (no token):
curl -X GET http://localhost:5000/api/v1/student/me

# This should fail with 401 (invalid token):
curl -H "Authorization: Bearer invalid" http://localhost:5000/api/v1/student/me

# This should fail with 403 (wrong role):
# Login as student, try to access /admin route
```

## Deployment

1. Set production environment variables
2. Use strong JWT_SECRET (32+ characters)
3. Enable HTTPS/TLS
4. Set `NODE_ENV=production`
5. Use process manager (PM2, systemd, etc.)
6. Monitor error logs
7. Set up automated backups for MongoDB

## License

ISC
