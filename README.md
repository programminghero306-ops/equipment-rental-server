# GearHive - Equipment Rental API

## Purpose
REST API for the GearHive equipment rental platform. It handles equipment listings, bookings, Stripe payments, favorites, reviews, user management and dashboard analytics, and it protects every private route with JWT verification and role-based middleware.

## Live links
- Server API: https://equipment-rental-server-murex.vercel.app
- Live site: https://equipment-rental-client.vercel.app
- Client repository: https://github.com/YOUR-GITHUB-USERNAME/equipment-rental-client

## Key features
- JWT verification with the middlewares verifyToken, verifyRenter, verifyOwner and verifyAdmin
- Equipment routes with server-side search, filters, sorting and pagination
- Date-based availability check and server-side price calculation for bookings
- Stripe Checkout sessions, payment confirmation checked directly with Stripe, and a payments collection
- Owner and admin management routes for equipment, users and rentals
- Admin and owner analytics using MongoDB aggregation
- Confirmed bookings become completed automatically after the rental end date

## npm packages (server)
- express
- cors
- dotenv
- mongodb
- jose
- stripe

## Environment variables
Create a file named .env with these names (see .env.example):
- PORT
- MONGODB_URI
- CLIENT_URL
- AUTH_URL
- STRIPE_SECRET_KEY

## Run locally
    npm install
    node index.js

The API runs at http://localhost:5000
