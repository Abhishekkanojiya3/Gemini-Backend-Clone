# Gemini Backend Clone

A Node.js backend system that mimics Gemini's functionality with user authentication, chatroom management, AI-powered conversations, and subscription handling.

## Features

- **OTP-based Authentication**: Phone number login with JWT tokens
- **Chatroom Management**: Create and manage multiple chatrooms
- **AI Integration**: Google Gemini API for AI responses
- **Subscription System**: Basic (limited) and Pro (unlimited) tiers via Stripe
- **Message Queue**: Asynchronous AI response processing with BullMQ
- **Rate Limiting**: Daily usage limits for basic tier users
- **Caching**: Redis caching for improved performance

## Tech Stack

- **Framework**: Node.js with Express
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: BullMQ with Redis
- **Authentication**: JWT with OTP verification
- **Payment**: Stripe (sandbox mode)
- **AI**: Google Gemini API

## Installation

1. Clone the repository
```bash
git clone <repository-url>
cd gemini-backend
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
Create a `.env` file in the root directory with the following variables:

```env
PORT=5000
DATABASE_URL=postgresql://username:password@localhost:5432/geminiclonedb
JWT_SECRET=your_jwt_secret_key
REDIS_URL=redis://your_redis_url
GEMINI_API_KEY=your_gemini_api_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
STRIPE_API_VERSION=2025-06-30.basil
BASIC_DAILY_LIMIT=20
STRIPE_SUCCESS_URL=http://localhost:5000/payment-success/stripe
STRIPE_CANCEL_URL=http://localhost:5000/payment-cancel/stripe
```

4. Set up the database
```bash
npx prisma generate
npx prisma db push
```

## Running the Application

### Development Mode

Start the main server:
```bash
npm run dev
```

Start the worker process (in a separate terminal):
```bash
npm run worker
```

The server will run on `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/send-otp` - Send OTP to phone number
- `POST /api/auth/verify-otp` - Verify OTP and get JWT token
- `POST /api/auth/signup` - Complete user registration
- `POST /api/auth/forgot-password` - Send OTP for password reset
- `POST /api/auth/change-password` - Change user password
- `GET /api/user/me` - Get current user details

### Chatroom Management
- `POST /api/chatroom` - Create new chatroom
- `GET /api/chatroom` - List all user chatrooms (cached)
- `GET /api/chatroom/:id` - Get chatroom details with messages
- `POST /api/chatroom/:id/message` - Send message and get AI response

### Subscription
- `POST /api/subscribe/pro` - Initiate Pro subscription
- `GET /api/subscription/status` - Get current subscription status
- `POST /api/webhook/stripe` - Handle Stripe webhooks

## Architecture

### Message Queue System
- Uses BullMQ for asynchronous processing of AI responses
- Worker processes handle Gemini API calls separately from main server
- Ensures scalability and prevents blocking on AI response generation

### Caching Strategy
- Redis caching implemented for chatroom listings
- Cache TTL: 5 minutes for chatroom lists
- Improves performance for frequently accessed data

### Rate Limiting
- Basic tier users: 20 prompts per day
- Pro tier users: Unlimited usage
- Daily usage tracking with PostgreSQL

## Database Schema

- **Users**: Store user information and authentication data
- **Chatrooms**: User-specific chat containers
- **Messages**: Chat messages with user/AI roles
- **Subscriptions**: Stripe subscription management
- **DailyUsage**: Track daily API usage for rate limiting

## Development Notes

- The server uses ES6 modules (`"type": "module"` in package.json)
- Prisma is used for database ORM with PostgreSQL
- Redis is required for both caching and message queuing
- Stripe webhooks handle subscription status updates
- OTP is returned in API response (no actual SMS integration)

## Testing

Use the provided Postman collection to test all endpoints. Ensure you:
1. Start both main server and worker processes
2. Set up proper environment variables
3. Use JWT tokens in Authorization headers where required
