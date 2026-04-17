# Flow Profiling

## Overview
This document profiles the main user and approval flows in the Brader Real Estate platform.

The system is role-driven:
- Buyer discovers properties, sends inquiries, requests appointments, reservations, and payments.
- Seller and Agent manage their own listings and respond to buyer activity.
- Clerk supports verification, appointments, and payment operations.
- Administrator has the highest approval authority across the platform.

## Core Flow
1. User registers as buyer, seller, agent, or clerk.
2. Account is created immediately.
3. The user logs in and gets routed based on role.
4. Role permissions control which dashboard sections and actions are available.
5. Certain actions enter an approval or review step before becoming active.

## Approval Ownership
- Administrator: approves or rejects any user verification and all listing approvals.
- Agent: can verify or reject buyer and seller accounts only.
- Clerk: can verify or reject buyer and seller accounts only.
- Property owner or administrator: handles reservation confirmation.
- Seller, clerk, or administrator: handles payment review/status updates.

## Main Workflows

### 1. Registration and Login
- User opens the registration page.
- User selects a public role.
- Backend creates the account.
- User logs in and receives authenticated access.

### 2. User Verification
- User uploads verification documents from profile.
- Status becomes pending.
- Administrator receives notification.
- Administrator approves or rejects any user.
- Agent and clerk can only review buyer/seller accounts.
- User receives the verification result.

### 3. Property Listing Lifecycle
- Seller or agent creates a listing.
- Non-admin listings usually start as pending approval.
- Administrator reviews the listing.
- Listing is approved or rejected.
- Approved listings become visible to buyers.

### 4. Inquiry Flow
- Buyer sends an inquiry on a property.
- Property owner receives it.
- Owner replies through the dashboard or API.
- Admin and clerk can oversee inquiries.

### 5. Appointment Flow
- Buyer requests an appointment.
- Assigned property owner or agent receives it.
- Appointment status changes through pending, confirmed, cancelled, or completed.
- Admin or clerk may also manage appointment operations depending on role rules.

### 6. Reservation Flow
- Buyer requests a reservation for an approved property.
- System checks ownership, approval status, and lock rules.
- Property owner or administrator confirms the reservation.
- Reservation can be cancelled or completed by authorized roles.
- Buyer receives the final reservation status.

### 7. Payment Flow
- Buyer submits payment for a property.
- Seller, clerk, or administrator reviews the payment.
- Payment status is updated.
- Buyer is notified of the decision or progress.
- Refund actions remain administrator-only.

### 8. Favorites Flow
- Buyer saves a property to favorites.
- Buyer can remove it later.
- No approval is needed for favorites.

### 9. Dispute Flow
- Authenticated user files a dispute.
- Administrator receives the case.
- Administrator investigates and updates the dispute status.
- Reporter gets notified of the outcome.

## Role Matrix

| Role | Main Responsibilities | Can Approve |
| --- | --- | --- |
| Administrator | Full governance, approvals, audit, system control | Any user verification, listing approval, reservation confirmation, payment review |
| Agent | Own listings, inquiries, appointments | Buyer and seller verification only |
| Seller | Own listings, buyer communication, payment coordination | No global approval rights |
| Buyer | Browse, inquire, reserve, pay, favorite | No approval rights |
| Clerk | Verification support, appointments, payment coordination | Buyer and seller verification only |

## User Profiling 

### 1. Buyer Profile
- Goal: find properties, ask questions, book visits, reserve a unit, and track payments.
- Main actions: browse listings, save favorites, send inquiries, request appointments, and submit reservations.
- Approval needs: none for browsing or favorites; reservation and payment actions depend on property and role rules.
- Typical flow: search property -> open details -> save or inquire -> request appointment -> reserve if interested.

### 2. Seller Profile
- Goal: publish owned properties and manage buyer interest.
- Main actions: create listings, update listing details, respond to inquiries, manage appointments, and monitor reservation/payment status.
- Approval needs: listing usually goes through administrator review before becoming public.
- Typical flow: create listing -> wait for approval -> receive inquiries -> coordinate with buyers.

### 3. Administrator Profile
- Goal: oversee the entire system and enforce platform rules.
- Main actions: approve or reject listings, verify users, manage users, review disputes, and monitor audit logs.
- Approval needs: this role is the highest approval authority in the system.
- Typical flow: review pending items -> approve or reject -> notify the relevant user.

## Simplified End-to-End View
- Buyer acts on a property.
- Seller or agent receives the action.
- Clerk may support operational review.
- Administrator has final approval authority where required.

## Notes
- Signup is not the same as approval.
- Approval happens later for workflows that need review.
- The strictest approval path is always administrator-level.
