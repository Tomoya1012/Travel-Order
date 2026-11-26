# Municipality of Anda — Online Travel Order System

An Online Travel Order Management System built for the **Municipality of Anda, Pangasinan, Philippines**.

## Overview

This web application streamlines the submission, review, approval, and printing of official Travel Orders:

- **Online Application:** Applicants select the approving authority (Municipal Mayor or Municipal Vice Mayor) and submit their travel details online.
- **Application Tracking:** Applicants can check their application status using their name or tracking link and print approved Travel Orders directly from their browser.
- **HR / Admin Review:** Authorized personnel review, verify, request corrections, or approve/reject applications, with automatic sequential Travel Order numbering and printable official templates.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, CSS
- **Backend / Database:** Supabase
- **Deployment:** Vercel / Netlify

## Getting Started

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and configure your environment variables (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```

## Deployment

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your hosting provider's environment settings (Vercel or Netlify) and deploy the Vite build (`dist`).
