# Hermione Server - Volunteer Event Management Platform API

 Robust, high-performance RESTful API backend powering the **Hermione Volunteer Event Management Platform**. Built with Express 5, MongoDB native driver, and stateless JWT authentication validated via Better Auth JWKS.

---

## Table of Contents

- [Overview](#-overview)
- [Key Features](#-features)
- [Tech Stack](#-tech-stack)
- [Database Architecture](#-database-architecture)
- [Environment Variables](#-environment-variables)
- [Getting Started / Installation](#-getting-started--installation)
- [API Endpoints Overview](#-api-endpoints-overview)
- [Deployment](#-deployment)
- [Author](#-author)

---

## Overview

**Hermione Server** is the core backend service for the Cat Hermione Volunteer Event Management application. It facilitates end-to-end community engagement, event discovery, slot-based participant enrollment, and organizer administrative workflows.

Engineered with asynchronous non-blocking I/O using ES Modules, the backend integrates stateless, cryptographic token verification directly with remote JSON Web Key Sets (JWKS), ensuring zero-dependency decoupled authentication with client applications.

---

## Features

- **Stateless JWKS Authentication & Authorization**
  - Remote cryptographic JWT validation using `jose` (`createRemoteJWKSet` & `jwtVerify`).
  - Seamless integration with frontend [Better Auth](https://www.better-auth.com/) authentication endpoints (`/api/auth/jwks`).
  - Role & identity guards preventing unauthorized access to sensitive operations.

- **Event Lifecycle Management**
  - Full CRUD capabilities for volunteer events (title, event type, date, location, banner image, description).
  - Organizer-scoped access control ensuring only owners can edit or delete their events.
  - Automatic cascade deletion: removing an event clears all associated participant registrations.

- **Participant Spot Tracking & Real-Time Capacity Control**
  - Strict tiered event participant caps (`3`, `10`, or `25` slots).
  - MongoDB compound unique indexing (`{ eventId: 1, email: 1 }`) guaranteeing atomic duplicate prevention.
  - Handles concurrent joins and returns real-time slot vacancy counts via MongoDB aggregation pipelines.
  - Ownership rule validation: event creators are prohibited from joining their own events.

- **User Profile Management**
  - Dedicated endpoint to sync and update user profile data (`name`, verified `image` URL) with real-time persistence.

- **API Security & Robustness**
  - Dynamic Cross-Origin Resource Sharing (CORS) restricted to verified frontend domains.
  - MongoDB ObjectId validation safeguards preventing unhandled BSON casting errors.
  - Comprehensive error handling with structured, meaningful JSON responses.

- **Serverless-Ready Architecture**
  - Configured for zero-cold-start deployment on Vercel while supporting standalone local Node.js runtime environments.

---

## Tech Stack

| Layer | Technology | Description |
| --- | --- | --- |
| **Runtime** | [Node.js](https://nodejs.org/) (ES Modules) | Asynchronous event-driven JavaScript execution |
| **Framework** | [Express 5](https://expressjs.com/) | Next-generation web application routing framework |
| **Database** | [MongoDB Atlas](https://www.mongodb.com/atlas) | Scalable cloud NoSQL document database |
| **DB Driver** | [mongodb](https://www.npmjs.com/package/mongodb) (v7) | Official native high-performance MongoDB driver |
| **Security & JWT** | [jose](https://github.com/panva/jose) (v6) | Cryptographic JWKS & JWT verification |
| **Environment** | [dotenv](https://www.npmjs.com/package/dotenv) | Environment variable management |
| **CORS** | [cors](https://www.npmjs.com/package/cors) | Whitelisted cross-origin request handling |
| **Dev Tools** | [nodemon](https://nodemon.io/) | Auto-reloading development server |
| **Hosting** | [Vercel](https://vercel.com/) | Serverless functions deployment target |

---

## Environment Variables

To run this backend locally, configure a `.env` file in the root directory. Below are the required and optional keys:

| Variable | Required | Description | Example |
| --- | --- | --- | --- |
| `DB_USER` | **Yes** | MongoDB Atlas cluster username | `hermione_admin` |
| `DB_PASS` | **Yes** | MongoDB Atlas cluster password | `your_secure_password` |
| `FRONTEND_URL` | **Yes** | Client application origin for CORS allowance | `http://localhost:3000` or `https://b14-a08-cat-hermione.vercel.app` |
| `FRONTEND_JWKS_URL` | **Yes** | Base URL providing `/api/auth/jwks` for token verification | `http://localhost:3000` or `https://b14-a08-cat-hermione.vercel.app` |
| `PORT` | No | Port on which the local server listens (Default: `5000`) | `5000` |
| `NODE_ENV` | No | Server environment mode (`development` / `production`) | `development` |

### Sample `.env` Template

```env
# MongoDB Atlas Credentials
DB_USER=your_db_username
DB_PASS=your_db_password

# Client URLs (CORS & JWKS Endpoint)
FRONTEND_URL=http://localhost:3000
FRONTEND_JWKS_URL=http://localhost:3000

# Optional Configuration
PORT=5000
NODE_ENV=development
```

---

## Getting Started / Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- A running [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

### Local Setup Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/iyiu9akhan/B14-A08-Cat-Hermione-Server.git
   cd B14-A08-Cat-Hermione-Server
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the project root:
   ```bash
   cp .env.example .env   # Or create .env manually
   ```
   Fill in the required keys with your actual MongoDB credentials and frontend URL.

4. **Run the server:**

   *Using nodemon (auto-reloading on file change):*
   ```bash
   npx nodemon index.js
   ```

   *Using standard Node:*
   ```bash
   node index.js
   ```

5. **Verify the server is running:**
   Open [http://localhost:5000](http://localhost:5000) in your browser or test via curl:
   ```bash
   curl http://localhost:5000/
   # Output: Hermione Server is running live!
   ```

---

## API Endpoints Overview

All protected routes expect a valid JSON Web Token passed in the HTTP Authorization header:  
`Authorization: Bearer <JWT_TOKEN>`

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/` | Health check endpoint returning server status | **No** (Public) |
| `GET` | `/events` | Fetch all events with aggregated participant counts | **No** (Public) |
| `GET` | `/events/:id` | Fetch single event details and check if current user joined (`x-user-email` header) | **No** (Public) |
| `POST` | `/events` | Create a new volunteer event (accepts `3`, `10`, or `25` max participants) | **Yes** (Bearer Token) |
| `PATCH` | `/events/:id` | Update event information (restricted to event organizer) | **Yes** (Bearer Token) |
| `DELETE` | `/events/:id` | Delete an event and its associated participant records (organizer only) | **Yes** (Bearer Token) |
| `GET` | `/events/manage/:email` | Get all events organized by the authenticated user | **Yes** (Bearer Token) |
| `POST` | `/events/:id/join` | Register / join an event (enforces capacity limits & owner restrictions) | **Yes** (Bearer Token) |
| `DELETE` | `/events/:id/join` | Unregister / leave an event | **Yes** (Bearer Token) |
| `GET` | `/events/joined/:email` | Retrieve list of all events joined by the authenticated user | **Yes** (Bearer Token) |
| `PATCH` | `/users/profile` | Update user profile details (`name`, valid `image` URL) | **Yes** (Bearer Token) |

---

## Deployment

The project is structured to deploy smoothly on **Vercel** serverless functions via [`vercel.json`](./vercel.json):

```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ]
}
```

When deployed to production, `NODE_ENV=production` ensures the server exports the Express app instance rather than binding to a local port, allowing Vercel's edge network to route requests directly.

---

## Author

Developed by **[Muhammad Sameer Khan](https://iyiu9akhan.vercel.app/)** ([@iyiu9akhan](https://github.com/iyiu9akhan)).

